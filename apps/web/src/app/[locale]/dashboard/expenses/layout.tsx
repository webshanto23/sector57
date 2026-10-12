import { canAnywhere, type Locale } from "@s57/shared";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { ExpensesTabs, type ExpensesTab } from "@/components/expenses/expenses-tabs";
import { getMe } from "@/lib/api/session";

/** Expenses, the budget, and heads and vendors, each shown only to who may open it. */
export default async function ExpensesLayout({ params, children }: LayoutProps<"/[locale]/dashboard/expenses">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const me = await getMe();
  if (!me) notFound();
  const tabs: ExpensesTab[] = [
    ...(canAnywhere(me.access, "expenses") ? (["expenses"] as const) : []),
    ...(canAnywhere(me.access, "budgets") ? (["budget"] as const) : []),
    ...(canAnywhere(me.access, "expenses", "edit") ? (["setup"] as const) : []),
  ];
  if (tabs.length === 0) notFound();

  return (
    <>
      <ExpensesTabs tabs={tabs} />
      {children}
    </>
  );
}
