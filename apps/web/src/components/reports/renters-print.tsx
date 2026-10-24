"use client";

import { formatDate, formatNumber, pick, type Locale, type RentersReport } from "@s57/shared";
import { Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { PrintSheet } from "@/components/print/print-sheet";
import { Button } from "@/components/ui/button";

/** The renter list on A4 for the police station: one row per tenancy in address order, never the NID. */
export function RentersPrint({ report, society, place }: { report: RentersReport; society: string; place: string | null }) {
  const t = useTranslations("Reports.renters");
  const locale = useLocale() as Locale;
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
                <th className="py-1 pr-2">{t("col.renter")}</th>
                <th className="py-1 pr-2">{t("col.renterType")}</th>
                <th className="py-1 pr-2">{t("col.startDate")}</th>
                <th className="py-1 pr-2 text-right">{t("col.household")}</th>
                <th className="py-1">{t("col.policeForm")}</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.tenancyId} className="border-b border-line align-top">
                  <td className="py-1.5 pr-2">
                    <b>{row.unit}</b>
                    {row.address.length ? <span className="block text-[9pt] text-muted-foreground">{row.address.join(", ")}</span> : null}
                  </td>
                  <td className="py-1.5 pr-2">
                    {pick(row.renter.name, row.renter.nameEn, locale)}
                    {row.phone ? <span className="num block text-[9pt]">{row.phone}</span> : null}
                  </td>
                  <td className="py-1.5 pr-2">{t(`renterType.${row.renterType}`)}</td>
                  <td className="num py-1.5 pr-2">{formatDate(row.startDate, locale, "short")}</td>
                  <td className="num py-1.5 pr-2 text-right">{formatNumber(row.household, locale)}</td>
                  <td className="py-1.5">{row.policeForm ? t("policeForm.yes") : t("policeForm.no")}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="py-1.5 pr-2" colSpan={4}>
                  {t("totalTenancies", { count: formatNumber(report.totals.tenancies, locale) })}
                </td>
                <td className="num py-1.5 pr-2 text-right">{formatNumber(report.totals.people, locale)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </PrintSheet>
    </>
  );
}
