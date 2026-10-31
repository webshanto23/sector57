import type { Locale } from "@s57/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { loadFinder } from "@/components/property/finder";
import { LocationPage } from "@/components/property/location-page";
import { getLocationPeople } from "@/lib/api/members";
import { getLevels, getLocation } from "@/lib/api/property";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/property/[id]">): Promise<Metadata> {
  const { id } = await params;
  await requirePermission("locations");
  const view = await getLocation(id);
  return view?.location ? { title: view.location.name } : {};
}

/** One location on the map: its summary and its tabs (`tab` in the URL). */
export default async function LocationRoute({ params, searchParams }: PageProps<"/[locale]/dashboard/property/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("locations");
  const [view, levels, people] = await Promise.all([getLocation(id), getLevels(), getLocationPeople(id)]);
  if (!view?.location) notFound();
  const search = await searchParams;
  const finder = await loadFinder(search, id);
  return <LocationPage view={view} levels={levels} people={people} finder={finder} tab={search["tab"]} transfer={search["transfer"] === "1"} me={me} locale={locale} />;
}
