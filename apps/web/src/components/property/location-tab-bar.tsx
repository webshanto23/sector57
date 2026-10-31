import { localDigits, type Locale, type LocationTab } from "@s57/shared";
import { cn } from "cn";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/** The tabs of one place; the choice lives in the URL, and the first tab needs no `tab` at all. */
export async function LocationTabBar({
  pathname,
  tabs,
  active,
  locale,
}: {
  pathname: string;
  tabs: { id: LocationTab; label: string; count?: number }[];
  active: LocationTab;
  locale: Locale;
}) {
  const t = await getTranslations("Property.pageTabs");
  return (
    <nav aria-label={t("label")} className="my-3.5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab, index) => (
        <Link
          key={tab.id}
          href={{ pathname, query: index === 0 ? {} : { tab: tab.id } }}
          scroll={false}
          aria-current={tab.id === active ? "page" : undefined}
          className={cn(
            "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13.5px] font-semibold whitespace-nowrap",
            tab.id === active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-fg",
          )}
        >
          {tab.label}
          {tab.count !== undefined ? <span className="num rounded-full bg-surface-2 px-1.5 text-[11.5px]">{localDigits(tab.count, locale)}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
