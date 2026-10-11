"use client";

import { amountInWords, formatDate, formatTaka, localDigits, pick, type InvoiceDetail, type Locale } from "@s57/shared";
import { Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { DocumentHead, Stamp } from "@/components/print/document-head";
import { PrintSheet } from "@/components/print/print-sheet";
import { Button } from "@/components/ui/button";

/**
 * "Print bill": the bill on A5 in the receipt's layout, from what was billed on the day: who
 * and where, lines, total in figures and words, due date, and where to pay. A void bill
 * prints with a large "Void". Follows the page language.
 */
export function BillPrint({ invoice }: { invoice: InvoiceDetail }) {
  const t = useTranslations("Billing.print");
  const tBilling = useTranslations("Billing");
  const locale = useLocale() as Locale;
  const { billTo } = invoice;
  const unit = billTo.unit ? [billTo.unit.name, ...[...billTo.unit.address].reverse()].join(", ") : null;
  const period =
    invoice.periodStart && invoice.periodEnd
      ? [formatDate(invoice.periodStart, locale, "monthYear"), formatDate(invoice.periodEnd, locale, "monthYear")]
      : null;

  return (
    <>
      <Button type="button" variant="outline" onClick={() => window.print()}>
        <Printer aria-hidden />
        {tBilling("detail.print")}
      </Button>
      <PrintSheet>
        <div className="relative overflow-hidden rounded-[8px] border border-line">
          <DocumentHead header={invoice.header} locale={locale} title={t("title")} />
          <div className="grid gap-2.5 px-4 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <span>
                {t("no")} <b className="font-mono">{invoice.invoiceNo}</b>
              </span>
              <span className="num">
                {t("date")}: {formatDate(invoice.issueDate, locale)}
              </span>
            </div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13.5px]">
              <dt className="text-muted-foreground">{t("billTo")}</dt>
              <dd className="font-medium">
                {pick(billTo.name, billTo.nameEn, locale)}
                {billTo.memberNo !== null ? (
                  <span className="font-normal text-muted-foreground"> · {localDigits(tBilling("memberNo", { no: billTo.memberNo }), locale)}</span>
                ) : null}
              </dd>
              {unit ? (
                <>
                  <dt className="text-muted-foreground">{t("unit")}</dt>
                  <dd>{unit}</dd>
                </>
              ) : null}
              {period ? (
                <>
                  <dt className="text-muted-foreground">{t("period")}</dt>
                  <dd>{period[0] === period[1] ? period[0] : tBilling("periodRange", { from: period[0]!, to: period[1]! })}</dd>
                </>
              ) : null}
            </dl>
            <table className="w-full border-collapse text-[13px]">
              <tbody>
                {invoice.lines.map((line) => (
                  <tr key={line.id} className="border-b border-line">
                    <td className="py-1 pr-3">{pick(line.description, line.descriptionEn, locale)}</td>
                    <td className="num py-1 text-right whitespace-nowrap">{formatTaka(line.amount, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between gap-3 border-y border-dashed border-line py-2 font-semibold">
              <span className="min-w-0">{t("words", { words: amountInWords(invoice.total, locale) })}</span>
              <span className="num text-lg whitespace-nowrap">{formatTaka(invoice.total, locale)}</span>
            </div>
            {invoice.paid !== "0.00" && invoice.status !== "void" ? (
              <div className="num flex justify-between gap-3 text-[13px]">
                <span>
                  {t("paid")}: {formatTaka(invoice.paid, locale)}
                </span>
                <b>
                  {t("due")}: {formatTaka(invoice.due, locale)}
                </b>
              </div>
            ) : null}
            <p className="num text-[13.5px] font-semibold">
              {t("dueDate")}: {formatDate(invoice.dueDate, locale)}
            </p>
            <p className="text-[12.5px] text-muted-foreground">{t("payAtOffice")}</p>
          </div>
          {invoice.status === "void" ? <Stamp text={t("void")} tone="bad" /> : null}
        </div>
      </PrintSheet>
    </>
  );
}
