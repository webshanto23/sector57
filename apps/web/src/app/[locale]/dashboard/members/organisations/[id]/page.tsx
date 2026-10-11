import { canAnywhere, localDigits, type Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { BillsPanel } from "@/components/billing/bills-panel";
import { Card, PageHeader } from "@/components/kit";
import { PartyLink } from "@/components/members/labels";
import { OrganisationEditor } from "@/components/members/organisation-editor";
import { OwnershipTable, TenancyTable } from "@/components/members/record-tables";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getOrganisation } from "@/lib/api/members";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/members/organisations/[id]">): Promise<Metadata> {
  const { id } = await params;
  await requirePermission("members");
  const organisation = await getOrganisation(id);
  return organisation ? { title: organisation.name } : {};
}

/** A company, shop or NGO that owns or rents: its details and records within the caller's area. */
export default async function OrganisationPage({ params }: PageProps<"/[locale]/dashboard/members/organisations/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("members");
  const [t, organisation] = await Promise.all([getTranslations("Members"), getOrganisation(id)]);
  if (!organisation) notFound();
  const open = { units: canAnywhere(me.access, "units"), locations: canAnywhere(me.access, "locations") };

  return (
    <>
      <PageHeader
        title={organisation.name}
        sub={t("organisation")}
        actions={
          <Link href="/dashboard/members" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("back")}
          </Link>
        }
      />
      <div className="grid gap-3.5">
        {!organisation.can.edit ? <Note>{t("readOnly")}</Note> : null}
        <OrganisationEditor key={organisation.id} organisation={organisation} />
        <Card className="grid gap-1.5">
          <h2 className="text-[15px]">{t("contact")}</h2>
          {organisation.contact ? (
            <p>
              <PartyLink party={organisation.contact} />
              {organisation.contact.phone ? <span className="num text-muted-foreground"> · {localDigits(organisation.contact.phone, locale)}</span> : null}
            </p>
          ) : (
            <p className="text-muted-foreground">{t("noContact")}</p>
          )}
        </Card>
        <OwnershipTable rows={organisation.ownerships} locale={locale} open={open} />
        <TenancyTable rows={organisation.tenancies} locale={locale} open={open} />
        <BillsPanel access={me.access} locale={locale} organisationId={organisation.id} />
      </div>
    </>
  );
}
