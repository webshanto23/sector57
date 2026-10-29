"use client";

import { compareMoney, formatTaka, localDigits, pick, type IncomeReport, type Locale } from "@s57/shared";
import { useLocale, useTranslations } from "next-intl";
import { PrintSection, ReportPrint, type PrintCell } from "./report-print";

/**
 * Income and expenditure for a fiscal year on A4 portrait, for the committee, the AGM and the
 * auditor: the totals, income by charge type with donations, and spending by head against the
 * budget (all funds only, as on the screen). The treasurer, general secretary and president sign.
 */
export function IncomePrint({ report, band }: { report: IncomeReport; band: { name: string; mark: string; place: string | null } }) {
  const t = useTranslations("Reports.income");
  const tReports = useTranslations("Reports");
  const locale = useLocale() as Locale;
  const money = (amount: string) => formatTaka(amount, locale);
  const name = (ref: { nameBn: string; nameEn: string | null }) => pick(ref.nameBn, ref.nameEn, locale);
  const deficit = compareMoney(report.surplus, "0") < 0;
  const showBudget = report.expenditure.budget !== null;
  const fund = report.fundId ? report.funds.find((item) => item.id === report.fundId) : null;
  const num = (text: string): PrintCell => ({ text, numeric: true });

  return (
    <ReportPrint
      page="a4"
      band={band}
      title={t("title")}
      sub={t("printSub", { year: localDigits(report.year, locale), fund: fund ? name(fund) : t("allFunds") })}
      signatures={[t("sign.treasurer"), t("sign.secretary"), t("sign.president")]}
    >
      <PrintSection
        title={t("printSummary")}
        headers={[{ text: "" }, num(t("col.amount"))]}
        rows={[
          { key: "income", cells: [{ text: t("income") }, num(money(report.income.total))] },
          { key: "expenditure", cells: [{ text: t("expenditure") }, num(money(report.expenditure.total))] },
        ]}
        foot={[{ key: "surplus", cells: [{ text: deficit ? t("deficit") : t("surplus") }, num(money(report.surplus))] }]}
      />
      <PrintSection
        title={t("income")}
        headers={[{ text: t("col.charge") }, num(t("col.billed")), num(t("col.collected"))]}
        rows={[
          ...report.income.charges.map((row) => ({
            key: row.chargeType.id,
            cells: [{ text: name(row.chargeType) }, num(money(row.billed)), num(money(row.collected))],
          })),
          { key: "donations", cells: [{ text: t("donations") }, num("—"), num(money(report.income.donations))] },
        ]}
        foot={[{ key: "total", cells: [{ text: tReports("total") }, num(""), num(money(report.income.total))] }]}
      />
      <p className="mt-[1.5mm] text-[8.5pt] text-muted-foreground">{t("partNote")}</p>
      <PrintSection
        title={t("expenditure")}
        headers={[
          { text: t("col.head") },
          ...(showBudget ? [num(t("col.budget"))] : []),
          num(t("col.spent")),
          ...(showBudget ? [num(t("col.remaining"))] : []),
        ]}
        rows={report.expenditure.heads.map((row) => ({
          key: row.head.id,
          cells: [
            { text: name(row.head) },
            ...(showBudget ? [num(row.budget === null ? t("noBudget") : money(row.budget))] : []),
            num(money(row.spent)),
            ...(showBudget ? [num(row.remaining === null ? "—" : `${money(row.remaining)}${row.over ? ` (${t("over")})` : ""}`)] : []),
          ],
        }))}
        foot={[
          {
            key: "total",
            cells: [
              { text: tReports("total") },
              ...(showBudget ? [num(money(report.expenditure.budget ?? "0"))] : []),
              num(money(report.expenditure.total)),
              ...(showBudget ? [num("")] : []),
            ],
          },
        ]}
      />
      {report.fundId ? <p className="mt-[1.5mm] text-[8.5pt] text-muted-foreground">{t("budgetHidden")}</p> : null}
    </ReportPrint>
  );
}
