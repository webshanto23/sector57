import { canAnywhere, formatNumber, formatTaka, type Locale } from "@s57/shared";
import { HandCoins, ListChecks, Receipt, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { CollectForm } from "@/components/collect/collect-form";
import { HandoverButton } from "@/components/collect/handover-button";
import { ReceiptsTable } from "@/components/collect/receipts-table";
import { Card, PageHeader, StatCard } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getCollectSummary, getPayments, lookupCollect } from "@/lib/api/payments";
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
 * starts with that unit or member; `?invoiceId=` (from a bill page) ticks only that bill.
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
  const invoiceId = id("invoiceId");
  const today = todayInDhaka();

  const [t, tNav, summary, start, receipts] = await Promise.all([
    getTranslations("Collect"),
    getTranslations("Dashboard.nav"),
    canCollect ? getCollectSummary() : Promise.resolve(null),
    canCollect && (unitId || personId || organisationId) ? lookupCollect({ unitId, personId, organisationId }) : Promise.resolve(null),
    canCollect ? getPayments({ collectorId: "me", from: today, to: today, pageSize: 20 }) : Promise.resolve(null),
  ]);
  const initial = start?.accounts.find((account) => (unitId ? account.kind === "unit" : account.kind === "member")) ?? null;
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
          <CollectForm initial={initial} startBillId={invoiceId} header={summary.header} collector={me.name ?? me.phone} today={today} />

          <div className="grid gap-2.5 min-[600px]:grid-cols-3">
            <StatCard
              icon={Receipt}
              label={t("stat.today")}
              value={n(summary.today.count)}
              note={formatTaka(summary.today.amount, locale)}
            />
            <StatCard
              icon={Wallet}
              label={t("stat.inHand")}
              value={formatTaka(summary.inHand.amount, locale)}
              note={summary.pending.count ? `${t("stat.pending")}: ${formatTaka(summary.pending.amount, locale)}` : t("stat.inHandNote")}
              tone="warn"
            />
            <Card className="grid content-start gap-2">
              <span className="text-[13px] font-medium text-muted-foreground">{t("endOfDay")}</span>
              {summary.inHand.count ? (
                <HandoverButton amount={formatTaka(summary.inHand.amount, locale)} disabled={false} />
              ) : (
                <p className="text-[13.5px] text-muted-foreground">{t("nothingInHand")}</p>
              )}
            </Card>
          </div>

          <section className="grid gap-2">
            <h2>{t("todayReceipts")}</h2>
            <ReceiptsTable rows={receipts.items} locale={locale} empty={t("noReceipts")} hide={["by"]} />
          </section>
        </div>
      ) : (
        <Note>{t("cannotCollect")}</Note>
      )}
    </>
  );
}
