import { DASHBOARD_NAV, type NavKey } from "./nav";

/** Fixed sub-page segments, each labelled in `Dashboard.crumbs`; any other segment below a section is a record id. */
export const CRUMB_SEGMENTS = [
  "new",
  "print",
  "batch",
  "run",
  "templates",
  "receipts",
  "handovers",
  "budget",
  "setup",
  "assets",
  "maintenance",
  "hours",
  "attendance",
  "payroll",
  "transfers",
  "organisations",
  "levels",
  "unit-types",
  "charge-types",
  "funds",
  "parking",
  "stickers",
  "committee",
  "gallery",
  "pages",
  "arrears",
  "collection",
  "collection-register",
  "day-book",
  "income",
  "members",
  "occupancy",
  "renters",
] as const;

export type CrumbKey = (typeof CRUMB_SEGMENTS)[number] | "details";
export type TrailLabel = { nav: NavKey | "account" } | { crumb: CrumbKey } | { text: string };
export type TrailStep = { label: TrailLabel; href: string | null };

const NAV_KEYS = new Set<string>(DASHBOARD_NAV.flatMap((group) => group.items.map((item) => item.key)));
const isCrumbSegment = (segment: string): segment is (typeof CRUMB_SEGMENTS)[number] =>
  (CRUMB_SEGMENTS as readonly string[]).includes(segment);

/** Sections whose record pages (`/dashboard/property/<id>`, `/dashboard/units/<id>`) render the trail themselves, with the location steps. */
const OWN_TRAIL = new Set(["property", "units"]);

const segmentsOf = (pathname: string) => pathname.split("/").filter(Boolean).slice(1);

/** True when the page renders its own trail, so the layout's copy stays out. */
export function pageOwnsTrail(pathname: string): boolean {
  const [section, ...rest] = segmentsOf(pathname);
  return section !== undefined && OWN_TRAIL.has(section) && rest.length === 1 && !isCrumbSegment(rest[0]!);
}

/**
 * "Overview › Bills › New" from a `/dashboard/...` path (locale already stripped). The section links
 * only when the user may see it in the sidebar; record ids read "Details". The caller unlinks the last step.
 */
export function dashboardTrail(pathname: string, visible: readonly NavKey[]): TrailStep[] {
  const [section, ...rest] = segmentsOf(pathname);
  const steps: TrailStep[] = [{ label: { nav: "overview" }, href: "/dashboard" }];
  if (section === undefined) return steps;

  let href = `/dashboard/${section}`;
  if (section === "account") steps.push({ label: { nav: "account" }, href });
  else if (NAV_KEYS.has(section)) steps.push({ label: { nav: section as NavKey }, href: visible.includes(section as NavKey) ? href : null });
  else steps.push({ label: { crumb: "details" }, href: null });

  for (const segment of rest) {
    href += `/${segment}`;
    steps.push({ label: { crumb: isCrumbSegment(segment) ? segment : "details" }, href });
  }
  return steps;
}
