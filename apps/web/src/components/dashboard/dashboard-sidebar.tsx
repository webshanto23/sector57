"use client";

import { cn } from "cn";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { DASHBOARD_NAV, type NavKey } from "./nav";

const hrefFor = (key: NavKey) => (key === "overview" ? "/dashboard" : `/dashboard/${key}`);

/**
 * Mockup `.side`: grouped links, 248 px above 1180 px, icons only from 861 to 1180 px,
 * a sideways-scrolling strip at 860 px and below. Gets the keys the user may see from the server.
 */
export function DashboardSidebar({ visible }: { visible: NavKey[] }) {
  const t = useTranslations("Dashboard");
  const pathname = usePathname();
  const shown = new Set<NavKey>(visible);

  return (
    <nav
      aria-label={t("label")}
      className={cn(
        "border-line bg-surface",
        // Up to 860 px: one scrolling row under the header.
        "flex gap-1 overflow-x-auto border-b px-4 py-2 [scrollbar-width:none]",
        // From 861 px: sticky column beside the page.
        "min-[861px]:sticky min-[861px]:top-14 min-[861px]:block min-[861px]:max-h-[calc(100dvh-56px)] min-[861px]:self-start min-[861px]:overflow-y-auto min-[861px]:border-r min-[861px]:border-b-0 min-[861px]:px-2 min-[861px]:py-2.5",
        "min-[1181px]:px-2.5 min-[1181px]:py-3",
      )}
    >
      {DASHBOARD_NAV.map((group) => {
        const items = group.items.filter((item) => shown.has(item.key));
        if (items.length === 0) return null;
        return (
          <div key={group.key ?? "top"} className="contents">
            {group.key ? (
              <div className="mx-2.5 mt-3.5 mb-1 hidden text-xs font-semibold text-muted-foreground min-[1181px]:block">
                {t(`groups.${group.key}`)}
              </div>
            ) : null}
            {items.map(({ key, icon: Icon }) => {
              const href = hrefFor(key);
              const current = pathname === href;
              const label = t(`nav.${key}`);
              return (
                <Link
                  key={key}
                  href={href}
                  title={label}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] font-medium whitespace-nowrap text-fg no-underline hover:bg-surface-2",
                    "min-[861px]:w-full min-[861px]:justify-center min-[861px]:p-2.5 min-[1181px]:justify-start min-[1181px]:px-2.5 min-[1181px]:py-[7px]",
                    current && "bg-accent font-semibold text-primary hover:bg-accent",
                  )}
                >
                  <Icon
                    aria-hidden
                    className={cn(
                      "size-4 flex-none min-[861px]:size-5 min-[1181px]:size-4",
                      current ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <span className="min-[861px]:sr-only min-[1181px]:not-sr-only">{label}</span>
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
