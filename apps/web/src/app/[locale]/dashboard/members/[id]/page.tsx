import { canAnywhere, canSocietyWide, formatDate, localDigits, type Locale, type Place } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { BillsPanel } from "@/components/billing/bills-panel";
import { CertificatesPanel } from "@/components/certificates/certificates-panel";
import { DonationsPanel } from "@/components/donations/donations-panel";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { Chip, PageHeader } from "@/components/kit";
import { MakeMemberButton } from "@/components/members/make-members";
import { PersonEditor } from "@/components/members/person-editor";
import { HouseholdTable, OwnershipTable, TenancyTable } from "@/components/members/record-tables";
import { buttonVariants } from "@/components/ui/button";
import { VehiclesPanel } from "@/components/vehicles/vehicles-panel";
import { Link } from "@/i18n/navigation";
import { getPerson } from "@/lib/api/members";
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
  const open = { units: canAnywhere(me.access, "units"), locations: canAnywhere(me.access, "locations") };
  // Not an active member yet: whole-society roles can make them one, at a place they own or rent now.
  const mayMakeMember = person.membership?.status !== "active" && canSocietyWide(me.access, "members", "create");
  const currentPlaces = [
    ...person.ownerships.filter((row) => row.endDate === null).map((row) => row.place),
    ...person.tenancies.filter((row) => row.status === "active" || row.status === "moving_out").map((row) => row.place),
  ].filter((place, i, all) => all.findIndex((other) => other.id === place.id) === i) satisfies Place[];

  return (
    <>
      <PageHeader
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
        {person.membership ? (
          <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            <Chip tone={person.membership.status === "active" ? "good" : "neutral"}>
              {localDigits(t("memberNo", { no: person.membership.memberNo }), locale)}
            </Chip>
            <span className="num">{t("membershipCode", { code: person.membership.membershipCode })}</span>
            {person.membership.status === "active"
              ? t("memberSince", { date: formatDate(person.membership.joinedOn, locale, "short") })
              : t(`membershipStatus.${person.membership.status}`)}
          </p>
        ) : null}
        {mayMakeMember ? <MakeMemberButton personId={person.id} places={currentPlaces} /> : null}
        {!person.can.edit ? <Note>{t("readOnly")}</Note> : null}
        <PersonEditor key={person.id} person={person} />
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
