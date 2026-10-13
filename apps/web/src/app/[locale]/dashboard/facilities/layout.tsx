import type { Locale } from "@s57/shared";
import { setRequestLocale } from "next-intl/server";
import { FacilitiesTabs } from "@/components/facilities/facilities-tabs";
import { requirePermission } from "@/lib/api/session";

/** Facilities, assets and the upkeep due, for anyone who may see facilities somewhere. */
export default async function FacilitiesLayout({ params, children }: LayoutProps<"/[locale]/dashboard/facilities">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  await requirePermission("facilities");

  return (
    <>
      <FacilitiesTabs />
      {children}
    </>
  );
}
