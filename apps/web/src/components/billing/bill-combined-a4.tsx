"use client";

import { addMoney, amountInWords, formatDate, formatTaka, localDigits, pick, type InvoiceDetail, type Locale } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { DocumentHead } from "@/components/print/document-head";
import { periodLabel, unitLabel } from "./labels";

/**
 * Several bills on one A4 page for one payer (an office over several flats): a row per bill
 * with what is paid and due, and one total payable. Only a printout: each bill keeps its own
 * number and is paid against it. Void bills are left out.
 */
export function BillCombinedSheet({ invoices, payer, today }: { invoices: InvoiceDetail[]; payer: string; today: string }) {
  const t = useTranslations("Billing");
  const tA4 = useTranslations("Billing.printA4");
  const locale = useLocale() as Locale;
  const tr = t as unknown as (key: string, values?: Record<string, string>) => string;
  const bills = invoices.filter((invoice) => invoice.status !== "void");
  const header = bills[0]?.header ?? invoices[0]!.header;
  const sum = (pickAmount: (invoice: InvoiceDetail) => string) => addMoney("0", ...bills.map(pickAmount));
  const total = sum((invoice) => invoice.total);
  const paid = sum((invoice) => invoice.paid);
  const due = sum((invoice) => invoice.due);

  return (
    <div className="print-a4">
      <DocumentHead header={header} locale={locale} title={t("printMany.combinedTitle")} />
      <div className="my-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[8pt] font-semibold tracking-[0.12em] text-primary uppercase">{tA4("billedTo")}</p>
          <p className="text-[13pt] font-semibold">{payer || "—"}</p>
        </div>
        <p className="num text-right">
          {t("printMany.listDate", { date: formatDate(today, locale) })}
          <br />
          {t("printMany.listCount", { count: localDigits(bills.length, locale) })}
        </p>
      </div>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            <th className="py-1 pr-2">{t("col.invoice")}</th>
            <th className="py-1 pr-2">{t("col.unit")}</th>
            <th className="py-1 pr-2">{t("col.charge")}</th>
            <th className="py-1 pr-2">{t("col.period")}</th>
            <th className="py-1 pr-2 text-right">{t("col.amount")}</th>
            <th className="py-1 pr-2 text-right">{t("print.paid")}</th>
            <th className="py-1 text-right">{t("col.due")}</th>
          </tr>
        </thead>
        <tbody>
          {bills.map((invoice) => (
            <tr key={invoice.id} className="border-b border-line align-top">
              <td className="py-1.5 pr-2 font-mono text-[9.5pt]">{invoice.invoiceNo}</td>
              <td className="py-1.5 pr-2">{unitLabel(invoice.billTo) ?? t("noUnit")}</td>
              <td className="py-1.5 pr-2">
                {invoice.kind === "opening" ? t("kind.opening") : invoice.charges.map((charge) => pick(charge.nameBn, charge.nameEn, locale)).join(", ")}
              </td>
              <td className="py-1.5 pr-2">{periodLabel(invoice, locale, tr) ?? "—"}</td>
              <td className="num py-1.5 pr-2 text-right">{formatTaka(invoice.total, locale)}</td>
              <td className="num py-1.5 pr-2 text-right">{formatTaka(invoice.paid, locale)}</td>
              <td className="num py-1.5 text-right">{formatTaka(invoice.due, locale)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td className="py-1.5 pr-2" colSpan={4}>
              {tA4("subtotal")}
            </td>
            <td className="num py-1.5 pr-2 text-right">{formatTaka(total, locale)}</td>
            <td className="num py-1.5 pr-2 text-right">{formatTaka(paid, locale)}</td>
            <td className="num py-1.5 text-right">{formatTaka(due, locale)}</td>
          </tr>
        </tfoot>
      </table>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[6px] bg-primary px-4 py-3 text-primary-foreground">
        <span className="font-semibold">{tA4("payable")}</span>
        <span className="num text-[15pt] font-bold">{formatTaka(due, locale)}</span>
      </div>
      <p className="mt-1.5 text-[9.5pt]">
        {tA4("inWords")}: {amountInWords(due, locale)}
      </p>
      <p className="mt-3 text-[9.5pt]">{t("printMany.combinedNote")}</p>
    </div>
  );
}
