"use client";

import { cn } from "cn";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

type Tab = "facilities" | "assets" | "maintenance";

const HREFS: Record<Tab, string> = {
  facilities: "/dashboard/facilities",
  assets: "/dashboard/facilities/assets",
  maintenance: "/dashboard/facilities/maintenance",
};

/** Tabs of the facilities section: the facilities, the assets and the upkeep due. */
export function FacilitiesTabs() {
  const t = useTranslations("Facilities.tabs");
  const pathname = usePathname();
  const current: Tab = pathname.startsWith(HREFS.assets) ? "assets" : pathname.startsWith(HREFS.maintenance) ? "maintenance" : "facilities";

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
