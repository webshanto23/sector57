import {
  canAnywhere,
  localDigits,
  type Locale,
  type LocationLevel,
  type LocationNode,
  type LocationPeople,
  type LocationView,
  type MeWithAccess,
} from "@s57/shared";
import { Building2, Layers, MapPin, Shapes } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Note } from "@/components/admin/form-status";
import { Card, Chip, IconBox, PageHeader } from "@/components/kit";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { PeoplePanel } from "@/components/members/people-panel";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getUnitTypes } from "@/lib/api/property";
import { AddPanel } from "./add-panel";
import { levelName, PropertyBreadcrumb } from "./labels";
import { LocationEditor } from "./location-editor";

/** One child in the grid: a link to its own page (units go to the units pages). */
async function ChildCard({ node, locale, unitsOpen }: { node: LocationNode; locale: Locale; unitsOpen: boolean }) {
  const t = await getTranslations("Property");
  const href = node.isUnit ? (unitsOpen ? `/dashboard/units/${node.id}` : null) : `/dashboard/property/${node.id}`;
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-semibold break-words">{node.name}</span>
        <IconBox icon={node.isUnit ? Building2 : MapPin} size="sm" tone={node.isActive ? undefined : "warn"} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip plain>{levelName(node, locale)}</Chip>
        {!node.isActive ? <Chip tone="warn">{t("inactive")}</Chip> : null}
      </div>
      {node.code ? <p className="num text-[12.5px] text-muted-foreground">{node.code}</p> : null}
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
  me,
  locale,
}: {
  view: LocationView;
  levels: LocationLevel[];
  people?: LocationPeople | null;
  me: MeWithAccess;
  locale: Locale;
}) {
  const { location, children, can } = view;
  const [t, tNav, unitTypes] = await Promise.all([
    getTranslations("Property"),
    getTranslations("Dashboard.nav"),
    can.createUnit ? getUnitTypes() : Promise.resolve([]),
  ]);
  const unitsOpen = canAnywhere(me.access, "units");
  const canEditLevels = canAnywhere(me.access, "settings", "edit");

  return (
    <>
      {location ? <PropertyBreadcrumb crumbs={view.breadcrumb} current={location.name} /> : null}
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

        {people ? <PeoplePanel key={`people-${people.location.id}`} people={people} /> : null}
        {view.location ? <DocumentsPanel access={me.access} entityType="location" entityId={view.location.id} /> : null}

        <section className="grid gap-3" aria-labelledby="children-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="children-title" className="text-[15px]">
              {location ? t("inside", { name: location.name }) : t("topLevel")}
            </h2>
          </div>
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
                  <ChildCard node={child} locale={locale} unitsOpen={unitsOpen} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
