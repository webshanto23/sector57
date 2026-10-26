"use client";

import { amountInWords, formatDate, formatTaka, localDigits, notePoints, pick, type InvoiceDetail, type Locale } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { ThermalHead, ThermalRow } from "@/components/print/thermal-head";
import { ThermalRule, ThermalSheet } from "@/components/print/thermal-sheet";
import { periodLabel } from "./labels";

/**
 * The bill on an 80 mm roll: who and where, each line on its own row, the total payable in
 * figures and words, the pay-by date, the unit's other unpaid bills and the office's notes.
 * A void bill says so in a line of text.
 */
export function BillThermalSheet({ invoice }: { invoice: InvoiceDetail }) {
  const t = useTranslations("Billing.printA4");
  const tPrint = useTranslations("Billing.print");
  const tBilling = useTranslations("Billing");
  const locale = useLocale() as Locale;
  const { billTo } = invoice;
  const unit = billTo.unit ? [billTo.unit.name, ...[...billTo.unit.address].reverse()].join(", ") : null;
  const period = periodLabel(invoice, locale, tBilling as unknown as (key: string, values?: Record<string, string>) => string);
  const notes = notePoints(locale === "en" ? (invoice.print.noteEn ?? invoice.print.noteBn) : invoice.print.noteBn);
  const voided = invoice.status === "void";

  return (
    <ThermalSheet>
      <ThermalHead header={invoice.header} locale={locale} title={tPrint("title")} />
      {voided ? <p className="mt-[1mm] text-center font-bold tracking-widest uppercase">{tPrint("void")}</p> : null}
      <ThermalRule />
      <ThermalRow label={tPrint("no")} value={invoice.invoiceNo} />
      <ThermalRow label={tPrint("date")} value={formatDate(invoice.issueDate, locale)} />
      {period ? <ThermalRow label={t("period")} value={period} /> : null}
      <ThermalRule />
      <p>
        <b>{pick(billTo.name, billTo.nameEn, locale)}</b>
        {billTo.memberNo !== null ? ` · ${t("memberNo")} ${localDigits(String(billTo.memberNo), locale)}` : null}
      </p>
      {unit ? <p>{unit}</p> : null}
      <ThermalRule />
      {invoice.lines.map((line) => (
        <ThermalRow key={line.id} label={pick(line.description, line.descriptionEn, locale)} value={formatTaka(line.amount, locale)} />
      ))}
      <ThermalRule />
      <ThermalRow label={t("subtotal")} value={formatTaka(invoice.total, locale)} />
      {invoice.paid !== "0.00" && !voided ? <ThermalRow label={t("paid")} value={`− ${formatTaka(invoice.paid, locale)}`} /> : null}
      <ThermalRow label={t("payable")} value={formatTaka(invoice.due, locale)} strong />
      <p className="mt-[0.5mm]">{amountInWords(invoice.due, locale)}</p>
      <ThermalRule />
      <ThermalRow label={t("payBy")} value={formatDate(invoice.dueDate, locale)} strong />
      {invoice.otherDue.bills > 0 && !voided ? (
        <p className="num mt-[1mm]">
          {t("otherDue", { count: localDigits(String(invoice.otherDue.bills), locale), amount: formatTaka(invoice.otherDue.owed, locale) })}
        </p>
      ) : null}
      {notes.length ? (
        <ul className="mt-[1mm] list-disc pl-[4mm]">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-[1mm]">{t("payKeep")}</p>
      )}
    </ThermalSheet>
  );
}
