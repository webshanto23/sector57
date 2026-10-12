import { compareMoney, formatTaka, incomeQuery, localDigits, pick, type IncomeReport, type Locale } from "@s57/shared";
import { ArrowDownLeft, ArrowUpRight, Scale } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, DataTable, Field, inputClass, ProgressBar, StatCard, type Column } from "@/components/kit";
import { canExportReport } from "@/components/reports/access";
import { ReportHeader } from "@/components/reports/report-header";
import { Button } from "@/components/ui/button";
import { csvHref, getIncome } from "@/lib/api/reports";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/reports/income">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Reports.income" });
  return { title: t("title") };
}

type Charge = IncomeReport["income"]["charges"][number];
type Head = IncomeReport["expenditure"]["heads"][number];

/** A fiscal year's income by charge type and spending by head, against the budget (`ledger.view`). */
export default async function IncomePage({ params, searchParams }: PageProps<"/[locale]/dashboard/reports/income">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("ledger");
  const search = await searchParams;
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  const parsed = incomeQuery.safeParse({ year: text("year"), fundId: text("fundId") });
  const query = parsed.success ? parsed.data : {};
  const [t, tReports, found] = await Promise.all([getTranslations("Reports.income"), getTranslations("Reports"), getIncome(query)]);
  const report = found ?? (await getIncome({}));
  if (!report) notFound();

  const money = (amount: string) => formatTaka(amount, locale);
  const name = (ref: { nameBn: string; nameEn: string | null }) => pick(ref.nameBn, ref.nameEn, locale);
  const deficit = compareMoney(report.surplus, "0") < 0;
  const showBudget = report.expenditure.budget !== null;

  const chargeColumns: Column<Charge>[] = [
    { key: "charge", header: t("col.charge"), cell: (row) => <span className="font-semibold">{name(row.chargeType)}</span> },
    { key: "billed", header: t("col.billed"), numeric: true, cell: (row) => money(row.billed) },
    { key: "collected", header: t("col.collected"), numeric: true, cell: (row) => <b>{money(row.collected)}</b> },
  ];
  const headColumns: Column<Head>[] = [
    { key: "head", header: t("col.head"), cell: (row) => <span className="font-semibold">{name(row.head)}</span> },
    ...(showBudget
      ? [
          {
            key: "budget",
            header: t("col.budget"),
            numeric: true,
            cell: (row: Head) => (row.budget === null ? <span className="text-muted-foreground">{t("noBudget")}</span> : money(row.budget)),
          },
        ]
      : []),
    { key: "spent", header: t("col.spent"), numeric: true, cell: (row) => <b>{money(row.spent)}</b> },
    ...(showBudget
      ? [
          {
            key: "remaining",
            header: t("col.remaining"),
            cell: (row: Head) =>
              row.budget === null || row.percent === null ? (
                "—"
              ) : (
                <span className="flex min-w-[140px] items-center gap-2">
                  <ProgressBar value={row.percent} tone={row.over ? "bad" : row.percent >= 85 ? "warn" : "acc"} label={name(row.head)} className="flex-1" />
                  <span className={`num text-right text-[12.5px] ${row.over ? "text-bad" : ""}`}>{money(row.remaining ?? "0")}</span>
                </span>
              ),
          },
        ]
      : []),
  ];

  return (
    <>
      <ReportHeader
        title={t("title")}
        sub={t("sub", { year: localDigits(report.year, locale) })}
        csv={canExportReport(me.access, "income") ? csvHref("income", { year: report.year, fundId: report.fundId ?? undefined, lang: locale }) : null}
      />

      <form method="get" className="mb-3.5 flex flex-wrap items-end gap-2.5">
        <Field label={t("year")} htmlFor="income-year">
          <select id="income-year" name="year" defaultValue={report.year} className={`${inputClass} w-auto`}>
            {report.years.map((year) => (
              <option key={year} value={year}>
                {localDigits(year, locale)}
              </option>
            ))}
          </select>
        </Field>
        {report.funds.length > 1 ? (
          <Field label={t("fund")} htmlFor="income-fund">
            <select id="income-fund" name="fundId" defaultValue={report.fundId ?? ""} className={`${inputClass} w-auto`}>
              <option value="">{t("allFunds")}</option>
              {report.funds.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {name(fund)}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Button type="submit" variant="outline">
          {tReports("show")}
        </Button>
      </form>

      <div className="mb-4 grid gap-2.5 min-[600px]:grid-cols-3">
        <StatCard icon={ArrowDownLeft} tone="info" label={t("income")} value={money(report.income.total)} />
        <StatCard icon={ArrowUpRight} tone="warn" label={t("expenditure")} value={money(report.expenditure.total)} />
        <StatCard icon={Scale} tone={deficit ? "sun" : "acc"} label={deficit ? t("deficit") : t("surplus")} value={money(report.surplus)} />
      </div>

      <div className="grid gap-5">
        <section className="grid gap-2">
          <h2 className="text-[16px]">{t("income")}</h2>
          <DataTable columns={chargeColumns} rows={report.income.charges} rowKey={(row) => row.chargeType.id} caption={t("income")} empty={t("emptyIncome")} />
          <Card flat className="grid gap-1.5 text-[13.5px]">
            <div className="flex justify-between gap-2">
              <span>{t("donations")}</span>
              <b className="num">{money(report.income.donations)}</b>
            </div>
            <div className="flex justify-between gap-2 border-t border-line pt-1.5">
              <span className="font-semibold">{tReports("total")}</span>
              <b className="num">{money(report.income.total)}</b>
            </div>
          </Card>
          <p className="text-[12.5px] text-muted-foreground">{t("partNote")}</p>
        </section>

        <section className="grid gap-2">
          <h2 className="text-[16px]">{t("expenditure")}</h2>
          <DataTable columns={headColumns} rows={report.expenditure.heads} rowKey={(row) => row.head.id} caption={t("expenditure")} empty={t("emptyExpenditure")} />
          <Card flat className="grid gap-1.5 text-[13.5px]">
            {showBudget ? (
              <div className="flex justify-between gap-2">
                <span>{t("col.budget")}</span>
                <span className="num">{money(report.expenditure.budget ?? "0")}</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-2">
              <span className="font-semibold">{tReports("total")}</span>
              <b className="num">{money(report.expenditure.total)}</b>
            </div>
          </Card>
          {report.fundId ? <p className="text-[12.5px] text-muted-foreground">{t("budgetHidden")}</p> : null}
        </section>
      </div>
    </>
  );
}
