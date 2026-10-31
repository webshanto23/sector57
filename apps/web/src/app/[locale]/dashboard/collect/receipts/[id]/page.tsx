import { canAnywhere, formatDate, formatTaka, pick, type Locale } from "@s57/shared";
import { ChevronLeft, Plus } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { PaymentVoidPanel } from "@/components/collect/payment-void-panel";
import { donationLine, Receipt, receiptOf } from "@/components/collect/receipt";
import { ReceiptPrint } from "@/components/collect/receipt-print";
import { ReceiptStatusChip } from "@/components/collect/receipts-table";
import { Card, DataTable, PageHeader, type Column } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getPayment } from "@/lib/api/payments";
import { requirePermission } from "@/lib/api/session";
import type { PaymentAllocation } from "@s57/shared";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/collect/receipts/[id]">): Promise<Metadata> {
  const { id } = await params;
  await requirePermission("payments");
  const payment = await getPayment(id);
  return payment ? { title: payment.receiptNo } : {};
}

/** One receipt: as printed, the bills it settled, printing (original, then duplicates) and voiding. */
export default async function ReceiptPage({ params, searchParams }: PageProps<"/[locale]/dashboard/collect/receipts/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("payments");
  const [t, tBilling, tDonations, payment] = await Promise.all([
    getTranslations("Collect"),
    getTranslations("Billing"),
    getTranslations("Donations"),
    getPayment(id),
  ]);
  const tReceipt = await getTranslations("Collect.receipt");
  if (!payment) notFound();
  const { print } = await searchParams;
  const columns: Column<PaymentAllocation>[] = [
    {
      key: "bill",
      header: tBilling("col.invoice"),
      cell: (row) =>
        canAnywhere(me.access, "billing") ? (
          <Link href={`/dashboard/billing/${row.invoiceId}`} className="font-mono text-[13px] font-semibold text-primary">
            {row.invoiceNo}
          </Link>
        ) : (
          <span className="font-mono text-[13px]">{row.invoiceNo}</span>
        ),
    },
    { key: "date", header: tBilling("col.date"), cell: (row) => formatDate(row.issueDate, locale, "short") },
    { key: "total", header: tBilling("detail.total"), numeric: true, cell: (row) => formatTaka(row.total, locale) },
    { key: "amount", header: tBilling("detail.paid"), numeric: true, cell: (row) => formatTaka(row.amount, locale) },
  ];
  const where = payment.voided ? null : !payment.handover ? "inHand" : payment.handover.confirmed ? "confirmed" : "pending";

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{payment.receiptNo}</span>}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            {formatDate(payment.receivedAt, locale, "stamp")}
            <ReceiptStatusChip row={payment} />
          </span>
        }
        actions={
          <>
            <Link href="/dashboard/collect/receipts" className={buttonVariants({ variant: "outline" })}>
              <ChevronLeft aria-hidden />
              {t("detail.back")}
            </Link>
            {canAnywhere(me.access, "payments", "create") ? (
              <Link href="/dashboard/collect" className={buttonVariants({ variant: "outline" })}>
                <Plus aria-hidden />
                {t("detail.another")}
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3.5 min-[900px]:grid-cols-[minmax(0,1fr)_340px] min-[900px]:items-start">
        <div className="grid gap-3.5">
          {print === "1" && !payment.voided && canAnywhere(me.access, "payments", "create") ? (
            <Card className="flex flex-wrap items-center justify-between gap-3">
              <p className="num font-semibold text-good">{t("detail.taken", { amount: formatTaka(payment.amount, locale) })}</p>
              <Link href="/dashboard/collect" className={buttonVariants()}>
                <Plus aria-hidden />
                {t("detail.another")}
              </Link>
            </Card>
          ) : null}
          {payment.void ? (
            <Note tone="warn">
              {t("detail.voided", {
                by: payment.void.by ?? t("detail.someone"),
                date: formatDate(payment.void.at, locale, "stamp"),
                reason: payment.void.reason,
              })}
            </Note>
          ) : null}
          <div className="max-w-[560px]">
            <Receipt data={receiptOf(payment, locale, null, (purpose) => donationLine(tReceipt, purpose))} locale={locale} />
          </div>
          {payment.donation ? (
            <Card className="grid gap-2 text-[13.5px]">
              <h2 className="text-[15px]">{tReceipt("donation")}</h2>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                <dt className="text-muted-foreground">{tDonations("detail.fund")}</dt>
                <dd>{pick(payment.donation.fund.nameBn, payment.donation.fund.nameEn, locale)}</dd>
                <dt className="text-muted-foreground">{tDonations("detail.purpose")}</dt>
                <dd>{payment.donation.purpose ?? "—"}</dd>
              </dl>
              {canAnywhere(me.access, "donations") ? (
                <Link href={`/dashboard/donations/${payment.donation.id}`} className="font-semibold text-primary">
                  {tDonations("detail.open")}
                </Link>
              ) : null}
            </Card>
          ) : (
            <Card className="grid gap-3">
              <h2 className="text-[15px]">{t("detail.bills")}</h2>
              <DataTable columns={columns} rows={payment.allocations} rowKey={(row) => row.invoiceId} caption={t("detail.bills")} />
            </Card>
          )}
        </div>

        <div className="grid gap-3.5">
          <Card className="grid gap-3">
            <ReceiptPrint payment={payment} autoPrint={print === "1"} />
            {where ? <p className="text-[13px] text-muted-foreground">{t(`detail.${where}`)}</p> : null}
          </Card>
          {payment.can.void ? <PaymentVoidPanel id={payment.id} donationId={payment.donation?.id} /> : null}
        </div>
      </div>
    </>
  );
}
