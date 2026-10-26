import { canAnywhere, EXPENSE_STATUSES, expenseListQuery, formatNumber, formatTaka, pick, type Locale } from "@s57/shared";
import { CalendarDays, CheckCheck, Clock, Plus, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { ExpensesTable } from "@/components/expenses/expenses-table";
import { Field, inputClass, PageHeader, SearchInput, StatCard } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link, redirect } from "@/i18n/navigation";
import { getExpenseOptions, getExpenses } from "@/lib/api/expenses";
import { getMe } from "@/lib/api/session";

const PAGE_SIZE = 25;
const FILTERS = ["q", "status", "headId", "fundId", "vendorId", "from", "to", "requestedBy"] as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/expenses">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.expenses") };
}

/** The expenses list: what waits for approval or payment, what was paid, filters and totals. */
export default async function ExpensesPage({ params, searchParams }: PageProps<"/[locale]/dashboard/expenses">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await getMe();
  if (!me) notFound();
  if (!canAnywhere(me.access, "expenses")) {
    if (canAnywhere(me.access, "budgets")) redirect({ href: "/dashboard/expenses/budget", locale });
    notFound();
  }
  const canCreate = canAnywhere(me.access, "expenses", "create");
  // A bad filter in the URL is dropped rather than failing the page.
  const search = await searchParams;
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  const parsed = expenseListQuery.safeParse({ ...Object.fromEntries(FILTERS.map((key) => [key, text(key)])), page: search["page"] ?? 1, pageSize: PAGE_SIZE });
  const query = parsed.success ? parsed.data : { page: 1, pageSize: PAGE_SIZE };

  const [t, tNav, list, options] = await Promise.all([getTranslations("Expenses"), getTranslations("Dashboard.nav"), getExpenses(query), getExpenseOptions()]);
  const filters = Object.fromEntries(FILTERS.flatMap((key) => (query[key] ? [[key, query[key]]] : []))) as Record<string, string>;
  const filtered = Object.keys(filters).length > 0;
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const n = (value: number) => formatNumber(value, locale);
  const showFund = options.separateFunds || options.funds.length > 1 || new Set(list.items.map((row) => row.fund.id)).size > 1;
  const { summary } = list;

  return (
    <>
      <PageHeader
        title={tNav("expenses")}
        sub={t("sub")}
        actions={
          canCreate ? (
            <Link href="/dashboard/expenses/new" className={buttonVariants()}>
              <Plus aria-hidden />
              {t("new")}
            </Link>
          ) : null
        }
      />

      <div className="mb-3.5 grid gap-2.5 min-[600px]:grid-cols-2 min-[1100px]:grid-cols-4">
        <Link href={{ pathname: "/dashboard/expenses", query: { status: "pending" } }}>
          <StatCard icon={Clock} tone="warn" label={t("stat.pending")} value={n(summary.pending.count)} note={formatTaka(summary.pending.amount, locale)} />
        </Link>
        <Link href={{ pathname: "/dashboard/expenses", query: { status: "approved" } }}>
          <StatCard icon={CheckCheck} tone="info" label={t("stat.approved")} value={n(summary.approved.count)} note={formatTaka(summary.approved.amount, locale)} />
        </Link>
        <StatCard icon={CalendarDays} label={t("stat.paidMonth")} value={formatTaka(summary.paidMonth.amount, locale)} note={t("stat.count", { count: n(summary.paidMonth.count) })} />
        <StatCard
          icon={Wallet}
          tone="acc"
          label={t("stat.paidYear", { year: summary.paidYear.label })}
          value={formatTaka(summary.paidYear.amount, locale)}
          note={t("stat.count", { count: n(summary.paidYear.count) })}
        />
      </div>

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-end gap-2.5">
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("searchLabel")} />
        <select name="status" defaultValue={query.status ?? ""} aria-label={t("col.status")} className={`${inputClass} sm:w-auto!`}>
          <option value="">{t("allStatus")}</option>
          {EXPENSE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`status.${status}`)}
            </option>
          ))}
        </select>
        <select name="headId" defaultValue={query.headId ?? ""} aria-label={t("col.head")} className={`${inputClass} sm:w-auto!`}>
          <option value="">{t("allHeads")}</option>
          {options.heads.map((head) => (
            <option key={head.id} value={head.id}>
              {pick(head.nameBn, head.nameEn, locale)}
            </option>
          ))}
        </select>
        {showFund ? (
          <select name="fundId" defaultValue={query.fundId ?? ""} aria-label={t("col.fund")} className={`${inputClass} sm:w-auto!`}>
            <option value="">{t("allFunds")}</option>
            {options.funds.map((fund) => (
              <option key={fund.id} value={fund.id}>
                {pick(fund.nameBn, fund.nameEn, locale)}
              </option>
            ))}
          </select>
        ) : null}
        {options.vendors.length ? (
          <select name="vendorId" defaultValue={query.vendorId ?? ""} aria-label={t("col.vendor")} className={`${inputClass} sm:w-auto!`}>
            <option value="">{t("allVendors")}</option>
            {options.vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        ) : null}
        <Field label={t("from")} htmlFor="from">
          <input id="from" type="date" name="from" defaultValue={query.from ?? ""} className={`${inputClass} sm:w-auto!`} />
        </Field>
        <Field label={t("to")} htmlFor="to">
          <input id="to" type="date" name="to" defaultValue={query.to ?? ""} className={`${inputClass} sm:w-auto!`} />
        </Field>
        {canCreate ? (
          <label className="flex items-center gap-2 py-2 text-[13.5px]">
            <input type="checkbox" name="requestedBy" value="me" defaultChecked={query.requestedBy === "me"} className="size-4 accent-[var(--accent-brand)]" />
            {t("mine")}
          </label>
        ) : null}
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
        {filtered ? (
          <Link href="/dashboard/expenses" className="py-2 text-[13.5px] font-semibold text-primary">
            {t("clear")}
          </Link>
        ) : null}
      </form>

      <p className="num mb-2.5 text-[13.5px] text-muted-foreground">{t("totals", { count: n(list.totals.count), amount: formatTaka(list.totals.amount, locale) })}</p>
      <ExpensesTable rows={list.items} locale={locale} showFund={showFund} empty={filtered ? t("emptyFiltered") : t("empty")} />
      <Pager
        locale={locale}
        page={query.page}
        pages={pages}
        href={(target) => ({ pathname: "/dashboard/expenses", query: { ...filters, ...(target > 1 ? { page: String(target) } : {}) } })}
      />
    </>
  );
}
