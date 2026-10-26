import { canAnywhere, donationListQuery, formatNumber, formatTaka, pick, type Locale } from "@s57/shared";
import { CalendarDays, HandCoins, HandHeart, Plus, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { HandoverButton } from "@/components/collect/handover-button";
import { DonationsTable } from "@/components/donations/donations-table";
import { Card, Field, inputClass, PageHeader, SearchInput, StatCard } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getDonations } from "@/lib/api/donations";
import { requirePermission } from "@/lib/api/session";

const PAGE_SIZE = 25;
const FILTERS = ["q", "from", "to", "fundId", "purpose", "status", "personId", "organisationId"] as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/donations">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.donations") };
}

/**
 * Donations, newest first: this month and this fiscal year, totals by fund and by purpose
 * for the current filter, and (for whoever takes donations) their cash in hand.
 */
export default async function DonationsPage({ params, searchParams }: PageProps<"/[locale]/dashboard/donations">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("donations");
  const canCreate = canAnywhere(me.access, "donations", "create");
  // A bad filter in the URL is dropped rather than failing the page.
  const search = await searchParams;
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  const parsed = donationListQuery.safeParse({ ...Object.fromEntries(FILTERS.map((key) => [key, text(key)])), page: search["page"] ?? 1, pageSize: PAGE_SIZE });
  const query = parsed.success ? parsed.data : { page: 1, pageSize: PAGE_SIZE };

  const [t, tNav, list] = await Promise.all([getTranslations("Donations"), getTranslations("Dashboard.nav"), getDonations(query)]);
  const filters = Object.fromEntries(FILTERS.flatMap((key) => (query[key] ? [[key, query[key]]] : []))) as Record<string, string>;
  const filtered = Object.keys(filters).length > 0;
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const n = (value: number) => formatNumber(value, locale);
  // The fund only matters once donations sit in more than one.
  const showFund = list.totals.byFund.length > 1 || new Set(list.items.map((row) => row.fund.id)).size > 1 || Boolean(query.fundId);
  const { summary, cash } = list;

  return (
    <>
      <PageHeader
        title={tNav("donations")}
        sub={t("sub")}
        actions={
          canCreate ? (
            <>
              <Link href="/dashboard/collect/handovers" className={buttonVariants({ variant: "outline" })}>
                <HandCoins aria-hidden />
                {t("handovers")}
              </Link>
              <Link href="/dashboard/donations/new" className={buttonVariants()}>
                <Plus aria-hidden />
                {t("new")}
              </Link>
            </>
          ) : null
        }
      />

      <div className={`mb-3.5 grid gap-2.5 min-[600px]:grid-cols-2 ${canCreate ? "min-[1100px]:grid-cols-4" : "min-[1100px]:grid-cols-3"}`}>
        <StatCard icon={CalendarDays} label={t("stat.month")} value={formatTaka(summary.month.amount, locale)} note={t("stat.count", { count: n(summary.month.count) })} />
        <StatCard
          icon={HandHeart}
          tone="acc"
          label={t("stat.year", { year: summary.fiscalYear.label })}
          value={formatTaka(summary.fiscalYear.amount, locale)}
          note={t("stat.count", { count: n(summary.fiscalYear.count) })}
        />
        <StatCard icon={Users} tone="info" label={t("stat.donors")} value={n(summary.fiscalYear.donors)} />
        {canCreate ? (
          <Card className="grid gap-2">
            <StatCardInline
              label={t("stat.inHand")}
              value={formatTaka(cash.inHand.amount, locale)}
              note={[
                t("stat.inHandNote", { count: n(cash.inHand.count) }),
                cash.pending.count ? t("stat.pending", { amount: formatTaka(cash.pending.amount, locale) }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
            <HandoverButton amount={formatTaka(cash.inHand.amount, locale)} disabled={cash.inHand.count === 0} />
          </Card>
        ) : null}
      </div>

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-end gap-2.5">
        {(["purpose", "personId", "organisationId"] as const).map((key) => (query[key] ? <input key={key} type="hidden" name={key} value={query[key]} /> : null))}
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("searchLabel")} />
        <Field label={t("from")} htmlFor="from">
          <input id="from" type="date" name="from" defaultValue={query.from ?? ""} className={`${inputClass} sm:w-auto!`} />
        </Field>
        <Field label={t("to")} htmlFor="to">
          <input id="to" type="date" name="to" defaultValue={query.to ?? ""} className={`${inputClass} sm:w-auto!`} />
        </Field>
        {showFund ? (
          <select name="fundId" defaultValue={query.fundId ?? ""} aria-label={t("col.fund")} className={`${inputClass} sm:w-auto!`}>
            <option value="">{t("allFunds")}</option>
            {list.totals.byFund.map(({ fund }) => (
              <option key={fund.id} value={fund.id}>
                {pick(fund.nameBn, fund.nameEn, locale)}
              </option>
            ))}
          </select>
        ) : null}
        <select name="status" defaultValue={query.status ?? ""} aria-label={t("col.status")} className={`${inputClass} sm:w-auto!`}>
          <option value="">{t("allStatus")}</option>
          <option value="valid">{t("valid")}</option>
          <option value="void">{t("void")}</option>
        </select>
        <Button type="submit" variant="outline">
          {t("filter")}
        </Button>
        {filtered ? (
          <Link href="/dashboard/donations" className="py-2 text-[13.5px] font-semibold text-primary">
            {t("clear")}
          </Link>
        ) : null}
      </form>

      {query.purpose ? <p className="mb-2.5 text-[13.5px] font-semibold">{t("purposeFilter", { purpose: query.purpose })}</p> : null}

      <div className="grid gap-3.5 min-[1100px]:grid-cols-[minmax(0,1fr)_300px] min-[1100px]:items-start">
        <div className="grid gap-2.5">
          <p className="num text-[13.5px] text-muted-foreground">
            {t("totals", { count: n(list.totals.count), amount: formatTaka(list.totals.amount, locale) })}
            {list.totals.voidCount ? ` · ${t("voidCount", { count: n(list.totals.voidCount) })}` : null}
          </p>
          <DonationsTable rows={list.items} locale={locale} showFund={showFund} empty={filtered ? t("emptyFiltered") : t("empty")} />
          <Pager
            locale={locale}
            page={query.page}
            pages={pages}
            href={(target) => ({ pathname: "/dashboard/donations", query: { ...filters, ...(target > 1 ? { page: String(target) } : {}) } })}
          />
        </div>

        {list.totals.count > 0 ? (
          <div className="grid gap-3.5">
            {showFund ? (
              <Card className="grid gap-2">
                <h2 className="flex items-center gap-2 text-[15px]">
                  <Wallet aria-hidden className="size-4 text-muted-foreground" />
                  {t("byFund")}
                </h2>
                <ul className="grid gap-1.5 text-[13.5px]">
                  {list.totals.byFund.map((row) => (
                    <li key={row.fund.id} className="flex items-baseline justify-between gap-3">
                      <Link href={{ pathname: "/dashboard/donations", query: { ...filters, fundId: row.fund.id } }} className="min-w-0 text-primary">
                        {pick(row.fund.nameBn, row.fund.nameEn, locale)}
                      </Link>
                      <span className="num whitespace-nowrap">{formatTaka(row.amount, locale)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
            <Card className="grid gap-2">
              <h2 className="text-[15px]">{t("byPurpose")}</h2>
              <ul className="grid gap-1.5 text-[13.5px]">
                {list.totals.byPurpose.map((row) => (
                  <li key={row.purpose ?? ""} className="flex items-baseline justify-between gap-3">
                    {row.purpose ? (
                      <Link href={{ pathname: "/dashboard/donations", query: { ...filters, purpose: row.purpose } }} className="min-w-0 text-primary">
                        {row.purpose}
                      </Link>
                    ) : (
                      <span className="min-w-0 text-muted-foreground">{t("noPurpose")}</span>
                    )}
                    <span className="num whitespace-nowrap">
                      {formatTaka(row.amount, locale)} <span className="text-muted-foreground">({n(row.count)})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}

/** The stat card's text inside a card that also holds the hand-over button. */
function StatCardInline({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
      <div className="num text-xl leading-[1.2] font-bold min-[600px]:text-[25px]">{value}</div>
      <div className="num text-[12.5px] text-muted-foreground">{note}</div>
    </div>
  );
}
