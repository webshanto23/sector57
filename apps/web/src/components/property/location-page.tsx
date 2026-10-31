import {
  canAnywhere,
  holdsFloors,
  insideContent,
  locationTabs,
  pick,
  pickLocationTab,
  type LevelCounts,
  type Locale,
  type LocationLevel,
  type LocationSearch,
  type LocationPeople,
  type LocationTab,
  type LocationView,
  type MeWithAccess,
} from "@s57/shared";
import { Building2, Layers, Shapes, ArrowRightLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { DashboardBreadcrumb } from "@/components/dashboard/dashboard-breadcrumb";
import { visibleNavKeys } from "@/components/dashboard/nav";
import { Chip, PageHeader } from "@/components/kit";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { OwnersPanel } from "@/components/members/owners-section";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getDocuments } from "@/lib/api/documents";
import { getBuildingGrid, getUnitTypes } from "@/lib/api/property";
import { getSociety } from "@/lib/api/public";
import { BuildingGrid } from "./building-grid";
import { InsideSection } from "./inside-section";
import { levelName, propertyTrail } from "./labels";
import { LocationEditor } from "./location-editor";
import { LocationStats } from "./location-stats";
import { LocationTabBar } from "./location-tab-bar";

/** The level picker and search: what is chosen, the chip counts, and the results (null on the tree). */
export type Finder = { levelId: string | null; q: string | null; page: number; counts: LevelCounts; result: LocationSearch | null };

/**
 * The property map. At the top: the first places and the level picker. At one place: its
 * summary, then tabs chosen from the level settings, what is inside it first.
 */
export async function LocationPage({
  view,
  levels,
  people = null,
  finder,
  tab,
  transfer = false,
  me,
  locale,
}: {
  view: LocationView;
  levels: LocationLevel[];
  people?: LocationPeople | null;
  finder: Finder;
  /** The `tab` from the URL; anything this place lacks opens its first tab. */
  tab?: unknown;
  /** Opens the owners tab with the transfer form showing. */
  transfer?: boolean;
  me: MeWithAccess;
  locale: Locale;
}) {
  const { location, children, can } = view;
  const canEditLevels = canAnywhere(me.access, "settings", "edit");
  const [t, tNav, tMembers, documents] = await Promise.all([
    getTranslations("Property"),
    getTranslations("Dashboard.nav"),
    getTranslations("Members"),
    location && canAnywhere(me.access, "documents")
      ? getDocuments({ entityType: "location", entityId: location.id, pageSize: 1 })
      : Promise.resolve(null),
  ]);

  if (!location) {
    const unitTypes = can.createUnit ? await getUnitTypes() : [];
    return (
      <>
        <PageHeader
          title={tNav("property")}
          sub={t("sub")}
          actions={
            canEditLevels ? (
              <>
                <Link href="/dashboard/property/unit-types" className={buttonVariants({ variant: "outline" })}>
                  <Shapes aria-hidden />
                  {t("unitTypes")}
                </Link>
                <Link href="/dashboard/property/levels" className={buttonVariants({ variant: "outline" })}>
                  <Layers aria-hidden />
                  {t("levels")}
                </Link>
              </>
            ) : null
          }
        />
        <InsideSection view={view} levels={levels} finder={finder} unitTypes={unitTypes} me={me} locale={locale} />
      </>
    );
  }

  const owners = people?.owners ?? null;
  const tabs = locationTabs(location, { canSeeOwners: owners !== null, canSeeDocuments: documents !== null });
  const active = pickLocationTab(tabs, transfer ? "owners" : tab);
  const showGrid = active === "inside" && holdsFloors(location, levels) && children.some((child) => !child.isUnit);
  const [unitTypes, grid, society] = await Promise.all([
    active === "inside" && (can.createUnit || showGrid) ? getUnitTypes() : Promise.resolve([]),
    showGrid ? getBuildingGrid(location.id) : Promise.resolve(null),
    active === "owners" ? getSociety() : Promise.resolve(null),
  ]);

  const pathname = `/dashboard/property/${location.id}`;
  const unitsOpen = canAnywhere(me.access, "units");
  const canTransfer = tabs.includes("owners") && people !== null && people.can.ownerships.create && people.can.ownerships.edit;
  const inside = insideContent(location, children, levels);
  const insideLabel =
    inside.kind === "floors"
      ? t("pageTabs.floors")
      : inside.kind === "level"
        ? pick(inside.level.nameBn, inside.level.nameEn, locale)
        : t("pageTabs.inside");
  const tabItems: Record<LocationTab, { label: string; count?: number }> = {
    inside: { label: insideLabel, count: inside.kind === "floors" ? location.unitCount : location.childCount },
    owners: { label: t("pageTabs.owners"), count: owners?.length },
    documents: { label: t("pageTabs.documents"), count: documents?.total },
    details: { label: t("pageTabs.details") },
  };

  return (
    <>
      <DashboardBreadcrumb visible={visibleNavKeys(me.access)} tail={propertyTrail(view.breadcrumb, location.name)} />
      <PageHeader
        title={location.name}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            {[levelName(location, locale), location.code].filter(Boolean).join(" · ")}
            <Chip tone={location.isActive ? "good" : "warn"}>{location.isActive ? t("active") : t("inactive")}</Chip>
          </span>
        }
        actions={
          <>
            {unitsOpen && location.unitCount > 0 ? (
              <Link href={{ pathname: "/dashboard/units", query: { areaId: location.id } }} className={buttonVariants({ variant: "outline" })}>
                <Building2 aria-hidden />
                {t("seeUnits")}
              </Link>
            ) : null}
            {canTransfer ? (
              <Link href={{ pathname, query: { tab: "owners", transfer: "1" } }} className={buttonVariants({ variant: "outline" })}>
                <ArrowRightLeft aria-hidden />
                {tMembers("people.transfer")}
              </Link>
            ) : null}
          </>
        }
      />

      <LocationStats location={location} levels={levels} counts={finder.counts} owners={owners} documentCount={documents?.total ?? null} locale={locale} />
      <LocationTabBar pathname={pathname} tabs={tabs.map((id) => ({ id, ...tabItems[id] }))} active={active} locale={locale} />

      <div className="grid gap-3.5">
        {active === "inside" ? (
          <InsideSection
            view={view}
            levels={levels}
            finder={finder}
            unitTypes={unitTypes}
            grid={grid ? <BuildingGrid grid={grid} unitTypes={unitTypes} unitsOpen={unitsOpen} /> : null}
            me={me}
            locale={locale}
          />
        ) : null}
        {active === "owners" && people ? (
          <OwnersPanel key={people.location.id} people={people} idsRequired={society?.requireIdNumbers ?? false} transfer={transfer} />
        ) : null}
        {active === "documents" ? <DocumentsPanel access={me.access} entityType="location" entityId={location.id} split /> : null}
        {active === "details" ? (
          <LocationEditor key={location.id} location={location} canEdit={can.edit} canDelete={can.delete} />
        ) : null}
      </div>
    </>
  );
}
