import { canAnywhere, canSocietyWide, formatDate, formatTaka, localDigits, pick, type InvoiceLine, type Locale } from "@s57/shared";
import { Banknote, ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { Note } from "@/components/admin/form-status";
import { BillPrint } from "@/components/billing/bill-print";
import { billToLabel, InvoiceStatusChip, periodLabel } from "@/components/billing/labels";
import { VoidPanel } from "@/components/billing/void-panel";
import { Card, DataTable, PageHeader, type Column } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getInvoice } from "@/lib/api/billing";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/billing/[id]">): Promise<Metadata> {
  const { id } = await params;
  await requirePermission("billing");
  const invoice = await getInvoice(id);
  return invoice ? { title: invoice.invoiceNo } : {};
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[12.5px] text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/** One bill: who and where it went to (as on the day), its lines and totals, and voiding. */
export default async function InvoicePage({ params }: PageProps<"/[locale]/dashboard/billing/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("billing");
  const [t, invoice] = await Promise.all([getTranslations("Billing"), getInvoice(id)]);
  if (!invoice) notFound();
  const tr = t as unknown as (key: string, values?: Record<string, string>) => string;
  const { billTo } = invoice;
  const period = periodLabel(invoice, locale, tr);
  const open = invoice.status === "unpaid" || invoice.status === "partial";
  // A membership bill has no unit: only a society-wide collector takes it.
  const canCollect = billTo.unit ? canAnywhere(me.access, "payments", "create") : canSocietyWide(me.access, "payments", "create");
  const columns: Column<InvoiceLine>[] = [
    {
      key: "line",
      header: t("detail.line"),
      cell: (line) => <span className="whitespace-normal">{pick(line.description, line.descriptionEn, locale)}</span>,
    },
    { key: "charge", header: t("col.charge"), cell: (line) => pick(line.chargeType.nameBn, line.chargeType.nameEn, locale) },
    { key: "amount", header: t("col.amount"), numeric: true, cell: (line) => formatTaka(line.amount, locale) },
  ];

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{invoice.invoiceNo}</span>}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            {t(`kind.${invoice.kind}`)}
            <InvoiceStatusChip row={invoice} />
          </span>
        }
        actions={
          <>
            <Link href="/dashboard/billing" className={buttonVariants({ variant: "outline" })}>
              <ChevronLeft aria-hidden />
              {t("detail.back")}
            </Link>
            <BillPrint invoice={invoice} />
          </>
        }
      />

      <div className="grid gap-3.5 min-[900px]:grid-cols-[minmax(0,1fr)_340px] min-[900px]:items-start">
        <div className="grid gap-3.5">
          {invoice.void ? (
            <Note tone="warn">
              {t("detail.voided", {
                by: invoice.void.by ?? t("detail.someone"),
                date: formatDate(invoice.void.at, locale, "stamp"),
                reason: invoice.void.reason,
              })}
            </Note>
          ) : null}

          <Card>
            <dl className="grid gap-3 min-[600px]:grid-cols-2">
              <Fact label={t("detail.billTo")}>
                {billToLabel(billTo, locale, tr)}
                {billTo.phone ? <span className="num block text-[13px] font-normal text-muted-foreground">{localDigits(billTo.phone, locale)}</span> : null}
                {billTo.memberNo !== null ? (
                  <span className="block text-[13px] font-normal text-muted-foreground">
                    {localDigits(t("memberNo", { no: billTo.memberNo }), locale)}
                  </span>
                ) : null}
              </Fact>
              <Fact label={t("detail.unit")}>
                {billTo.unit ? (
                  <>
                    {canAnywhere(me.access, "units") ? (
                      <Link href={`/dashboard/units/${billTo.unit.id}`} className="text-primary underline-offset-2 hover:underline">
                        {billTo.unit.name}
                      </Link>
                    ) : (
                      billTo.unit.name
                    )}
                    {billTo.unit.address.length ? (
                      <span className="block text-[13px] font-normal text-muted-foreground">{billTo.unit.address.join(", ")}</span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-muted-foreground">{t("noUnit")}</span>
                )}
              </Fact>
              <Fact label={t("detail.issued")}>{formatDate(invoice.issueDate, locale)}</Fact>
              <Fact label={t("detail.dueDate")}>{formatDate(invoice.dueDate, locale)}</Fact>
              {period ? <Fact label={t("detail.period")}>{period}</Fact> : null}
              <Fact label={t("detail.fund")}>{pick(invoice.fund.nameBn, invoice.fund.nameEn, locale)}</Fact>
              {invoice.createdBy ? (
                <Fact label={t("detail.createdBy")}>
                  {invoice.createdBy}
                  <span className="block text-[13px] font-normal text-muted-foreground">{formatDate(invoice.createdAt, locale, "stamp")}</span>
                </Fact>
              ) : null}
            </dl>
          </Card>

          <Card className="grid gap-3">
            <h2 className="text-[15px]">{t("detail.lines")}</h2>
            <DataTable columns={columns} rows={invoice.lines} rowKey={(line) => line.id} caption={t("detail.lines")} />
          </Card>
        </div>

        <div className="grid gap-3.5">
          <Card className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{t("detail.total")}</span>
              <span className="num text-lg font-bold">{formatTaka(invoice.total, locale)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{t("detail.paid")}</span>
              <span className="num">{formatTaka(invoice.paid, locale)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
              <span className="font-semibold">{t("detail.due")}</span>
              <span className="num text-lg font-bold">{formatTaka(invoice.due, locale)}</span>
            </div>
            {open && canCollect ? (
              <Link
                href={{ pathname: "/dashboard/collect", query: { ...(billTo.unit ? { unitId: billTo.unit.id } : { personId: billTo.id }), invoiceId: invoice.id } }}
                className={`${buttonVariants()} mt-1`}
              >
                <Banknote aria-hidden />
                {t("detail.collect")}
              </Link>
            ) : null}
          </Card>
          {canAnywhere(me.access, "payments") ? (
            <Card className="grid gap-2">
              <h2 className="text-[15px]">{t("detail.payments")}</h2>
              {invoice.payments.length === 0 ? (
                <p className="text-[13.5px] text-muted-foreground">{t("detail.noPayments")}</p>
              ) : (
                <ul className="grid gap-1.5">
                  {invoice.payments.map((payment) => (
                    <li key={payment.id} className="flex items-center justify-between gap-2 text-[13.5px]">
                      <Link
                        href={`/dashboard/collect/receipts/${payment.id}`}
                        className={`font-mono font-semibold text-primary ${payment.voided ? "line-through" : ""}`}
                      >
                        {payment.receiptNo}
                      </Link>
                      <span className="text-muted-foreground">{formatDate(payment.receivedDay, locale, "short")}</span>
                      <span className={`num ${payment.voided ? "text-muted-foreground line-through" : ""}`}>{formatTaka(payment.amount, locale)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
          {invoice.can.void ? <VoidPanel id={invoice.id} /> : null}
        </div>
      </div>
    </>
  );
}
