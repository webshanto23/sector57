import { addMoney, formatDate, formatNumber, formatTaka, isoMonth, pick, subtractMoney, type Locale, type Payslip, type PayrollRun } from "@s57/shared";
import { Banknote, MinusCircle, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { paidFrom } from "@/components/finance/method-text";
import { Card, Chip, DataTable, inputClass, PageHeader, StatCard, type Column } from "@/components/kit";
import { PayrollActions, PreparePayroll } from "@/components/payroll/payroll-actions";
import { PAYROLL_STATUS_TONES } from "@/components/payroll/payroll-status";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { todayInDhaka } from "@/lib/dhaka-time";
import { getPayrollMonth } from "@/lib/api/payroll";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/hrm/payroll">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Payroll" });
  return { title: t("title") };
}

/** The month before `month` (`YYYY-MM`). */
const previousMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

/** One month's payroll: last month unless another (not future) month is picked. */
export default async function PayrollPage({ params, searchParams }: PageProps<"/[locale]/dashboard/hrm/payroll">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("payroll");
  const thisMonth = todayInDhaka().slice(0, 7);
  const asked = (await searchParams)["month"];
  const month = typeof asked === "string" && isoMonth.safeParse(asked).success && asked <= thisMonth ? asked : previousMonth(thisMonth);
  const [t, view] = await Promise.all([getTranslations("Payroll"), getPayrollMonth(month)]);
  const monthLabel = formatDate(`${month}-01`, locale, "monthYear");
  const { run } = view;

  return (
    <>
      <PageHeader title={t("title")} sub={t("sub")} />

      <form method="get" className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <label htmlFor="payroll-month" className="text-[13.5px] font-semibold">
          {t("month")}
        </label>
        <input id="payroll-month" name="month" type="month" max={thisMonth} defaultValue={month} className={`${inputClass} sm:w-auto!`} />
        <Button type="submit" variant="outline">
          {t("show")}
        </Button>
      </form>

      {run ? (
        <RunView run={run} view={view} meId={me.id} locale={locale} />
      ) : (
        <Card className="mb-3.5 grid gap-3">
          <h2 className="text-[15px]">{t("none", { month: monthLabel })}</h2>
          <p className="text-[13.5px] text-muted-foreground">{t("noneHint")}</p>
          {view.can.create ? <PreparePayroll month={month} label={t("prepare", { month: monthLabel })} /> : null}
        </Card>
      )}

      {view.voided.length ? (
        <Card className="mt-3.5 grid gap-2">
          <h2 className="text-[15px]">{t("voided")}</h2>
          <ul className="grid gap-1 text-[13.5px] text-muted-foreground">
            {view.voided.map((item) => (
              <li key={item.id}>
                {t("voidedItem", { date: formatDate(item.voidedAt, locale, "short"), reason: item.voidReason, amount: formatTaka(item.net, locale) })}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

async function RunView({ run, view, meId, locale }: { run: PayrollRun; view: Awaited<ReturnType<typeof getPayrollMonth>>; meId: string; locale: Locale }) {
  const [t, tAccount, tMethod] = await Promise.all([getTranslations("Payroll"), getTranslations("Finance.funds"), getTranslations("Finance.method")]);
  const n = (value: number) => formatNumber(value, locale);
  const taka = (amount: string) => formatTaka(amount, locale);
  const when = (at: string) => formatDate(at, locale, "short");
  const who = (user: { name: string } | null) => user?.name ?? t("steps.someone");
  const steps = [
    t("steps.prepared", { name: who(run.preparedBy), date: when(run.preparedAt) }),
    run.approvedAt ? t("steps.approved", { name: who(run.approvedBy), date: when(run.approvedAt) }) : null,
    run.paidAt && run.paidAccount ? t("steps.paid", { name: who(run.paidBy), account: paidFrom(tAccount(run.paidAccount), run.paidMethod && tMethod(run.paidMethod), run.paidMethodRef, run.paidMethod === "cash"), date: when(run.paidAt) }) : null,
    run.voidedAt ? t("steps.voided", { name: who(run.voidedBy), date: when(run.voidedAt), reason: run.voidReason ?? "" }) : null,
  ].filter((step): step is string => step !== null);
  const deductions = addMoney(run.totals.attendanceDeduction, run.totals.deductions);

  const columns: Column<Payslip>[] = [
    {
      key: "staff",
      header: t("table.staff"),
      cell: (slip) => (
        <span className="grid">
          <b>{pick(slip.staff.name, slip.staff.nameEn, locale)}</b>
          <span className="text-[12.5px] text-muted-foreground">
            {formatNumber(slip.staff.staffNo, locale)} · {pick(slip.staff.designationBn, slip.staff.designationEn, locale)}
          </span>
        </span>
      ),
    },
    {
      key: "days",
      header: t("table.days"),
      cell: (slip) => (
        <span className="grid text-[12.5px]">
          <span>{t("table.daysValue", { present: n(slip.presentDays), half: n(slip.halfDays), absent: n(slip.absentDays) })}</span>
          {slip.daysEmployed < slip.daysInMonth ? (
            <span className="text-muted-foreground">{t("table.daysOf", { days: n(slip.daysEmployed), total: n(slip.daysInMonth) })}</span>
          ) : null}
        </span>
      ),
    },
    { key: "base", header: t("table.base"), numeric: true, cell: (slip) => <span className="num">{taka(slip.base)}</span> },
    { key: "deduction", header: t("table.deduction"), numeric: true, cell: (slip) => <span className="num">{taka(slip.attendanceDeduction)}</span> },
    {
      key: "adjust",
      header: t("table.adjust"),
      numeric: true,
      cell: (slip) => <span className="num">{taka(subtractMoney(slip.allowances, slip.deductions))}</span>,
    },
    { key: "net", header: t("table.net"), numeric: true, cell: (slip) => <b className="num">{taka(slip.net)}</b> },
    {
      key: "open",
      header: <span className="sr-only">{t("table.open")}</span>,
      cell: (slip) => (
        <Link href={`/dashboard/hrm/payroll/${run.id}/${slip.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("table.open")}
        </Link>
      ),
    },
  ];

  return (
    <>
      <div className="mb-3.5 grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4">
        <StatCard icon={Users} label={t("stats.staff")} value={n(run.totals.count)} tone="info" />
        <StatCard icon={Banknote} label={t("stats.base")} value={taka(run.totals.base)} tone="acc" />
        <StatCard icon={MinusCircle} label={t("stats.deductions")} value={taka(deductions)} tone="sun" />
        <StatCard icon={Wallet} label={t("stats.net")} value={taka(run.totals.net)} tone="acc" />
      </div>

      <div className="mb-3.5 grid gap-3.5 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <Card className="grid content-start gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px]">{formatDate(`${run.month}-01`, locale, "monthYear")}</h2>
            <Chip tone={PAYROLL_STATUS_TONES[run.status]}>{t(`status.${run.status}`)}</Chip>
          </div>
          <ul className="grid gap-1 text-[13.5px] text-muted-foreground">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
          <div className="grid gap-1.5">
            <h3 className="text-[13.5px] font-semibold">{t("byFund")}</h3>
            {run.byFund.map((entry) => (
              <div key={entry.fund.id} className="flex justify-between gap-3 text-[13.5px]">
                <span>{pick(entry.fund.nameBn, entry.fund.nameEn, locale)}</span>
                <span className="num">{taka(entry.net)}</span>
              </div>
            ))}
          </div>
          {run.expenses.length ? (
            <div className="grid gap-1.5">
              <h3 className="text-[13.5px] font-semibold">{t("expenses")}</h3>
              {run.expenses.map((expense) => (
                <Link key={expense.id} href={`/dashboard/expenses/${expense.id}`} className="flex justify-between gap-3 text-[13.5px] hover:underline">
                  <span className="font-mono">{expense.voucherNo ? t("voucher", { no: expense.voucherNo }) : "—"}</span>
                  <span className="num">{taka(expense.amount)}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </Card>
        <PayrollActions run={run} heads={view.heads} meId={meId} />
      </div>

      <DataTable columns={columns} rows={run.payslips} rowKey={(slip) => slip.id} caption={t("table.caption")} empty={t("table.empty")} />
    </>
  );
}
