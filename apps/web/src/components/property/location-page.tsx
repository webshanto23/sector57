import {
  canAnywhere,
  localDigits,
  pick,
  type LevelCounts,
  type Locale,
  type LocationLevel,
  type LocationNode,
  type LocationSearch,
  type LocationPeople,
  type LocationView,
  type MeWithAccess,
  type PartyName,
} from "@s57/shared";
import { Building2, Layers, MapPin, Shapes, UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { Pager } from "@/components/cms/pager";
import { DashboardBreadcrumb } from "@/components/dashboard/dashboard-breadcrumb";
import { visibleNavKeys } from "@/components/dashboard/nav";
import { Card, Chip, IconBox, PageHeader } from "@/components/kit";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { PeoplePanel } from "@/components/members/people-panel";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getBuildingGrid, getUnitTypes } from "@/lib/api/property";
import { getSociety } from "@/lib/api/public";
import { AddPanel } from "./add-panel";
import { BuildingGrid } from "./building-grid";
import { levelName, propertyTrail } from "./labels";
import { LayoutForm } from "./layout-form";
import { LevelBar } from "./level-bar";
import { LocationEditor } from "./location-editor";
import { unitTypeIcon } from "./unit-types";

/** The level picker and search: what is chosen, the chip counts, and the results (null on the tree). */
export type Finder = { levelId: string | null; q: string | null; page: number; counts: LevelCounts; result: LocationSearch | null };

/**
 * "Set up floors and units" fits an empty place whose next level is the one right above
 * the units (a building over storeys), for callers who may add both. The API checks again.
 */
function canSetUp(location: LocationNode, levels: LocationLevel[], childCount: number, can: LocationView["can"]): boolean {
  return holdsFloors(location, levels) && childCount === 0 && can.create && can.createUnit;
}

/** A building over floors: the level right below it is the one right above the units. */
function holdsFloors(location: LocationNode, levels: LocationLevel[]): boolean {
  const below = levels.filter((level) => level.depth > location.depth).sort((a, b) => a.depth - b.depth);
  return !location.isUnit && below[0]?.isUnitLevel === false && below[1]?.isUnitLevel === true;
}

/** Show at most this many owner names on a card; the rest become "+N more". */
const CARD_OWNERS = 2;

/**
 * One child in the grid: a link to its own page (units go to the units pages). Search results
 * add the address and the owners (null: the caller may not view them, so the line is left out).
 */
