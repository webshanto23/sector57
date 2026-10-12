import { canAnywhere, canSocietyWide, formatDate, pick, type Locale } from "@s57/shared";
import { ChevronLeft, Plus } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { PaymentVoidPanel } from "@/components/collect/payment-void-panel";
import { donationLine, Receipt, receiptOf } from "@/components/collect/receipt";
import { ReceiptPrint } from "@/components/collect/receipt-print";
import { ReceiptStatusChip } from "@/components/collect/receipts-table";
import { Card, PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getDonation } from "@/lib/api/donations";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/donations/[id]">): Promise<Metadata> {
  const { id } = await params;
  await requirePermission("donations");
  const donation = await getDonation(id);
  return donation ? { title: donation.receiptNo } : {};
}

/** One donation: its receipt as printed, fund and purpose, printing (original, then duplicates) and voiding. */
export default async function DonationPage({ params, searchParams }: PageProps<"/[locale]/dashboard/donations/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("donations");
  const [t, tCollect, tReceipt, donation] = await Promise.all([
    getTranslations("Donations"),
    getTranslations("Collect"),
    getTranslations("Collect.receipt"),
    getDonation(id),
  ]);
  if (!donation) notFound();
  const { print } = await searchParams;
  const receipt = donation.receipt;
  const where = receipt.voided ? null : !receipt.handover ? "inHand" : receipt.handover.confirmed ? "confirmed" : "pending";
  const donorHref =
    donation.donor && canAnywhere(me.access, "members")
      ? donation.donor.kind === "person"
        ? `/dashboard/members/${donation.donor.id}`
        : `/dashboard/members/organisations/${donation.donor.id}`
      : null;

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{donation.receiptNo}</span>}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            {formatDate(donation.receivedAt, locale, "stamp")}
            <ReceiptStatusChip row={receipt} />
          </span>
        }
        actions={
          <>
            <Link href="/dashboard/donations" className={buttonVariants({ variant: "outline" })}>
              <ChevronLeft aria-hidden />
              {t("detail.back")}
            </Link>
            {canAnywhere(me.access, "donations", "create") ? (
              <Link href="/dashboard/donations/new" className={buttonVariants({ variant: "outline" })}>
                <Plus aria-hidden />
                {t("detail.another")}
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3.5 min-[900px]:grid-cols-[minmax(0,1fr)_340px] min-[900px]:items-start">
        <div className="grid gap-3.5">
          {receipt.void ? (
            <Note tone="warn">
              {tCollect("detail.voided", {
                by: receipt.void.by ?? tCollect("detail.someone"),
                date: formatDate(receipt.void.at, locale, "stamp"),
                reason: receipt.void.reason,
              })}
            </Note>
          ) : null}
          <div className="max-w-[560px]">
            <Receipt data={receiptOf(receipt, locale, null, (purpose) => donationLine(tReceipt, purpose))} locale={locale} />
          </div>
        </div>

        <div className="grid gap-3.5">
          <Card className="grid gap-3">
            <ReceiptPrint payment={receipt} donationId={donation.id} autoPrint={print === "1"} />
            {where ? <p className="text-[13px] text-muted-foreground">{tCollect(`detail.${where}`)}</p> : null}
          </Card>
          <Card className="grid gap-2 text-[13.5px]">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5">
              <dt className="text-muted-foreground">{t("detail.fund")}</dt>
              <dd>{pick(donation.fund.nameBn, donation.fund.nameEn, locale)}</dd>
              <dt className="text-muted-foreground">{t("detail.purpose")}</dt>
              <dd>
                {donation.purpose ? (
                  <Link href={{ pathname: "/dashboard/donations", query: { purpose: donation.purpose } }} className="text-primary">
                    {donation.purpose}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </dl>
            {donorHref ? (
              <Link href={donorHref} className="font-semibold text-primary">
                {t("detail.donorPage")}
              </Link>
            ) : null}
            {canSocietyWide(me.access, "payments") ? (
              <Link href={`/dashboard/collect/receipts/${receipt.id}`} className="font-semibold text-primary">
                {t("detail.receipt")}
              </Link>
            ) : null}
          </Card>
          {donation.can.void ? <PaymentVoidPanel id={receipt.id} donationId={donation.id} /> : null}
        </div>
      </div>
    </>
  );
}
