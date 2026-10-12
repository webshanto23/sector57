import { canAnywhere, type DonorOption, type Locale } from "@s57/shared";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DonationForm } from "@/components/donations/donation-form";
import { PageHeader } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getDonationOptions } from "@/lib/api/donations";
import { getOrganisation, getPerson } from "@/lib/api/members";
import { requirePermission } from "@/lib/api/session";
import { todayInDhaka } from "@/lib/dhaka-time";

const UUID = /^[0-9a-f-]{36}$/i;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/donations/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Donations.form" });
  return { title: t("title") };
}

/** Records a donation. `?personId=` or `?organisationId=` (from their page) starts with that donor chosen. */
export default async function NewDonationPage({ params, searchParams }: PageProps<"/[locale]/dashboard/donations/new">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const me = await requirePermission("donations", "create");
  const search = await searchParams;
  const id = (key: string) => (typeof search[key] === "string" && UUID.test(search[key]) ? search[key] : undefined);
  const personId = id("personId");
  const organisationId = personId ? undefined : id("organisationId");
  // The donor's page is a members page, so only a members viewer arrives with one.
  const members = canAnywhere(me.access, "members");
  const [t, options, person, organisation] = await Promise.all([
    getTranslations("Donations"),
    getDonationOptions(),
    members && personId ? getPerson(personId) : Promise.resolve(null),
    members && organisationId ? getOrganisation(organisationId) : Promise.resolve(null),
  ]);
  const initialDonor: DonorOption | null = person
    ? { kind: "person", id: person.id, name: person.fullName, nameEn: person.fullNameEn, phone: person.phone }
    : organisation
      ? { kind: "organisation", id: organisation.id, name: organisation.name, nameEn: null, phone: null }
      : null;

  return (
    <>
      <PageHeader
        title={t("form.title")}
        sub={t("form.sub")}
        actions={
          <Link href="/dashboard/donations" className={buttonVariants({ variant: "outline" })}>
            <ChevronLeft aria-hidden />
            {t("detail.back")}
          </Link>
        }
      />
      <DonationForm options={options} initialDonor={initialDonor} collector={me.name ?? me.phone} today={todayInDhaka()} />
    </>
  );
}
