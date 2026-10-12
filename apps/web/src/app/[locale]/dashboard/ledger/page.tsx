import { canAnywhere, canSocietyWide, formatDate, formatTaka, LEDGER_ACCOUNTS, ledgerQuery, pick, type Locale } from "@s57/shared";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Scale, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { Pager } from "@/components/cms/pager";
import { Field, inputClass, PageHeader, StatCard } from "@/components/kit";
import { FundBalances } from "@/components/ledger/fund-balances";
import { LedgerTable } from "@/components/ledger/ledger-table";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getFunds } from "@/lib/api/finance";
import { getLedger } from "@/lib/api/reports";
import { requirePermission } from "@/lib/api/session";

const PAGE_SIZE = 50;
const FILTERS = ["fundId", "account", "from", "to"] as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/ledger">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.ledger") };
}

/** Balances now, then a statement: the balance before the dates, every entry with the running balance, the balance after. */
export default async function LedgerPage({ params, searchParams }: PageProps<"/[locale]/dashboard/ledger">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("ledger");
  // A bad filter in the URL is dropped rather than failing the page.
  const search = await searchParams;
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  const parsed = ledgerQuery.safeParse({ ...Object.fromEntries(FILTERS.map((key) => [key, text(key)])), page: search["page"] ?? 1, pageSize: PAGE_SIZE });
  const query = parsed.success ? parsed.data : { page: 1, pageSize: PAGE_SIZE };

  const [t, tNav, tFunds, tErrors, funds, found] = await Promise.all([
    getTranslations("Ledger"),
    getTranslations("Dashboard.nav"),
    getTranslations("Finance.funds"),
    getTranslations("Admin.errors"),
    getFunds(),
    getLedger(query),
  ]);
  // A backwards range (or a fund that isn't ours) falls back to this month, with a note.
  const statement = found ?? (await getLedger({ page: 1, pageSize: PAGE_SIZE }));
  if (!statement) throw new Error("Could not load the ledger");
  const filters = Object.fromEntries(FILTERS.flatMap((key) => (query[key] ? [[key, query[key]]] : []))) as Record<string, string>;
  const pages = Math.max(1, Math.ceil(statement.total / PAGE_SIZE));
  const manyFunds = statement.funds.length > 1;
  const links = {
    receipt: canAnywhere(me.access, "payments"),
    donation: canAnywhere(me.access, "donations"),
    expense: canAnywhere(me.access, "expenses"),
    transfer: true,
    fund: true,
  };

  return (
    <>
      <PageHeader
        title={tNav("ledger")}
        sub={t("sub")}
        actions={
          canSocietyWide(me.access, "ledger", "create") ? (
            <Link href="/dashboard/ledger/transfers/new" className={buttonVariants()}>
              <ArrowRightLeft aria-hidden />
              {t("newTransfer")}
            </Link>
          ) : null
        }
      />

      <FundBalances funds={funds.items} locale={locale} selected={statement.fundId} />

      <form method="get" className="mb-3.5 flex flex-wrap items-end gap-2.5">
        {manyFunds ? (
          <Field label={t("fund")} htmlFor="ledger-fund">
            <select id="ledger-fund" name="fundId" defaultValue={statement.fundId ?? ""} className={`${inputClass} w-auto`}>
              <option value="">{t("allFunds")}</option>
              {statement.funds.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {pick(fund.nameBn, fund.nameEn, locale)}
                  {fund.closed ? ` (${t("closedFund")})` : ""}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label={t("account")} htmlFor="ledger-account">
          <select id="ledger-account" name="account" defaultValue={statement.account ?? ""} className={`${inputClass} w-auto`}>
            <option value="">{t("bothAccounts")}</option>
            {LEDGER_ACCOUNTS.map((account) => (
              <option key={account} value={account}>
                {tFunds(account)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("from")} htmlFor="ledger-from">
          <input id="ledger-from" type="date" name="from" defaultValue={statement.from} className={`${inputClass} w-auto`} />
        </Field>
        <Field label={t("to")} htmlFor="ledger-to">
          <input id="ledger-to" type="date" name="to" defaultValue={statement.to} className={`${inputClass} w-auto`} />
        </Field>
        <Button type="submit" variant="outline">
          {t("show")}
        </Button>
      </form>
      {!found ? (
        <div className="mb-3.5">
          <Note tone="warn">{tErrors("invalid_range")}</Note>
        </div>
      ) : null}

      <div className="mb-3.5 grid gap-2.5 min-[381px]:grid-cols-2 min-[1100px]:grid-cols-4">
        <StatCard icon={Wallet} label={t("opening", { date: formatDate(statement.from, locale, "short") })} value={formatTaka(statement.opening, locale)} />
        <StatCard icon={ArrowDownLeft} tone="info" label={t("in")} value={formatTaka(statement.totalIn, locale)} />
        <StatCard icon={ArrowUpRight} tone="warn" label={t("out")} value={formatTaka(statement.totalOut, locale)} />
        <StatCard icon={Scale} tone="acc" label={t("closing", { date: formatDate(statement.to, locale, "short") })} value={formatTaka(statement.closing, locale)} />
      </div>

      <LedgerTable
        rows={statement.items}
        locale={locale}
        showFund={manyFunds && !statement.fundId}
        showAccount={!statement.account}
        links={links}
        empty={t("empty")}
      />
      <Pager
        locale={locale}
        page={statement.page}
        pages={pages}
        href={(target) => ({ pathname: "/dashboard/ledger", query: { ...filters, ...(target > 1 ? { page: String(target) } : {}) } })}
      />
    </>
  );
}
