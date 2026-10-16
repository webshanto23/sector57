import { type Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BatchForm } from "@/components/billing/batch-form";
import { PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getChargeTypes } from "@/lib/api/finance";
import { requirePermission } from "@/lib/api/session";
import { dhakaDay } from "@/lib/dhaka-time";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/billing/batch">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Billing.batch" });
  return { title: t("title") };
}

/** Bills for several units at once, each with lines of its own (Step 27). */
export default async function BatchBillsPage({ params }: PageProps<"/[locale]/dashboard/billing/batch">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  await requirePermission("billing", "create");
  const [t, tBilling, chargeTypes] = await Promise.all([getTranslations("Billing.batch"), getTranslations("Billing"), getChargeTypes()]);

  return (
    <>
      <PageHeader
        title={t("title")}
        sub={t("sub")}
        actions={
          <Link href="/dashboard/billing" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {tBilling("detail.back")}
          </Link>
        }
      />
      <BatchForm chargeTypes={chargeTypes} dueDefault={dhakaDay(14)} />
    </>
  );
}
