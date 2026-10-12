"use client";

import { cn } from "cn";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const TABS = [
  ["statement", "/dashboard/ledger"],
  ["transfers", "/dashboard/ledger/transfers"],
] as const;

/** Statement and transfers: both need `ledger.view`, so both always show. */
export function LedgerTabs() {
  const t = useTranslations("Ledger.tabs");
  const pathname = usePathname();
  const current = pathname.startsWith("/dashboard/ledger/transfers") ? "transfers" : "statement";

  return (
    <nav aria-label={t("label")} className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map(([tab, href]) => (
        <Link
          key={tab}
          href={href}
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
