import type { Locale } from "@s57/shared";
import { setRequestLocale } from "next-intl/server";
import { requirePermission } from "@/lib/api/session";
import { VehiclesTabs } from "@/components/vehicles/vehicles-tabs";

/** Vehicles, stickers and parking, for anyone who may see vehicles somewhere. */
export default async function VehiclesLayout({ params, children }: LayoutProps<"/[locale]/dashboard/vehicles">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  await requirePermission("vehicles");

  return (
    <>
      <VehiclesTabs />
      {children}
    </>
  );
}
