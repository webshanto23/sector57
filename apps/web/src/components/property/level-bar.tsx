import { localDigits, pick, type LevelCounts, type Locale, type LocationLevel } from "@s57/shared";
import { getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";
import { SearchInput } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

type Href = ComponentProps<typeof Link>["href"];

const chip = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13.5px] font-semibold";

/**
 * The map's way in by level: "Map" (the tree), one chip per level below this place with how
 * many lie inside, and a name or holding search. A plain GET form; the choice lives in the URL.
 */
export async function LevelBar({
  locale,
  levels,
  counts,
  depth,
  pathname,
  levelId,
  q,
}: {
  locale: Locale;
  levels: LocationLevel[];
  counts: LevelCounts;
  /** The place's own depth (0 at the top): only deeper levels are offered. */
  depth: number;
  pathname: string;
  levelId: string | null;
  q: string | null;
}) {
  const t = await getTranslations("Property");
  const counted = new Map(counts.items.map((item) => [item.levelId, item.count]));
  const offered = levels.filter((level) => !level.isUnitLevel && level.depth > depth);
  const at = (level: string | null): Href => ({ pathname, query: { ...(level ? { level } : {}), ...(q ? { q } : {}) } });
  const tree = !levelId && !q;

  return (
    <div className="grid gap-2.5">
      <nav aria-label={t("levelsLabel")} className="flex flex-wrap items-center gap-2">
        <Link
          href={pathname}
          aria-current={tree ? "page" : undefined}
          className={`${chip} ${tree ? "border-primary text-primary" : "border-line bg-surface hover:border-primary"}`}
        >
          {t("mapView")}
        </Link>
        {offered.map((level) => {
          const count = counted.get(level.id) ?? 0;
          const label = (
            <>
              {pick(level.nameBn, level.nameEn, locale)}
              <span className="num text-[12.5px] font-normal text-muted-foreground">{localDigits(count, locale)}</span>
            </>
          );
          if (count === 0) {
            return (
              <span key={level.id} aria-disabled="true" className={`${chip} border-line text-muted-foreground opacity-60`}>
                {label}
              </span>
            );
          }
          const current = level.id === levelId;
          return (
            <Link
              key={level.id}
              href={at(level.id)}
              aria-current={current ? "page" : undefined}
              className={`${chip} ${current ? "border-primary text-primary" : "border-line bg-surface hover:border-primary"}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <form method="get" role="search" className="flex flex-wrap items-center gap-2.5">
        {levelId ? <input type="hidden" name="level" value={levelId} /> : null}
        <SearchInput name="q" defaultValue={q ?? ""} placeholder={t("findPlaceholder")} aria-label={t("findLabel")} />
        <Button type="submit" variant="outline">
          {t("find")}
        </Button>
      </form>
    </div>
  );
}
