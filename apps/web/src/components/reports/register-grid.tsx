import { formatDate, formatTaka, pick, type CollectionRegister, type Locale, type RegisterRow } from "@s57/shared";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "cn";

type Day = CollectionRegister["days"][number];
type Amounts = Record<string, string>;

/** What the screen table, the phone cards and the print share: labels and cell contents. */
export async function registerParts(report: CollectionRegister, locale: Locale) {
  const t = await getTranslations("Reports.collectionRegister");
  const money = (amount: string | undefined) => (amount && amount !== "0.00" ? formatTaka(amount, locale) : "–");
  const columns = report.columns.map((column) => ({
    key: column.key,
    name: column.kind === "donation" ? t("col.donation") : pick(column.nameBn ?? "", column.nameEn, locale),
  }));
  const levels = report.levels.map((level) => pick(level.nameBn, level.nameEn, locale));
  const payer = (row: RegisterRow): ReactNode => {
    const role = row.role ? t(`role.${row.role}`) : null;
    const months = row.months.map((month) => formatDate(`${month}-01`, locale, "month")).join(" + ");
    // No payer name: the role stands in for it, so it isn't repeated after the months.
    const name = row.payer ?? role ?? "–";
    return (
      <>
        {name}
        {months ? ` · ${months}` : null}
        {row.payer && role ? <span className="text-muted-foreground"> · {role}</span> : null}
        {row.void ? <span className="ml-1.5 text-[0.9em] font-semibold text-bad">{t("voidMark")}</span> : null}
      </>
    );
  };
  const receipt = (row: RegisterRow) =>
    row.role ? (
      <Link href={`/dashboard/collect/receipts/${row.id}`} className="font-mono text-primary">
        {row.receiptNo}
      </Link>
    ) : (
      <span className="font-mono">{row.receiptNo}</span>
    );
  const struck = (row: RegisterRow) => row.void && "text-muted-foreground line-through";
  const dayLabel = (day: Day) => formatDate(day.day, locale, "short");
  return { t, money, columns, levels, payer, receipt, struck, dayLabel };
}

const STYLE = {
  screen: {
    th: "border-b border-line bg-surface-2 px-3 py-2.5 text-[12.5px] font-semibold text-muted-foreground",
    td: "border-b border-line px-3 py-2.5",
    dayTotal: "bg-good-soft text-good",
    monthTotal: "bg-primary text-primary-foreground",
    date: "",
  },
  // The print portal restates only the brand tokens (globals.css), so print uses those.
  print: {
    th: "border-b border-line bg-accent px-2 py-1.5 text-[8pt] font-bold tracking-[0.06em] text-primary uppercase",
    td: "border-b border-line px-2 py-1.5",
    dayTotal: "bg-accent text-primary",
    monthTotal: "bg-primary text-white",
    date: "bg-surface-2",
  },
} as const;

/**
 * The register as one table (mockups `sector57-collection-register.png` and `-a4.png`): the
 * date spans its day's rows, a tinted day total closes each day and the month total closes
 * the table. Voided receipts are struck through; the totals never count them.
 */
export async function RegisterGrid({ report, locale, variant = "screen" }: { report: CollectionRegister; locale: Locale; variant?: keyof typeof STYLE }) {
  const { t, money, columns, levels, payer, receipt, struck, dayLabel } = await registerParts(report, locale);
  const style = STYLE[variant];
  const th = cn(style.th, "text-left whitespace-nowrap");
  const td = cn(style.td, "whitespace-nowrap");
  const sums = (amounts: Amounts, total: string, cell: string) => (
    <>
      {columns.map((column) => (
        <td key={column.key} className={cn(cell, "num text-right")}>
          {money(amounts[column.key])}
        </td>
      ))}
      <td className={cn(cell, "num text-right")}>{money(total)}</td>
    </>
  );

  return (
    <table className={cn("w-full border-collapse", variant === "screen" ? "text-[13.5px]" : "text-[9pt]")}>
      <caption className="sr-only">{t("title")}</caption>
      <thead>
        <tr>
          <th scope="col" className={th}>
            {t("col.date")}
          </th>
          <th scope="col" className={th}>
            {t("col.payer")}
          </th>
          {levels.map((level, i) => (
            <th key={report.levels[i]!.id} scope="col" className={cn(th, "text-center")}>
              {level}
            </th>
          ))}
          <th scope="col" className={th}>
            {t("col.receipt")}
          </th>
          {columns.map((column) => (
            <th key={column.key} scope="col" className={cn(th, "text-right")}>
              {column.name}
            </th>
          ))}
          <th scope="col" className={cn(th, "text-right")}>
            {t("col.total")}
          </th>
        </tr>
      </thead>
      {report.days.map((day) => (
        <tbody key={day.day}>
          {day.rows.map((row, i) => (
            <tr key={row.id} className={cn(struck(row))}>
              {i === 0 ? (
                <th scope="rowgroup" rowSpan={day.rows.length + 1} className={cn(td, "border-r text-left align-top font-semibold", style.date)}>
                  {dayLabel(day)}
                </th>
              ) : null}
              <td className={td}>{payer(row)}</td>
              {row.places.map((place, p) => (
                <td key={report.levels[p]?.id ?? p} className={cn(td, "text-center")}>
                  {place ?? "–"}
                </td>
              ))}
              <td className={td}>{receipt(row)}</td>
              {columns.map((column) => (
                <td key={column.key} className={cn(td, "num text-right")}>
                  {money(row.amounts[column.key])}
                </td>
              ))}
              <td className={cn(td, "num text-right font-semibold")}>{money(row.total)}</td>
            </tr>
          ))}
          <tr className={cn("font-semibold", style.dayTotal)}>
            <td colSpan={levels.length + 2} className={cn(td, "text-right")}>
              {t("dayTotal", { count: day.receipts })}
            </td>
            {sums(day.amounts, day.total, td)}
          </tr>
        </tbody>
      ))}
      {/* A tbody, not a tfoot: printers repeat a tfoot on every page. */}
      <tbody>
        <tr className={cn("font-semibold", style.monthTotal)}>
          <th scope="row" colSpan={levels.length + 3} className={cn(style.td, "border-b-0 text-left")}>
            {t("monthTotal")}
          </th>
          {sums(report.totals.amounts, report.totals.total, cn(style.td, "border-b-0 whitespace-nowrap"))}
        </tr>
      </tbody>
    </table>
  );
}
