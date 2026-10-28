import type { Locale } from "@s57/shared";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { loadFinder } from "@/components/property/finder";
import { LocationPage } from "@/components/property/location-page";
import { getLevels, getTopLocations } from "@/lib/api/property";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/property">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.property") };
}

/** The top of the property map: the whole society's top level, or the caller's own areas. */
export default async function PropertyPage({ params, searchParams }: PageProps<"/[locale]/dashboard/property">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("locations");
  const [view, levels, finder] = await Promise.all([getTopLocations(), getLevels(), searchParams.then((search) => loadFinder(search, undefined))]);
  return <LocationPage view={view} levels={levels} finder={finder} me={me} locale={locale} />;
}
