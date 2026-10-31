import { canAnywhere, formatNumber, formatTaka, type Locale } from "@s57/shared";
import { HandCoins, ListChecks } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { CollectForm } from "@/components/collect/collect-form";
import { HandoverButton } from "@/components/collect/handover-button";
import { ReceiptsTable } from "@/components/collect/receipts-table";
import { Card, PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getCollectAreas, getCollectSummary, getPayments, lookupCollect } from "@/lib/api/payments";
import { requirePermission } from "@/lib/api/session";
import { todayInDhaka } from "@/lib/dhaka-time";

const UUID = /^[0-9a-f-]{36}$/i;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/collect">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.collect") };
}

/**
 * The mockup's cash collection page: take a payment beside the live receipt, the caller's
 * figures for today, and "close day and hand over". `?unitId=`, `?personId=` or `?organisationId=`
 * starts with that unit or member; `?invoiceId=` (from a bill page or the bills list, repeatable)
 * ticks only those bills.
 */
export default async function CollectPage({ params, searchParams }: PageProps<"/[locale]/dashboard/collect">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("payments");
  const canCollect = canAnywhere(me.access, "payments", "create");
  const search = await searchParams;
  const id = (key: string) => (typeof search[key] === "string" && UUID.test(search[key]) ? search[key] : undefined);
  const unitId = id("unitId");
  const personId = unitId ? undefined : id("personId");
  const organisationId = unitId || personId ? undefined : id("organisationId");
  const invoiceIds = [search["invoiceId"] ?? []].flat().filter((value) => UUID.test(value));
  const today = todayInDhaka();

  const chosen = Boolean(unitId || personId || organisationId);
  const [t, tNav, summary, start, receipts, areas] = await Promise.all([
    getTranslations("Collect"),
    getTranslations("Dashboard.nav"),
    canCollect ? getCollectSummary() : Promise.resolve(null),
    // No account chosen: the accounts whose open bills are newest, to pick from.
    canCollect ? lookupCollect(chosen ? { unitId, personId, organisationId } : { open: true }) : Promise.resolve(null),
    canCollect ? getPayments({ collectorId: "me", from: today, to: today, pageSize: 20 }) : Promise.resolve(null),
    canCollect ? getCollectAreas() : Promise.resolve([]),
  ]);
  const initial = chosen ? (start?.accounts.find((account) => (unitId ? account.kind === "unit" : account.kind === "member")) ?? null) : null;
  const openAccounts = chosen ? [] : (start?.accounts ?? []);
  const n = (value: number) => formatNumber(value, locale);

  return (
    <>
      <PageHeader
        title={tNav("collect")}
        sub={t("sub")}
        actions={
          <>
            <Link href="/dashboard/collect/receipts" className={buttonVariants({ variant: "outline" })}>
              <ListChecks aria-hidden />
              {t("allReceipts")}
            </Link>
            <Link href="/dashboard/collect/handovers" className={buttonVariants({ variant: "outline" })}>
              <HandCoins aria-hidden />
              {t("handovers")}
            </Link>
          </>
        }
      />

      {summary && receipts ? (
        <div className="grid gap-3.5">
          <CollectForm
            initial={initial}
            openAccounts={openAccounts}
            areas={areas}
            startBillIds={invoiceIds}
            header={summary.header}
            collector={me.name ?? me.phone}
            today={today}
            summary={
              <Card className="flex flex-wrap items-center gap-x-7 gap-y-2.5">
                <div>
                  <p className="text-[13px] text-muted-foreground">{t("stat.today")}</p>
                  <p className="num font-bold">
                    {n(summary.today.count)} · {formatTaka(summary.today.amount, locale)}
                  </p>
                </div>
                <div>
                  <p className="text-[13px] text-muted-foreground">{t("stat.inHand")}</p>
                  <p className="num font-bold text-warn">{formatTaka(summary.inHand.amount, locale)}</p>
                </div>
                {summary.pending.count ? (
                  <div>
                    <p className="text-[13px] text-muted-foreground">{t("stat.pending")}</p>
                    <p className="num font-bold">{formatTaka(summary.pending.amount, locale)}</p>
                  </div>
                ) : null}
                {summary.inHand.count ? (
                  <div className="min-w-full min-[600px]:ml-auto min-[600px]:min-w-0">
                    <HandoverButton amount={formatTaka(summary.inHand.amount, locale)} disabled={false} />
                  </div>
                ) : null}
              </Card>
            }
            summaryLine={
              <p className="num text-[13px] text-muted-foreground">
                {t("stat.today")} {n(summary.today.count)} · {t("stat.inHand")} <b className="text-warn">{formatTaka(summary.inHand.amount, locale)}</b>
              </p>
            }
            after={
              <section className="grid gap-2">
                <h2>{t("todayReceipts")}</h2>
                <ReceiptsTable rows={receipts.items} locale={locale} empty={t("noReceipts")} hide={["by"]} />
              </section>
            }
          />
        </div>
      ) : (
        <Note>{t("cannotCollect")}</Note>
      )}
    </>
  );
}
