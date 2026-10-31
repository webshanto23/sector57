import { canAnywhere, canSocietyWide, localDigits, type Locale, type Place } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { BillsPanel } from "@/components/billing/bills-panel";
import { DonationsPanel } from "@/components/donations/donations-panel";
import { Card, PageHeader } from "@/components/kit";
import { MembershipLine, PartyLink } from "@/components/members/labels";
import { MakeMemberButton } from "@/components/members/make-members";
import { IdCardPanel } from "@/components/members/id-card-panel";
import { LicencePagesCard } from "@/components/members/id-copies";
import { OrganisationEditor } from "@/components/members/organisation-editor";
import { RemoveMemberCard } from "@/components/members/remove-member";
import { VerifyCard } from "@/components/members/verify-card";
import { OwnershipTable, TenancyTable } from "@/components/members/record-tables";
import { buttonVariants } from "@/components/ui/button";
import { VehiclesPanel } from "@/components/vehicles/vehicles-panel";
import { Link } from "@/i18n/navigation";
import { getLicencePages, getMemberCard, getOrganisation } from "@/lib/api/members";
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
  // An active member with an ID gets a card, printed by those who may edit them.
  const hasCard = organisation.can.edit && organisation.membership?.status === "active" && organisation.membership.membershipCode !== null;
  const [licencePages, card] = await Promise.all([
    organisation.can.edit ? getLicencePages(organisation.id) : null,
    hasCard ? getMemberCard(organisation.membership!.id) : null,
  ]);
  const open = { units: canAnywhere(me.access, "units"), locations: canAnywhere(me.access, "locations") };
  // Not an active member yet: whole-society roles can make it one, at a place it owns or rents now.
  const mayMakeMember = organisation.membership?.status !== "active" && canSocietyWide(me.access, "members", "create");
  // A membership made by mistake can be taken back while its ID is pending.
  const pendingMembership =
    organisation.membership?.status === "active" && organisation.membership.membershipCode === null ? organisation.membership : null;
  const mayRemoveMember = pendingMembership !== null && canSocietyWide(me.access, "members", "delete");
  const currentPlaces = [
    ...organisation.ownerships.filter((row) => row.endDate === null).map((row) => row.place),
    ...organisation.tenancies.filter((row) => row.status === "active" || row.status === "moving_out").map((row) => row.place),
  ].filter((place, i, all) => all.findIndex((other) => other.id === place.id) === i) satisfies Place[];

  return (
    <>
      <PageHeader
        title={organisation.name}
        sub={t("organisation")}
        actions={
          <Link href="/dashboard/owners" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("back")}
          </Link>
        }
      />
      <div className="grid gap-3.5">
        {organisation.membership ? <MembershipLine membership={organisation.membership} /> : null}
        {mayMakeMember ? <MakeMemberButton member={{ kind: "organisation", id: organisation.id }} places={currentPlaces} /> : null}
        {mayRemoveMember ? <RemoveMemberCard membershipId={pendingMembership!.id} name={organisation.name} /> : null}
        {!organisation.can.edit ? <Note>{t("readOnly")}</Note> : null}
        <OrganisationEditor key={organisation.id} organisation={organisation} />
        <VerifyCard
          party={{ kind: "organisation", id: organisation.id }}
          verifiedAt={organisation.verifiedAt}
          canVerify={organisation.can.verify}
          idPending={organisation.membership?.status === "active" && organisation.membership.membershipCode === null}
        />
        {licencePages ? <LicencePagesCard organisationId={organisation.id} pages={licencePages} /> : null}
        {card ? <IdCardPanel card={card} /> : null}
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
        <VehiclesPanel access={me.access} locale={locale} organisationId={organisation.id} />
        <BillsPanel access={me.access} locale={locale} organisationId={organisation.id} />
        <DonationsPanel access={me.access} locale={locale} organisationId={organisation.id} />
      </div>
    </>
  );
}