async function ChildCard({
  node,
  locale,
  unitsOpen,
  address,
  owners,
  home,
}: {
  node: LocationNode;
  locale: Locale;
  unitsOpen: boolean;
  address?: string[];
  owners?: PartyName[] | null;
  /** For a unit over several storeys: the name of its own storey, listed first. */
  home?: string;
}) {
  const t = await getTranslations("Property");
  const ownerNames = (owners ?? []).slice(0, CARD_OWNERS).map((owner) => (locale === "en" ? (owner.nameEn ?? owner.name) : owner.name));
  const href = node.isUnit ? (unitsOpen ? `/dashboard/units/${node.id}` : null) : `/dashboard/property/${node.id}`;
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-semibold break-words">{node.name}</span>
        <IconBox icon={node.isUnit ? unitTypeIcon(node.unitType?.code) : MapPin} size="sm" tone={node.isActive ? undefined : "warn"} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip plain>{node.unitType ? pick(node.unitType.nameBn, node.unitType.nameEn, locale) : levelName(node, locale)}</Chip>
        {node.alsoOn.length > 0 ? <Chip tone="info">{t("storeys.floors", { floors: [home, ...node.alsoOn].filter(Boolean).join(" + ") })}</Chip> : null}
        {!node.isActive ? <Chip tone="warn">{t("inactive")}</Chip> : null}
      </div>
      {address?.length ? <p className="text-[12.5px] break-words text-muted-foreground">{address.join(" › ")}</p> : null}
      {owners ? (
        <p className="flex items-start gap-1.5 text-[13px]">
          <UserRound className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 break-words">
            <span className="text-muted-foreground">{t("levelOwner", { level: levelName(node, locale) })}: </span>
            {owners.length === 0 ? (
              <span className="text-muted-foreground">{t("ownerNone")}</span>
            ) : (
              <>
                <span className="font-medium">{ownerNames.join(", ")}</span>
                {owners.length > CARD_OWNERS ? (
                  <span className="text-muted-foreground"> {localDigits(t("ownerMore", { count: owners.length - CARD_OWNERS }), locale)}</span>
                ) : null}
              </>
            )}
          </span>
        </p>
      ) : null}
      {node.code ? <p className="num text-[12.5px] text-muted-foreground">{t("cardCode", { code: node.code })}</p> : null}
      {!node.isUnit ? (
        <p className="text-[12.5px] text-muted-foreground">
          {localDigits(t("childCount", { count: node.childCount }), locale)} · {localDigits(t("unitCount", { count: node.unitCount }), locale)}
        </p>
      ) : null}
    </>
  );
  const className = "grid content-start gap-2 rounded-[12px] border border-line bg-surface p-3.5";
  return href ? (
    <Link href={href} className={`${className} transition-colors hover:border-muted-foreground`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/**
 * The property map at one place: where it sits, its details, its owners (when the caller
 * may see them), what is inside, and adding more.
 */
export async function LocationPage({
  view,
  levels,
  people = null,
  finder,
  me,
  locale,
}: {
  view: LocationView;
  levels: LocationLevel[];
  people?: LocationPeople | null;
  finder: Finder;
  me: MeWithAccess;
  locale: Locale;
}) {
  const { location, children, alsoHere, can } = view;
  const withGrid = location !== null && holdsFloors(location, levels) && children.some((child) => !child.isUnit);
  const [t, tNav, unitTypes, grid, society] = await Promise.all([
    getTranslations("Property"),
    getTranslations("Dashboard.nav"),
    can.createUnit || withGrid ? getUnitTypes() : Promise.resolve([]),
    withGrid ? getBuildingGrid(location.id) : Promise.resolve(null),
    people ? getSociety() : Promise.resolve(null),
  ]);
  const unitsOpen = canAnywhere(me.access, "units");
  const canEditLevels = canAnywhere(me.access, "settings", "edit");
  const pathname = location ? `/dashboard/property/${location.id}` : "/dashboard/property";
  const result = finder.result;

  return (
    <>
      {location ? <DashboardBreadcrumb visible={visibleNavKeys(me.access)} tail={propertyTrail(view.breadcrumb, location.name)} /> : null}
      <PageHeader
        title={location ? location.name : tNav("property")}
        sub={location ? [levelName(location, locale), location.code].filter(Boolean).join(" · ") : t("sub")}
        actions={
          <>
            {location && unitsOpen && location.unitCount > 0 ? (
              <Link href={{ pathname: "/dashboard/units", query: { areaId: location.id } }} className={buttonVariants({ variant: "outline" })}>
                <Building2 aria-hidden />
                {t("seeUnits")}
              </Link>
            ) : null}
            {!location && canEditLevels ? (
              <Link href="/dashboard/property/unit-types" className={buttonVariants({ variant: "outline" })}>
                <Shapes aria-hidden />
                {t("unitTypes")}
              </Link>
            ) : null}
            {!location && canEditLevels ? (
              <Link href="/dashboard/property/levels" className={buttonVariants({ variant: "outline" })}>
                <Layers aria-hidden />
                {t("levels")}
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3.5">
        {location ? (
          <Card className="grid gap-3.5">
            <h2 className="text-[15px]">{t("details")}</h2>
            {!can.edit && !can.delete ? <Note>{t("readOnly")}</Note> : null}
            <LocationEditor key={location.id} location={location} canEdit={can.edit} canDelete={can.delete} />
          </Card>
        ) : null}

        {people ? <PeoplePanel key={`people-${people.location.id}`} people={people} idsRequired={society?.requireIdNumbers ?? false} /> : null}
        {view.location ? <DocumentsPanel access={me.access} entityType="location" entityId={view.location.id} /> : null}

        {grid ? <BuildingGrid grid={grid} unitTypes={unitTypes} unitsOpen={unitsOpen} /> : null}
        <section className="grid gap-3" aria-labelledby="children-title">
          <LevelBar
            locale={locale}
            levels={levels}
            counts={finder.counts}
            depth={location?.depth ?? 0}
            pathname={pathname}
            levelId={finder.levelId}
            q={finder.q}
          />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="children-title" className="text-[15px]">
              {result ? localDigits(t("found", { count: result.total }), locale) : location ? t("inside", { name: location.name }) : t("topLevel")}
            </h2>
          </div>
          {result ? (
            result.items.length === 0 ? (
              <div className="rounded-[12px] border border-line bg-surface p-4 text-muted-foreground">{t("noMatch")}</div>
            ) : (
              <>
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2.5">
                  {result.items.map((hit) => (
                    <li key={hit.id} className="grid">
                      <ChildCard node={hit} locale={locale} unitsOpen={unitsOpen} address={hit.address} owners={hit.owners} />
                    </li>
                  ))}
                </ul>
                <Pager
                  locale={locale}
                  page={result.page}
                  pages={Math.max(1, Math.ceil(result.total / result.pageSize))}
                  href={(target) => ({
                    pathname,
                    query: {
                      ...(finder.levelId ? { level: finder.levelId } : {}),
                      ...(finder.q ? { q: finder.q } : {}),
                      ...(target > 1 ? { page: String(target) } : {}),
                    },
                  })}
                />
              </>
            )
          ) : (
            <>
              {location && canSetUp(location, levels, children.length, can) ? <LayoutForm locationId={location.id} unitTypes={unitTypes} /> : null}
              <AddPanel
                key={location?.id ?? "top"}
                parentId={location?.id ?? null}
                parentDepth={location?.depth ?? 0}
                levels={levels}
                unitTypes={unitTypes}
                canCreate={can.create}
                canCreateUnit={can.createUnit}
                existingNames={children.map((child) => child.name)}
              />
              {children.length === 0 ? (
                <div className="rounded-[12px] border border-line bg-surface p-4 text-muted-foreground">
                  {location ? t("empty") : can.create ? t("emptyTop") : t("noAccess")}
                </div>
              ) : (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2.5">
                  {children.map((child) => (
                    <li key={child.id} className="grid">
                      <ChildCard node={child} locale={locale} unitsOpen={unitsOpen} home={child.isUnit ? location?.name : undefined} />
                    </li>
                  ))}
                </ul>
              )}
              {alsoHere.length > 0 ? (
                <>
                  <h3 className="text-[14px] font-semibold">{t("storeys.alsoHere")}</h3>
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2.5">
                    {alsoHere.map((unit) => (
                      <li key={unit.id} className="grid">
                        <ChildCard node={unit} locale={locale} unitsOpen={unitsOpen} home={unit.homeName} />
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}
        </section>
      </div>
    </>
  );
}
