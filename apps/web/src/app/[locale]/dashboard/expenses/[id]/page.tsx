import { canAnywhere, formatDate, formatTaka, pick, type Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { ExpenseActions } from "@/components/expenses/expense-actions";
import { ExpenseStatusChip } from "@/components/expenses/expenses-table";
import { VoucherPrint } from "@/components/expenses/voucher-print";
import { VouchersPanel } from "@/components/expenses/vouchers-panel";
import { Card, PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getExpense, getExpenseOptions } from "@/lib/api/expenses";
import { requirePermission } from "@/lib/api/session";
import { todayInDhaka } from "@/lib/dhaka-time";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/expenses/[id]">): Promise<Metadata> {
  const { id } = await params;
  await requirePermission("expenses");
  const expense = await getExpense(id);
  return expense ? { title: expense.voucherNo ?? expense.description } : {};
}

/** One expense: what it is for, every step so far, its vouchers, the next step and the printable voucher. */
export default async function ExpensePage({ params }: PageProps<"/[locale]/dashboard/expenses/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("expenses");
  const [t, tAccount, expense] = await Promise.all([getTranslations("Expenses"), getTranslations("Finance.funds"), getExpense(id)]);
  if (!expense) notFound();
  const options = expense.can.edit ? await getExpenseOptions() : null;
  const at = (value: string) => formatDate(value, locale, "stamp");
  const steps = [
    { key: "requested", text: t("detail.requested", { by: expense.requestedBy?.name ?? t("detail.someone"), date: at(expense.createdAt) }) },
    expense.approved ? { key: "approved", text: t("detail.approvedStep", { by: expense.approved.by ?? t("detail.someone"), date: at(expense.approved.at) }) } : null,
    expense.rejected
      ? { key: "rejected", text: t("detail.rejectedStep", { by: expense.rejected.by ?? t("detail.someone"), date: at(expense.rejected.at), reason: expense.rejected.reason }) }
      : null,
    expense.paid
      ? {
          key: "paid",
          text: t("detail.paidStep", { by: expense.paid.by ?? t("detail.someone"), date: at(expense.paid.at), account: tAccount(expense.paid.account), no: expense.voucherNo ?? "" }),
        }
      : null,
    expense.void ? { key: "void", text: t("detail.voidStep", { by: expense.void.by ?? t("detail.someone"), date: at(expense.void.at), reason: expense.void.reason }) } : null,
  ].filter((step) => step !== null);

  return (
    <>
      <PageHeader
        title={expense.description}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            {expense.voucherNo ? <span className="font-mono">{expense.voucherNo}</span> : null}
            {formatDate(expense.spentOn, locale)}
            <ExpenseStatusChip status={expense.status} />
          </span>
        }
        actions={
          <Link href="/dashboard/expenses" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("detail.back")}
          </Link>
        }
      />

      <div className="grid gap-3.5 min-[900px]:grid-cols-[minmax(0,1fr)_360px] min-[900px]:items-start">
        <div className="grid gap-3.5">
          <Card className="grid gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[13px] text-muted-foreground">{t("detail.amount")}</span>
              <span className="num text-2xl font-bold">{formatTaka(expense.amount, locale)}</span>
            </div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13.5px]">
              <dt className="text-muted-foreground">{t("col.head")}</dt>
              <dd>{pick(expense.head.nameBn, expense.head.nameEn, locale)}</dd>
              <dt className="text-muted-foreground">{t("col.fund")}</dt>
              <dd>{pick(expense.fund.nameBn, expense.fund.nameEn, locale)}</dd>
              <dt className="text-muted-foreground">{t("col.vendor")}</dt>
              <dd>{expense.vendor ? [expense.vendor.name, expense.vendor.phone].filter(Boolean).join(" · ") : "—"}</dd>
            </dl>
            {expense.budget ? (
              <p className={`num text-[13px] ${expense.budget.over ? "text-bad" : "text-muted-foreground"}`}>
                {t(expense.budget.over ? "detail.budgetOver" : "detail.budget", {
                  year: expense.budget.year,
                  amount: formatTaka(expense.budget.amount, locale),
                  remaining: formatTaka(expense.budget.remaining.replace(/^-/, ""), locale),
                })}
              </p>
            ) : null}
          </Card>

          <Card className="grid gap-2">
            <h2 className="text-[15px]">{t("detail.history")}</h2>
            <ol className="grid gap-1.5 border-l-2 border-line pl-3 text-[13.5px]">
              {steps.map((step) => (
                <li key={step.key}>{step.text}</li>
              ))}
            </ol>
          </Card>

          <VouchersPanel expense={expense} />
        </div>

        <div className="grid gap-3.5">
          {expense.status === "void" ? <Note tone="warn">{t("detail.isVoid")}</Note> : null}
          {expense.status === "pending" && expense.requestedBy?.id === me.id && !expense.can.approve ? <Note>{t("detail.waiting")}</Note> : null}
          <ExpenseActions expense={expense} options={options} today={todayInDhaka()} />
          {expense.paid ? (
            <Card className="grid gap-2">
              <VoucherPrint expense={expense} />
            </Card>
          ) : null}
          {canAnywhere(me.access, "budgets") && expense.budget ? (
            <Link href={{ pathname: "/dashboard/expenses/budget", query: { year: expense.budget.year } }} className="text-[13.5px] font-semibold text-primary">
              {t("detail.openBudget")}
            </Link>
          ) : null}
        </div>
      </div>
    </>
  );
}
