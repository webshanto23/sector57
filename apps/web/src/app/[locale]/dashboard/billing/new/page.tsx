import { type Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { InvoiceForm } from "@/components/billing/invoice-form";
import { PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { lookupBilling } from "@/lib/api/billing";
import { getChargeTypes } from "@/lib/api/finance";
import { requirePermission } from "@/lib/api/session";
import { dhakaDay } from "@/lib/dhaka-time";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/billing/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Billing" });
  return { title: t("newBill") };
}

/** A bill made by hand. `?unitId=` (from a unit page) or `?personId=` / `?organisationId=` (a member's fee, from the members list) starts with them chosen. */
export default async function NewInvoicePage({ params, searchParams }: PageProps<"/[locale]/dashboard/billing/new">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  await requirePermission("billing", "create");
  const { unitId, personId, organisationId } = await searchParams;
  const uuid = (value: unknown) => (typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null);
  const startUnit = uuid(unitId);
  const startPerson = startUnit ? null : uuid(personId);
  const startOrganisation = startUnit || startPerson ? null : uuid(organisationId);
  const [t, chargeTypes, start] = await Promise.all([
    getTranslations("Billing"),
    getChargeTypes(),
    startUnit
      ? lookupBilling({ unitId: startUnit })
      : startPerson
        ? lookupBilling({ personId: startPerson })
        : startOrganisation
          ? lookupBilling({ organisationId: startOrganisation })
          : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        title={t("newBill")}
        sub={t("new.sub")}
        actions={
          <Link href="/dashboard/billing" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("detail.back")}
          </Link>
        }
      />
      <InvoiceForm chargeTypes={chargeTypes} initialUnit={start?.units[0] ?? null} initialMember={start?.members[0] ?? null} dueDefault={dhakaDay(14)} />
    </>
  );
}
