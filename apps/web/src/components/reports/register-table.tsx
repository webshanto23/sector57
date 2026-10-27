import { formatDate, formatTaka, pick, type CollectionRegister, type Locale, type RegisterRow } from "@s57/shared";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "cn";

type Day = CollectionRegister["days"][number];
type Amounts = Record<string, string>;

const th = "border-b border-line bg-surface-2 px-3 py-2.5 text-left text-[12.5px] font-semibold whitespace-nowrap text-muted-foreground";
const td = "border-b border-line px-3 py-2.5 whitespace-nowrap";

/**
 * The register, day by day (mockup `sector57-collection-register.png`). From 600px up it is
 * one table: the date spans its day's rows, a tinted day total closes each day and the month
 * total closes the table. On phones each day is a card of receipts. Voided receipts are
 * struck through; the totals never count them.
 */
export async function RegisterTable({ report, locale }: { report: CollectionRegister; locale: Locale }) {
  const t = await getTranslations("Reports.collectionRegister");
  const money = (amount: string | undefined) => (amount && amount !== "0.00" ? formatTaka(amount, locale) : "–");
  const columns = report.columns.map((column) => ({
    key: column.key,
    name: column.kind === "donation" ? t("col.donation") : pick(column.nameBn ?? "", column.nameEn, locale),
  }));
  const levels = report.levels.map((level) => pick(level.nameBn, level.nameEn, locale));

  if (report.days.length === 0) {
    return <div className="rounded-[12px] border border-line bg-surface p-4 text-muted-foreground">{t("empty")}</div>;
  }

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
        {row.void ? <span className="ml-1.5 text-[12px] font-semibold text-bad">{t("voidMark")}</span> : null}
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
  const label = (day: Day) => formatDate(day.day, locale, "short");

  return (
    <>
      <div className="hidden overflow-x-auto rounded-[12px] border border-line bg-surface min-[600px]:block">
        <table className="w-full border-collapse text-[13.5px]">
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
                    <th scope="rowgroup" rowSpan={day.rows.length + 1} className={cn(td, "border-r align-top font-semibold")}>
                      {label(day)}
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
              <tr className="bg-good-soft font-semibold text-good">
                <td colSpan={levels.length + 2} className={cn(td, "text-right")}>
                  {t("dayTotal", { count: day.receipts })}
                </td>
                {sums(day.amounts, day.total, td)}
              </tr>
            </tbody>
          ))}
          <tfoot>
            <tr className="bg-primary font-semibold text-primary-foreground">
              <th scope="row" colSpan={levels.length + 3} className="px-3 py-3 text-left">
                {t("monthTotal")}
              </th>
              {sums(report.totals.amounts, report.totals.total, "px-3 py-3")}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="grid gap-2.5 min-[600px]:hidden">
        {report.days.map((day) => (
          <section key={day.day} aria-label={label(day)} className="rounded-[12px] border border-line bg-surface">
            <h3 className="border-b border-line px-3.5 py-2.5 text-[14px] font-semibold">{label(day)}</h3>
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
