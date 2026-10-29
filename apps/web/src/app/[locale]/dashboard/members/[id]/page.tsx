import { canAnywhere, canSocietyWide, localDigits, type Locale, type Place } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { BillsPanel } from "@/components/billing/bills-panel";
import { CertificatesPanel } from "@/components/certificates/certificates-panel";
import { DonationsPanel } from "@/components/donations/donations-panel";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { Avatar, PageHeader } from "@/components/kit";
import { NidCopiesCard } from "@/components/members/id-copies";
import { MembershipLine } from "@/components/members/labels";
import { MakeMemberButton } from "@/components/members/make-members";
import { PersonEditor } from "@/components/members/person-editor";
import { RemoveMemberCard } from "@/components/members/remove-member";
import { HouseholdTable, OwnershipTable, TenancyTable } from "@/components/members/record-tables";
import { buttonVariants } from "@/components/ui/button";
import { VehiclesPanel } from "@/components/vehicles/vehicles-panel";
import { Link } from "@/i18n/navigation";
import { getNidCopies, getPerson } from "@/lib/api/members";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/members/[id]">): Promise<Metadata> {
  const { id } = await params;
  await requirePermission("members");
  const person = await getPerson(id);
  return person ? { title: person.fullName } : {};
}

/** One person: their details, verification, and what they own, rent and live in (within the caller's area). */
export default async function PersonPage({ params }: PageProps<"/[locale]/dashboard/members/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("members");
  const [t, person] = await Promise.all([getTranslations("Members"), getPerson(id)]);
  if (!person) notFound();
  const nidCopies = person.can.edit ? await getNidCopies(person.id) : null;
  const open = { units: canAnywhere(me.access, "units"), locations: canAnywhere(me.access, "locations") };
  // Not an active member yet: whole-society roles can make them one, at a place they own or rent now.
  const mayMakeMember = person.membership?.status !== "active" && canSocietyWide(me.access, "members", "create");
  // A membership made by mistake can be taken back while its ID is pending.
  const pendingMembership = person.membership?.status === "active" && person.membership.membershipCode === null ? person.membership : null;
  const mayRemoveMember = pendingMembership !== null && canSocietyWide(me.access, "members", "delete");
  const currentPlaces = [
    ...person.ownerships.filter((row) => row.endDate === null).map((row) => row.place),
    ...person.tenancies.filter((row) => row.status === "active" || row.status === "moving_out").map((row) => row.place),
  ].filter((place, i, all) => all.findIndex((other) => other.id === place.id) === i) satisfies Place[];

  return (
    <>
      <PageHeader
        lead={<Avatar name={person.fullName} src={person.photoUrl} size="lg" />}
        title={person.fullName}
        sub={[person.fullNameEn, person.phone ? localDigits(person.phone, locale) : null].filter(Boolean).join(" · ") || undefined}
        actions={
          <Link href="/dashboard/owners" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("back")}
          </Link>
        }
      />
      <div className="grid gap-3.5">
        {person.membership ? <MembershipLine membership={person.membership} /> : null}
        {mayMakeMember ? <MakeMemberButton member={{ kind: "person", id: person.id }} places={currentPlaces} /> : null}
        {mayRemoveMember ? <RemoveMemberCard membershipId={pendingMembership!.id} name={person.fullName} /> : null}
        {!person.can.edit ? <Note>{t("readOnly")}</Note> : null}
        <PersonEditor key={person.id} person={person} />
        {nidCopies ? <NidCopiesCard personId={person.id} copies={nidCopies} /> : null}
        <OwnershipTable rows={person.ownerships} locale={locale} open={open} />
        <TenancyTable rows={person.tenancies} locale={locale} open={open} />
        <HouseholdTable rows={person.households} open={open} />
        <BillsPanel access={me.access} locale={locale} personId={person.id} />
        <DonationsPanel access={me.access} locale={locale} personId={person.id} />
        <VehiclesPanel access={me.access} locale={locale} personId={person.id} />
        <CertificatesPanel access={me.access} locale={locale} personId={person.id} />
        <DocumentsPanel access={me.access} entityType="person" entityId={person.id} />
      </div>
    </>
  );
}
