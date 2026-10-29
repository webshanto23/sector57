import { localDigits, pickContent, type Locale } from "@s57/shared";
import { Clock, Landmark, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FormsHub } from "@/components/forms/forms-hub";
import { Card, PageHeader } from "@/components/kit";
import { getSiteInfo, getSociety } from "@/lib/api/public";
import { alternates } from "@/lib/metadata";

export const revalidate = 60;

export async function generateMetadata({ params }: PageProps<"/[locale]/forms">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Forms" });
  return { title: t("title"), description: t("sub"), alternates: alternates("/forms", locale as Locale) };
}

/**
 * Member services: the membership application and renter registration (sent to the office for
 * review), the requests that are not online yet, and the office's contact details.
 */
export default async function FormsPage({ params }: PageProps<"/[locale]/forms">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const [t, info, society] = await Promise.all([getTranslations("Forms"), getSiteInfo(), getSociety()]);
  const site = info ? pickContent(info, locale) : null;

  const office = site ? (
    <Card flat className="grid gap-2 text-[13.5px]">
      <h3 className="flex items-center gap-2">
        <Landmark className="size-[16px] text-primary" aria-hidden />
        {t("office")}
      </h3>
      <p className="flex items-start gap-2">
        <MapPin className="mt-0.5 size-[15px] flex-none text-muted-foreground" aria-hidden />
        {site.address}
      </p>
      <p className="flex items-start gap-2">
        <Clock className="mt-0.5 size-[15px] flex-none text-muted-foreground" aria-hidden />
        {site.officeHours}
      </p>
      <p className="flex items-start gap-2">
        <Phone className="mt-0.5 size-[15px] flex-none text-muted-foreground" aria-hidden />
        <a href={`tel:${site.phone.replace(/[^\d+]/g, "")}`} className="font-semibold text-fg no-underline">
          {localDigits(site.phone, locale)}
        </a>
      </p>
    </Card>
  ) : null;

  return (
    <>
      <PageHeader title={t("title")} sub={t("sub")} />
      <FormsHub office={office} renterNidRequired={society?.requireIdNumbers ?? false} />
    </>
  );
}
