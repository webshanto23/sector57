import {
  canAnywhere,
  holdsFloors,
  localDigits,
  type Locale,
  type LocationLevel,
  type LocationNode,
  type LocationView,
  type MeWithAccess,
  type UnitTypeItem,
} from "@s57/shared";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Pager } from "@/components/cms/pager";
import { AddPanel } from "./add-panel";
import { ChildCard } from "./child-card";
import { LayoutForm } from "./layout-form";
import { LevelBar } from "./level-bar";
import type { Finder } from "./location-page";
import { RemoveSelected } from "./remove-selected";

/**
 * "Set up floors and units" fits an empty place whose next level is the one right above
 * the units (a building over storeys), for callers who may add both. The API checks again.
 */
function canSetUp(location: LocationNode, levels: LocationLevel[], childCount: number, can: LocationView["can"]): boolean {
  return holdsFloors(location, levels) && childCount === 0 && can.create && can.createUnit;
}

/**
 * What sits in a place (or at the top): the level picker and search, adding more, and the cards.
 * With `grid` (a building over floors) the grid leads and the floor cards fold away below it.
 */
export async function InsideSection({
  view,
  levels,
  finder,
  unitTypes,
  grid = null,
  me,
  locale,
}: {
  view: LocationView;
  levels: LocationLevel[];
  finder: Finder;
  unitTypes: UnitTypeItem[];
  grid?: ReactNode;
  me: MeWithAccess;
  locale: Locale;
}) {
  const { location, children, alsoHere, can } = view;
  const t = await getTranslations("Property");
  const unitsOpen = canAnywhere(me.access, "units");
  const pathname = location ? `/dashboard/property/${location.id}` : "/dashboard/property";
  const result = finder.result;
  const heading = (
    <h2 id="children-title" className="text-[15px]">
      {result ? localDigits(t("found", { count: result.total }), locale) : grid ? t("pageTabs.floors") : location ? t("inside", { name: location.name }) : t("topLevel")}
    </h2>
  );

  const cards = (
    <>
      {location && (can.delete || can.deleteUnit) ? <RemoveSelected group={`remove-${location.id}`} /> : null}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2.5">
        {children.map((child) => (
          <li key={child.id} className="grid">
            <ChildCard
              node={child}
              locale={locale}
              unitsOpen={unitsOpen}
              home={child.isUnit ? location?.name : undefined}
              pickGroup={location && (child.isUnit ? can.deleteUnit : can.delete) ? `remove-${location.id}` : undefined}
            />
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <section className="grid gap-3" aria-labelledby="children-title">
      {grid && !result ? null : (
        <LevelBar
          locale={locale}
          levels={levels}
          counts={finder.counts}
          depth={location?.depth ?? 0}
          pathname={pathname}
          levelId={finder.levelId}
          q={finder.q}
        />
      )}
      {result ? heading : null}
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
            heading={heading}
          />
              {grid}
              {children.length === 0 ? (
                <div className="rounded-[12px] border border-line bg-surface p-4 text-muted-foreground">
                  {location ? t("empty") : can.create ? t("emptyTop") : t("noAccess")}
                </div>
              ) : grid ? (
                <details className="grid gap-3 rounded-[12px] border border-line bg-surface p-3.5">
                  <summary className="cursor-pointer font-semibold">{localDigits(t("manageFloors", { count: children.length }), locale)}</summary>
                  <div className="mt-3 grid gap-3">{cards}</div>
                </details>
              ) : (
                cards
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
  );
}
