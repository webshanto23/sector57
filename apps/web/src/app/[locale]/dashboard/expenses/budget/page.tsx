import { formatTaka, type Locale } from "@s57/shared";
import { CheckCheck, PiggyBank, Scale, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BudgetEditor } from "@/components/expenses/budget-editor";
import { inputClass, PageHeader, StatCard } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { getBudget } from "@/lib/api/expenses";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/expenses/budget">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Expenses.budget" });
  return { title: t("title") };
}

/** The budget for a fiscal year (`?year=2026-27`, else the current one): per head, against what is approved and paid. */
export default async function BudgetPage({ params, searchParams }: PageProps<"/[locale]/dashboard/expenses/budget">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  await requirePermission("budgets");
  const { year } = await searchParams;
  const [t, budget] = await Promise.all([getTranslations("Expenses.budget"), getBudget(typeof year === "string" ? year : undefined)]);
  if (!budget) notFound();
  const money = (value: string) => formatTaka(value, locale);
  const over = budget.totals.remaining.startsWith("-");

  return (
    <>
      <PageHeader
        title={t("title")}
        sub={t("sub", { year: budget.year })}
        actions={
          <form method="get" className="flex items-center gap-2">
            <label htmlFor="budget-year" className="sr-only">
              {t("year")}
            </label>
            <select id="budget-year" name="year" defaultValue={budget.year} className={`${inputClass} w-auto`}>
              {budget.years.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline">
              {t("show")}
            </Button>
          </form>
        }
      />

      <div className="mb-3.5 grid gap-2.5 min-[600px]:grid-cols-2 min-[1100px]:grid-cols-4">
        <StatCard icon={PiggyBank} label={t("totalBudget")} value={money(budget.totals.budget)} />
        <StatCard icon={Wallet} tone="acc" label={t("totalPaid")} value={money(budget.totals.paid)} />
        <StatCard icon={CheckCheck} tone="info" label={t("totalApproved")} value={money(budget.totals.approved)} />
        <StatCard
          icon={Scale}
          tone={over ? "warn" : undefined}
          label={over ? t("totalOver") : t("totalRemaining")}
          value={money(budget.totals.remaining.replace(/^-/, ""))}
        />
      </div>

      <BudgetEditor key={budget.year} budget={budget} />
    </>
  );
}
