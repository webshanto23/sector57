import { formatTaka, localDigits, MAX_PRINT_BILLS, pick, type Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { BillsPrint } from "@/components/billing/bills-print";
import { unitLabel } from "@/components/billing/labels";
import { Card, PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getInvoicesForPrint } from "@/lib/api/billing";
import { requirePermission } from "@/lib/api/session";
import { dhakaDay } from "@/lib/dhaka-time";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/billing/print">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Billing.printMany" });
  return { title: t("title") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Several bills printed together, one per page. Bills come as `?ids=a,b` (after a batch)
 * or as repeated `?id=` (the ticked rows of the bills list).
 */
export default async function PrintBillsPage({ params, searchParams }: PageProps<"/[locale]/dashboard/billing/print">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  await requirePermission("billing");
  const search = await searchParams;
  const asked = [search["ids"], search["id"]]
    .flat()
    .flatMap((value) => (typeof value === "string" ? value.split(",") : []))
    .map((id) => id.trim())
    .filter((id) => UUID.test(id));
  const ids = [...new Set(asked)].slice(0, MAX_PRINT_BILLS);
  const [t, tBilling, invoices] = await Promise.all([
    getTranslations("Billing.printMany"),
    getTranslations("Billing"),
    ids.length ? getInvoicesForPrint(ids) : Promise.resolve(null),
  ]);
  const made = search["made"] === "1";

  return (
    <>
      <PageHeader
        title={t("title")}
        sub={invoices ? t("sub", { count: localDigits(invoices.length, locale) }) : undefined}
        actions={
          <>
            <Link href="/dashboard/billing" className={buttonVariants({ variant: "outline" })}>
              <ChevronLeft aria-hidden />
              {tBilling("detail.back")}
            </Link>
            {invoices?.length ? <BillsPrint invoices={invoices} today={dhakaDay()} /> : null}
          </>
        }
      />
      {!invoices?.length ? (
        <Note>{t("none")}</Note>
      ) : (
        <div className="grid max-w-[900px] gap-3">
          {made ? <Note>{t("made", { count: localDigits(invoices.length, locale) })}</Note> : null}
          <Card className="grid gap-0 p-0">
            <ul className="divide-y divide-line">
              {invoices.map((invoice) => (
                <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5">
                  <Link href={`/dashboard/billing/${invoice.id}`} className="grid min-w-0 text-fg">
                    <span className="font-mono text-[13px] font-semibold">{invoice.invoiceNo}</span>
                    <span className="text-[13px] text-muted-foreground">
                      {[unitLabel(invoice.billTo), pick(invoice.billTo.name, invoice.billTo.nameEn, locale)].filter(Boolean).join(" · ")}
                    </span>
                  </Link>
                  <span className="num font-semibold">{formatTaka(invoice.total, locale)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
