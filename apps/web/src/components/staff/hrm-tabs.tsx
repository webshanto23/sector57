"use client";

import { cn } from "cn";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

export type HrmTab = "staff" | "attendance" | "payroll";

const HREFS: Record<HrmTab, string> = { staff: "/dashboard/hrm", attendance: "/dashboard/hrm/attendance", payroll: "/dashboard/hrm/payroll" };

/** Tabs of the staff section; only the ones the user may open are passed in. */
export function HrmTabs({ tabs }: { tabs: HrmTab[] }) {
  const t = useTranslations("Staff.tabs");
  const pathname = usePathname();
  const current = pathname.startsWith(HREFS.attendance) ? "attendance" : pathname.startsWith(HREFS.payroll) ? "payroll" : "staff";

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
