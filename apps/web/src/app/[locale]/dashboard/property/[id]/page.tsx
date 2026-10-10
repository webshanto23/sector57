import type { Locale } from "@s57/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { LocationPage } from "@/components/property/location-page";
import { getLevels, getLocation } from "@/lib/api/property";
import { requirePermission } from "@/lib/api/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/property/[id]">): Promise<Metadata> {
  const { id } = await params;
  await requirePermission("locations");
  const view = await getLocation(id);
  return view?.location ? { title: view.location.name } : {};
}

/** One location on the map: its details, what is inside, and adding more. */
export default async function LocationRoute({ params }: PageProps<"/[locale]/dashboard/property/[id]">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("locations");
  const [view, levels] = await Promise.all([getLocation(id), getLevels()]);
  if (!view?.location) notFound();
  return <LocationPage view={view} levels={levels} me={me} locale={locale} />;
}
