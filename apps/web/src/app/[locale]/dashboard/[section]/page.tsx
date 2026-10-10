import type { Locale } from "@s57/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { sectionFor } from "@/components/dashboard/nav";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import { PageHeader } from "@/components/kit";
import { getMe } from "@/lib/api/session";

/** Only the user's own sections exist: anything else is a 404, so a page without permission isn't revealed. */
async function allowedSection(key: string) {
  const me = await getMe();
  return me ? sectionFor(key, me.access) : undefined;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/[section]">): Promise<Metadata> {
  const { locale, section } = await params;
  const item = await allowedSection(section);
  if (!item) return {};
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t(`nav.${item.key}`) };
}

/** A dashboard page not built yet: the mockup's placeholder card. Later steps replace these one by one. */
export default async function SectionPage({ params }: PageProps<"/[locale]/dashboard/[section]">) {
  const { locale, section } = await params;
  setRequestLocale(locale as Locale);

  const item = await allowedSection(section);
  if (!item) notFound();
  const t = await getTranslations("Dashboard");

  return (
    <>
      <PageHeader title={t(`nav.${item.key}`)} />
      <PlaceholderCard icon={item.icon} title={t("placeholderTitle")} body={t("placeholderBody")} />
    </>
  );
}
