"use client";

import { formatDate, formatNumber, pick, type Locale, type MembersReport } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { PrintSection, ReportPrint } from "./report-print";

/**
 * The members report on A4 portrait, for the AGM or a check by hand: the count per status, then
 * everyone who joined in the range, numbered, with ID, phone and address. The general secretary
 * and the president sign.
 */
export function MembersPrint({ report, band }: { report: MembersReport; band: { name: string; mark: string; place: string | null } }) {
  const t = useTranslations("Reports.members");
  const tReports = useTranslations("Reports");
  const locale = useLocale() as Locale;
  const count = (value: number) => formatNumber(value, locale);
  const day = (iso: string) => formatDate(iso, locale, "short");
  const range = t("printRange", { from: day(report.from), to: day(report.to) });
  const statuses = ["active", "lapsed", "cancelled"] as const;

  return (
    <ReportPrint
      page="a4"
      band={band}
      title={t("title")}
      sub={report.location ? `${report.location.name} · ${range}` : range}
      signatures={[t("sign.secretary"), t("sign.president")]}
    >
      <PrintSection
        title={t("printSummary")}
        headers={[{ text: t("col.status") }, { text: t("col.count"), numeric: true }]}
        rows={statuses.map((status) => ({ key: status, cells: [{ text: t(`status.${status}`) }, { text: count(report.counts[status]), numeric: true }] }))}
        foot={[
          {
            key: "total",
            cells: [{ text: tReports("total") }, { text: count(statuses.reduce((sum, status) => sum + report.counts[status], 0)), numeric: true }],
          },
        ]}
      />
      <PrintSection
        title={`${t("joinedTitle")} · ${range}`}
        headers={[
          { text: t("col.serial"), numeric: true },
          { text: t("col.memberNo") },
          { text: t("col.name") },
          { text: t("col.phone") },
          { text: t("col.address") },
          { text: t("col.joinedOn") },
          { text: t("col.status") },
        ]}
        rows={report.joined.map((row, i) => ({
          key: row.personId ?? row.organisationId ?? String(i),
          cells: [
            { text: count(i + 1), numeric: true },
            { text: row.membershipCode ?? t("idPending") },
            { text: pick(row.name, row.nameEn, locale) },
            { text: row.phone ?? "—" },
            { text: row.address.join(", ") || "—" },
            { text: day(row.joinedOn) },
            { text: t(`status.${row.status}`) },
          ],
        }))}
      />
      {report.truncated ? <p className="mt-[1.5mm] text-[8.5pt] text-muted-foreground">{t("truncated", { count: count(report.joined.length) })}</p> : null}
    </ReportPrint>
  );
}
