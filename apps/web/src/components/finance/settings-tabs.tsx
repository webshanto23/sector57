"use client";

import { cn } from "cn";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

export type SettingsTab = "society" | "funds" | "chargeTypes";

const HREFS: Record<SettingsTab, string> = {
  society: "/dashboard/settings",
  funds: "/dashboard/settings/funds",
  chargeTypes: "/dashboard/settings/charge-types",
};

/** Tabs of the settings section; only the ones the user may open are passed in. */
export function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  const t = useTranslations("Finance.tabs");
  const pathname = usePathname();
  const current = tabs.find((tab) => tab !== "society" && pathname.startsWith(HREFS[tab])) ?? "society";

  if (tabs.length < 2) return null;
  return (
    <nav aria-label={t("label")} className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab) => (
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
