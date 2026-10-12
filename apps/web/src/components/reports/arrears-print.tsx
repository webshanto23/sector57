"use client";

import { formatDate, formatNumber, formatTaka, type ArrearsReport, type Locale } from "@s57/shared";
import { Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { PrintSheet } from "@/components/print/print-sheet";
import { Button } from "@/components/ui/button";

/**
 * The arrears as a door-to-door list on A4: one row per unit in address order, who the bill
 * goes to, what is owed by age, and an empty column for a note or the payer's signature.
 */
export function ArrearsPrint({ report, society, place }: { report: ArrearsReport; society: string; place: string | null }) {
  const t = useTranslations("Reports.arrears");
  const locale = useLocale() as Locale;
  const money = (amount: string) => (amount === "0.00" ? "" : formatTaka(amount, locale));
  if (report.rows.length === 0) return null;

  return (
    <>
      <Button type="button" variant="outline" onClick={() => window.print()}>
        <Printer aria-hidden />
        {t("printButton")}
      </Button>
      <PrintSheet>
        <div className="print-a4">
          <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
            <div>
              <b className="text-[14pt]">{society}</b>
              <p className="font-semibold">{t("printTitle")}</p>
            </div>
            <div className="text-right">
              {place ? <p>{t("printPlace", { place })}</p> : null}
              <p className="num">{t("printDate", { date: formatDate(report.asOf, locale) })}</p>
            </div>
          </header>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th className="py-1 pr-2">{t("col.unit")}</th>
                <th className="py-1 pr-2">{t("col.billTo")}</th>
                <th className="py-1 pr-2 text-right">{t("d30")}</th>
                <th className="py-1 pr-2 text-right">{t("d90")}</th>
                <th className="py-1 pr-2 text-right">{t("older")}</th>
                <th className="py-1 pr-2 text-right">{t("col.owed")}</th>
                <th className="w-[22%] py-1">{t("col.note")}</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.unitId} className="border-b border-line align-top">
                  <td className="py-1.5 pr-2">
                    <b>{row.unit}</b>
                    {row.code ? <span className="num"> ({row.code})</span> : null}
                    {row.address.length ? <span className="block text-[9pt] text-muted-foreground">{row.address.join(", ")}</span> : null}
                  </td>
                  <td className="py-1.5 pr-2">
                    {row.billTo?.name ?? "—"}
                    {row.billTo?.phone ? <span className="num block text-[9pt]">{row.billTo.phone}</span> : null}
                  </td>
                  <td className="num py-1.5 pr-2 text-right">{money(row.buckets.d30)}</td>
                  <td className="num py-1.5 pr-2 text-right">{money(row.buckets.d90)}</td>
                  <td className="num py-1.5 pr-2 text-right">{money(row.buckets.older)}</td>
                  <td className="num py-1.5 pr-2 text-right font-semibold">{formatTaka(row.owed, locale)}</td>
                  <td className="py-1.5" />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="py-1.5 pr-2" colSpan={2}>
                  {t("units")}: <span className="num">{formatNumber(report.totals.units, locale)}</span>
                </td>
                <td className="num py-1.5 pr-2 text-right">{money(report.totals.d30)}</td>
                <td className="num py-1.5 pr-2 text-right">{money(report.totals.d90)}</td>
                <td className="num py-1.5 pr-2 text-right">{money(report.totals.older)}</td>
                <td className="num py-1.5 pr-2 text-right">{formatTaka(report.totals.owed, locale)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </PrintSheet>
    </>
  );
}
