import { pick, type Crumb, type Locale, type Occupancy } from "@s57/shared";
import { getTranslations } from "next-intl/server";
import type { TailStep } from "@/components/dashboard/dashboard-breadcrumb";
import { Chip } from "@/components/kit";
import { OCCUPANCY_TONES } from "./occupancy";

export async function OccupancyChip({ occupancy }: { occupancy: Occupancy }) {
  const t = await getTranslations("Property.occupancy");
  return <Chip tone={OCCUPANCY_TONES[occupancy]}>{t(occupancy)}</Chip>;
}

/** The level's name in the page's language (English falls back to Bangla). */
export const levelName = (level: { levelBn: string; levelEn: string | null }, locale: Locale) =>
  pick(level.levelBn, level.levelEn, locale);

/**
 * The location steps after the section in the dashboard trail ("Block C › Road 9 › current").
 * Steps above the caller's area stay plain text; the caller's page is the last step.
 */
export const propertyTrail = (crumbs: Crumb[], current: string): TailStep[] => [
  ...crumbs.map((crumb) => ({ key: crumb.id, label: crumb.name, href: crumb.open ? `/dashboard/property/${crumb.id}` : null })),
  { key: "current", label: current, href: null },
];
