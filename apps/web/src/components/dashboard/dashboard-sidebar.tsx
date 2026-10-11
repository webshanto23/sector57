"use client";

import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { DASHBOARD_NAV, type NavGroup, type NavKey } from "./nav";

type GroupKey = NonNullable<NavGroup["key"]>;

const hrefFor = (key: NavKey) => (key === "overview" ? "/dashboard" : `/dashboard/${key}`);

/** True on the item's page and on pages below it (`/dashboard/property/<id>`). */
const isWithin = (pathname: string, key: NavKey) => {
  const href = hrefFor(key);
  return key === "overview" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
};

/**
 * Mockup `.side`: grouped links, 248 px above 1180 px, icons only from 861 to 1180 px,
 * a sideways-scrolling strip at 860 px and below. Gets the keys the user may see from the server.
 * Above 1180 px each group heading opens and closes its links; the group holding the current
 * page starts open. Narrower layouts have no headings, so every link stays visible there.
 */
export function DashboardSidebar({ visible }: { visible: NavKey[] }) {
  const t = useTranslations("Dashboard");
  const pathname = usePathname();
  const shown = new Set<NavKey>(visible);
  // Only groups the user has opened or closed; the rest follow the current page.
  const [toggled, setToggled] = useState<Partial<Record<GroupKey, boolean>>>({});

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
        const holdsCurrent = items.some((item) => isWithin(pathname, item.key));
        const open = group.key === null || (toggled[group.key] ?? holdsCurrent);
        const listId = group.key ? `dashboard-nav-${group.key}` : undefined;
        return (
          <div key={group.key ?? "top"} className="contents">
            {group.key !== null ? (
              <button
                type="button"
                aria-expanded={open}
                aria-controls={listId}
                onClick={() => setToggled((prev) => ({ ...prev, [group.key]: !open }))}
                className={cn(
                  "mt-2.5 mb-0.5 hidden w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-surface-2 hover:text-fg min-[1181px]:flex",
                  !open && holdsCurrent && "text-primary",
                )}
              >
                <group.icon aria-hidden className="size-4 flex-none" />
                <span className="flex-1 text-left">{t(`groups.${group.key}`)}</span>
                <ChevronDown
                  aria-hidden
                  className={cn("size-3.5 flex-none transition-transform", open ? "rotate-0" : "-rotate-90")}
                />
              </button>
            ) : null}
            <div
              id={listId}
              className={cn(
                "contents min-[861px]:block",
                // Indented under the heading, with a guide line from the group icon, like a tree.
                group.key !== null && "border-line min-[1181px]:ml-[17px] min-[1181px]:border-l min-[1181px]:pl-2",
                !open && "min-[1181px]:hidden",
              )}
            >
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
          </div>
        );
      })}
    </nav>
  );
}
