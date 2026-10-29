"use client";

import { formatDate, formatTaka, pick, type DayBook, type Locale } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { PrintSection, ReportPrint, type PrintCell, type PrintRow } from "./report-print";

/**
 * The day book on A4 portrait: cash per collector, then each section the user may see, as on the
 * screen. Voided rows are struck through and not counted; an empty section says "None"; the
 * cashier, treasurer and general secretary sign at the end.
 */
export function DayBookPrint({ book, band }: { book: DayBook; band: { name: string; mark: string; place: string | null } }) {
  const t = useTranslations("Reports.dayBook");
  const tFunds = useTranslations("Finance.funds");
  const locale = useLocale() as Locale;
  const money = (amount: string) => formatTaka(amount, locale);
  const time = (iso: string) => formatDate(iso, locale, "time");
  const name = (ref: { nameBn: string; nameEn: string | null }) => pick(ref.nameBn, ref.nameEn, locale);
  // A voided number carries the "Void" mark as well, so it reads on a black-and-white print.
  const numbered = (no: string, isVoid: boolean) => (isVoid ? `${no} (${t("voidMark")})` : no);
  const amount: PrintCell = { text: t("col.amount"), numeric: true };

  const table = (title: string, total: string | null, headers: PrintCell[], rows: PrintRow[]) => (
    <PrintSection title={title} total={total === null ? null : t("total", { amount: money(total) })} headers={headers} rows={rows} />
  );

  return (
    <ReportPrint
      page="a4"
      band={band}
      title={t("title")}
      sub={formatDate(book.date, locale, "long")}
      signatures={[t("sign.cashier"), t("sign.treasurer"), t("sign.secretary")]}
    >
      {table(
        t("byCollector"),
        null,
        [{ text: t("col.collector") }, { text: t("col.receipts"), numeric: true }, amount],
        book.byCollector.map((row) => ({
          key: row.collector.id,
          cells: [
            { text: row.collector.name },
            { text: t("receiptsCount", { count: row.receipts }), numeric: true },
            { text: money(row.amount), numeric: true },
          ],
        })),
      )}
      {book.receipts
        ? table(
            t("receipts"),
            book.receipts.total,
            [{ text: t("col.no") }, { text: t("col.time") }, { text: t("col.payer") }, { text: t("col.unit") }, { text: t("col.collector") }, amount],
            book.receipts.items.map((row) => ({
              key: row.id,
              void: row.void,
              cells: [
                { text: numbered(row.receiptNo, row.void) },
                { text: time(row.at) },
                { text: row.payer ?? "—" },
                { text: row.unit?.join(", ") ?? "—" },
                { text: row.collector.name },
                { text: money(row.amount), numeric: true },
              ],
            })),
          )
        : null}
      {book.donations
        ? table(
            t("donations"),
            book.donations.total,
            [
              { text: t("col.no") },
              { text: t("col.time") },
              { text: t("col.payer") },
              { text: t("col.fund") },
              { text: t("col.purpose") },
              { text: t("col.collector") },
              amount,
            ],
            book.donations.items.map((row) => ({
              key: row.id,
              void: row.void,
              cells: [
                { text: numbered(row.receiptNo, row.void) },
                { text: time(row.at) },
                { text: row.payer ?? t("anonymous") },
                { text: name(row.fund) },
                { text: row.purpose ?? "—" },
                { text: row.collector.name },
                { text: money(row.amount), numeric: true },
              ],
            })),
          )
        : null}
      {book.expenses
        ? table(
            t("expenses"),
            book.expenses.total,
            [{ text: t("col.no") }, { text: t("col.head") }, { text: t("col.for") }, { text: t("col.account") }, { text: t("col.paidBy") }, amount],
            book.expenses.items.map((row) => ({
              key: row.lineId,
              void: row.void,
              cells: [
                { text: numbered(row.voucherNo, row.void) },
                { text: name(row.head) },
                { text: row.description },
                { text: tFunds(row.account) },
                { text: row.paidBy ?? "—" },
                { text: money(row.amount), numeric: true },
              ],
            })),
          )
        : null}
      {book.transfers
        ? table(
            t("transfers"),
            null,
            [{ text: t("col.move") }, { text: t("col.memo") }, amount],
            book.transfers.items.map((row) => ({
              key: row.id,
              void: row.void,
              cells: [
                {
                  text: numbered(`${name(row.from.fund)} · ${tFunds(row.from.account)} → ${name(row.to.fund)} · ${tFunds(row.to.account)}`, row.void),
                },
                { text: row.memo ?? "—" },
                { text: money(row.amount), numeric: true },
              ],
            })),
          )
        : null}
      {book.funds
        ? table(
            t("funds"),
            null,
            [
              { text: t("col.fund") },
              { text: t("col.opening"), numeric: true },
              { text: t("col.in"), numeric: true },
              { text: t("col.out"), numeric: true },
              { text: t("col.closing"), numeric: true },
            ],
            book.funds.map((row) => ({
              key: `${row.fund.id}-${row.account}`,
              cells: [
                { text: `${name(row.fund)} · ${tFunds(row.account)}` },
                { text: money(row.opening), numeric: true },
                { text: money(row.in), numeric: true },
                { text: money(row.out), numeric: true },
                { text: <b>{money(row.closing)}</b>, numeric: true },
              ],
            })),
          )
        : null}
    </ReportPrint>
  );
}
