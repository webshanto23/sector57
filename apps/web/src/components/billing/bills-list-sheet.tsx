"use client";

import { addMoney, formatDate, formatTaka, localDigits, pick, type InvoiceDetail, type Locale } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { periodLabel, unitLabel } from "./labels";

/** The bills as one A4 list: number, unit, who it is billed to, charges, months and amount, with the total. */
export function BillsListSheet({ invoices, today }: { invoices: InvoiceDetail[]; today: string }) {
  const t = useTranslations("Billing");
  const locale = useLocale() as Locale;
  const tr = t as unknown as (key: string, values?: Record<string, string>) => string;
  const header = invoices[0]?.header;
  const total = addMoney("0", ...invoices.map((invoice) => invoice.total));

  return (
    <div className="print-a4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
        <div>
          {header ? <b className="text-[14pt]">{pick(header.nameBn, header.nameEn, locale)}</b> : null}
          <p className="font-semibold">{t("printMany.listTitle")}</p>
        </div>
        <p className="num">{t("printMany.listDate", { date: formatDate(today, locale) })}</p>
      </header>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            <th className="py-1 pr-2">{t("col.invoice")}</th>
            <th className="py-1 pr-2">{t("col.unit")}</th>
            <th className="py-1 pr-2">{t("col.billTo")}</th>
            <th className="py-1 pr-2">{t("col.charge")}</th>
            <th className="py-1 pr-2">{t("col.period")}</th>
            <th className="py-1 text-right">{t("col.amount")}</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id} className="border-b border-line align-top">
              <td className="py-1.5 pr-2 font-mono text-[9.5pt]">{invoice.invoiceNo}</td>
              <td className="py-1.5 pr-2">{unitLabel(invoice.billTo) ?? t("noUnit")}</td>
              <td className="py-1.5 pr-2">
                {pick(invoice.billTo.name, invoice.billTo.nameEn, locale)}
                {invoice.billTo.phone ? <span className="num block text-[9pt]">{invoice.billTo.phone}</span> : null}
              </td>
              <td className="py-1.5 pr-2">
                {invoice.kind === "opening" ? t("kind.opening") : invoice.charges.map((charge) => pick(charge.nameBn, charge.nameEn, locale)).join(", ")}
              </td>
              <td className="py-1.5 pr-2">{periodLabel(invoice, locale, tr) ?? "—"}</td>
              <td className="num py-1.5 text-right">{formatTaka(invoice.total, locale)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td className="py-1.5 pr-2" colSpan={5}>
              {t("printMany.listCount", { count: localDigits(invoices.length, locale) })}
            </td>
            <td className="num py-1.5 text-right">{formatTaka(total, locale)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
