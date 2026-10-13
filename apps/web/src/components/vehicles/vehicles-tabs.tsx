"use client";

import { cn } from "cn";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

type Tab = "vehicles" | "stickers" | "parking";

const HREFS: Record<Tab, string> = {
  vehicles: "/dashboard/vehicles",
  stickers: "/dashboard/vehicles/stickers",
  parking: "/dashboard/vehicles/parking",
};

/** Tabs of the vehicles section: the vehicles, their stickers and the parking slots. */
export function VehiclesTabs() {
  const t = useTranslations("Vehicles.tabs");
  const pathname = usePathname();
  const current: Tab = pathname.startsWith(HREFS.stickers) ? "stickers" : pathname.startsWith(HREFS.parking) ? "parking" : "vehicles";

  return (
    <nav aria-label={t("label")} className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {(Object.keys(HREFS) as Tab[]).map((tab) => (
        <Link
          key={tab}
          href={HREFS[tab]}
          aria-current={tab === current ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-[13.5px] font-semibold whitespace-nowrap",
            tab === current ? "border-primary text-fg" : "border-transparent text-muted-foreground hover:text-fg",
          )}
        >
          {t(tab)}
        </Link>
      ))}
    </nav>
  );
}
