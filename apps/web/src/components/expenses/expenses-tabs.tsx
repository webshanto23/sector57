"use client";

import { cn } from "cn";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

export type ExpensesTab = "expenses" | "budget" | "setup";

const HREFS: Record<ExpensesTab, string> = {
  expenses: "/dashboard/expenses",
  budget: "/dashboard/expenses/budget",
  setup: "/dashboard/expenses/setup",
};

/** Tabs of the expenses section; only the ones the user may open are passed in. */
export function ExpensesTabs({ tabs }: { tabs: ExpensesTab[] }) {
  const t = useTranslations("Expenses.tabs");
  const pathname = usePathname();
  const current = tabs.find((tab) => tab !== "expenses" && pathname.startsWith(HREFS[tab])) ?? "expenses";

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
