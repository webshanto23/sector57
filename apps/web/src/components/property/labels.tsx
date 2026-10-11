import { pick, type Crumb, type Locale, type Occupancy } from "@s57/shared";
import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Chip } from "@/components/kit";
import { Link } from "@/i18n/navigation";
import { OCCUPANCY_TONES } from "./occupancy";


export async function OccupancyChip({ occupancy }: { occupancy: Occupancy }) {
  const t = await getTranslations("Property.occupancy");
  return <Chip tone={OCCUPANCY_TONES[occupancy]}>{t(occupancy)}</Chip>;
}

/** The level's name in the page's language (English falls back to Bangla). */
export const levelName = (level: { levelBn: string; levelEn: string | null }, locale: Locale) =>
  pick(level.levelBn, level.levelEn, locale);

/**
 * "Property map › Block C › Road 9". Steps above the caller's area are shown as
 * plain text; the current page is the last, unlinked step.
 */
export async function PropertyBreadcrumb({ crumbs, current, mapOpen = true }: { crumbs: Crumb[]; current?: string; mapOpen?: boolean }) {
  const t = await getTranslations("Dashboard.nav");
  const steps = [
    { key: "top", label: t("property"), href: mapOpen ? ("/dashboard/property" as const) : null },
    ...crumbs.map((crumb) => ({ key: crumb.id, label: crumb.name, href: crumb.open ? (`/dashboard/property/${crumb.id}` as const) : null })),
  ];

  return (
    <nav aria-label={t("property")} className="mb-3 text-[13px] text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        {steps.map((step) => (
          <li key={step.key} className="flex items-center gap-1">
            {step.href ? (
              <Link href={step.href} className="font-medium text-fg underline-offset-2 hover:underline">
                {step.label}
              </Link>
            ) : (
              <span>{step.label}</span>
            )}
            {current !== undefined || step !== steps.at(-1) ? <ChevronRight className="size-3.5" aria-hidden /> : null}
          </li>
        ))}
        {current !== undefined ? (
          <li aria-current="page" className="font-semibold text-fg">
            {current}
          </li>
        ) : null}
      </ol>
    </nav>
  );
}
