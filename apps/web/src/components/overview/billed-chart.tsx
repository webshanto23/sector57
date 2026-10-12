import { chartScale, formatDate, formatNumber, formatTaka, type Locale, type Overview } from "@s57/shared";
import { getTranslations } from "next-intl/server";

type Month = NonNullable<Overview["months"]>[number];

const W = 520;
const H = 230;
const PAD = { left: 40, right: 14, top: 22, bottom: 30 };

/**
 * Mockup `chartSVG()`: billed (grey) and collected (accent) bars per month, inline SVG in the
 * token colours. A series the user may not see is left out. The figures are also listed for
 * screen readers.
 */
export async function BilledChart({ months, locale }: { months: Month[]; locale: Locale }) {
  const t = await getTranslations("Overview.chart");
  const amounts = months.flatMap((row) => [row.billed, row.collected].filter((value): value is string => value !== null));
  const scale = chartScale(amounts);
  const y = (units: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - units / scale.top);
  const band = (W - PAD.left - PAD.right) / months.length;
  const both = months.some((row) => row.billed !== null) && months.some((row) => row.collected !== null);
  const barWidth = both ? 14 : 22;
  const ticks = [0, 1, 2, 3].map((i) => i * scale.step);
  const tick = (units: number) => formatNumber(Number.isInteger(units) ? units : units.toFixed(1), locale);
  const label = (month: string) => formatDate(`${month}-01`, locale, "month");
  const last = months.at(-1);
  const lastValue = last?.collected ?? last?.billed ?? null;

  const bar = (value: string | null, x: number, className: string) => {
    if (value === null) return null;
    const top = y(scale.toUnits(value));
    return <rect x={x} y={top} width={barWidth} height={Math.max(0, y(0) - top)} rx={3} className={className} />;
  };

  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base min-[600px]:text-lg">{t("title")}</h2>
        <span className="text-[12.5px] text-muted-foreground">{t(`unit.${scale.unit}`)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden>
        {ticks.map((value) => (
          <g key={value}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(value)} y2={y(value)} strokeWidth={1} className="stroke-line" />
            <text x={PAD.left - 6} y={y(value) + 4} textAnchor="end" fontSize={13} className="fill-muted-foreground">
              {tick(value)}
            </text>
          </g>
        ))}
        {months.map((row, i) => {
          const center = PAD.left + band * i + band / 2;
          const billedX = both ? center - barWidth - 1 : center - barWidth / 2;
          const collectedX = both ? center + 1 : center - barWidth / 2;
          return (
            <g key={row.month}>
              {bar(row.billed, billedX, "fill-line")}
              {bar(row.collected, collectedX, "fill-primary")}
              <text x={center} y={H - 8} textAnchor="middle" fontSize={13.5} className="fill-muted-foreground">
                {label(row.month)}
              </text>
            </g>
          );
        })}
        {last && lastValue !== null ? (
          <text
            x={PAD.left + band * (months.length - 1) + band / 2 + (both ? barWidth / 2 + 1 : 0)}
            y={y(scale.toUnits(lastValue)) - 6}
            textAnchor="middle"
            fontSize={13.5}
            fontWeight={700}
            className={last.collected !== null ? "fill-primary" : "fill-muted-foreground"}
          >
            {tick(Math.round(scale.toUnits(lastValue) * 10) / 10)}
          </text>
        ) : null}
      </svg>
      <div className="flex flex-wrap gap-3.5 text-[12.5px] text-muted-foreground">
        {months.some((row) => row.billed !== null) ? (
          <span className="inline-flex items-center gap-1.5">
            <i className="size-2.5 rounded-[3px] bg-line" aria-hidden />
            {t("billed")}
          </span>
        ) : null}
        {months.some((row) => row.collected !== null) ? (
          <span className="inline-flex items-center gap-1.5">
            <i className="size-2.5 rounded-[3px] bg-primary" aria-hidden />
            {t("collected")}
          </span>
        ) : null}
      </div>
      <ul className="sr-only">
        {months.map((row) => (
          <li key={row.month}>
            {t("row", {
              month: formatDate(`${row.month}-01`, locale, "monthYear"),
              billed: row.billed === null ? "–" : formatTaka(row.billed, locale),
              collected: row.collected === null ? "–" : formatTaka(row.collected, locale),
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}
