import type { CollectionRegister, Locale } from "@s57/shared";
import { cn } from "cn";
import { RegisterGrid, registerParts } from "./register-grid";

/**
 * The register on screen: from 600px up the bordered table (`RegisterGrid`); on phones each
 * day is a card of receipts with its day total, and the month total closes the list.
 */
export async function RegisterTable({ report, locale }: { report: CollectionRegister; locale: Locale }) {
  const { t, money, columns, levels, payer, receipt, struck, dayLabel } = await registerParts(report, locale);

  if (report.days.length === 0) {
    return <div className="rounded-[12px] border border-line bg-surface p-4 text-muted-foreground">{t("empty")}</div>;
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-[12px] border border-line bg-surface min-[600px]:block">
        <RegisterGrid report={report} locale={locale} />
      </div>

      <div className="grid gap-2.5 min-[600px]:hidden">
        {report.days.map((day) => (
          <section key={day.day} aria-label={dayLabel(day)} className="rounded-[12px] border border-line bg-surface">
            <h3 className="border-b border-line px-3.5 py-2.5 text-[14px] font-semibold">{dayLabel(day)}</h3>
            <ul>
              {day.rows.map((row) => (
                <li key={row.id} className={cn("grid gap-1 border-b border-line px-3.5 py-2.5 text-[13.5px]", struck(row))}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">{payer(row)}</span>
                    <b className="num shrink-0">{money(row.total)}</b>
                  </div>
                  <div className="flex flex-wrap gap-x-3 text-[12.5px] text-muted-foreground">
                    {receipt(row)}
                    <span>{row.places.map((place, p) => (place ? `${levels[p]} ${place}` : null)).filter(Boolean).join(" · ")}</span>
                    {columns.map((column) =>
                      row.amounts[column.key] ? (
                        <span key={column.key}>
                          {column.name} <span className="num">{money(row.amounts[column.key])}</span>
                        </span>
                      ) : null,
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex justify-between gap-3 rounded-b-[12px] bg-good-soft px-3.5 py-2.5 text-[13.5px] font-semibold text-good">
              <span>{t("dayTotal", { count: day.receipts })}</span>
              <span className="num">{money(day.total)}</span>
            </div>
          </section>
        ))}
        <div className="flex justify-between gap-3 rounded-[12px] bg-primary px-3.5 py-3 font-semibold text-primary-foreground">
          <span>{t("monthTotal")}</span>
          <span className="num">{money(report.totals.total)}</span>
        </div>
      </div>
    </>
  );
}
