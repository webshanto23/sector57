import { canAnywhere, formatNumber, unitListQuery, type Locale, type UnitListItem } from "@s57/shared";
import { Building2, DoorOpen, House, KeyRound, Map } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { Chip, DataTable, PageHeader, StatCard, type Column } from "@/components/kit";
import { OccupancyChip } from "@/components/property/labels";
import { UnitTypeIcon } from "@/components/property/unit-type-icon";
import { unitTypeName } from "@/components/property/unit-types";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getUnitAreas, getUnits, getUnitTypes } from "@/lib/api/property";
import { requirePermission } from "@/lib/api/session";
import { UnitFilters } from "./unit-filters";
import { Renters, UnitOwners } from "./unit-people";

const PAGE_SIZE = 25;

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/units">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Dashboard" });
  return { title: t("nav.units") };
}

/** Every unit the caller may see: occupancy figures, search, filters, and a table that becomes cards on phones. */
export default async function UnitsPage({ params, searchParams }: PageProps<"/[locale]/dashboard/units">) {
  const { locale: raw } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);

  const me = await requirePermission("units");
  // A bad filter in the URL is dropped rather than failing the page.
  const search = await searchParams;
  const parsed = unitListQuery.safeParse({
    q: typeof search["q"] === "string" && search["q"].trim() ? search["q"] : undefined,
    areaId: search["areaId"] || undefined,
    unitType: search["unitType"] || undefined,
    occupancy: search["occupancy"] || undefined,
    billTo: search["billTo"] || undefined,
    status: search["status"] || undefined,
    missing: search["missing"] || undefined,
    ownerLives: search["ownerLives"] || undefined,
    page: search["page"] ?? 1,
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success ? parsed.data : { page: 1, pageSize: PAGE_SIZE };

  const [t, tUnits, tNav, list, areas, unitTypes] = await Promise.all([
    getTranslations("Property"),
    getTranslations("Property.units"),
    getTranslations("Dashboard.nav"),
    getUnits(query),
    getUnitAreas(query.areaId),
    getUnitTypes(),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const filters = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.areaId ? { areaId: query.areaId } : {}),
    ...(query.unitType ? { unitType: query.unitType } : {}),
    ...(query.occupancy ? { occupancy: query.occupancy } : {}),
    ...(query.billTo ? { billTo: query.billTo } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.missing ? { missing: query.missing } : {}),
    ...(query.ownerLives ? { ownerLives: query.ownerLives } : {}),
  };
  const n = (value: number) => formatNumber(value, locale);

  const columns: Column<UnitListItem>[] = [
    {
      key: "name",
      header: `${t("name")} · ${tUnits("address")}`,
      // Name on the first line, address on one truncated line below it, so rows stay two lines high.
      cell: (unit) => {
        const address = unit.address.join(" › ");
        return (
          <div className="min-w-56 max-w-88">
            <Link href={`/dashboard/units/${unit.id}`} className="flex items-center gap-2 font-semibold text-fg">
              <span className="truncate">{unit.name}</span>
              {unit.mergedInto ? (
                <Chip>{tUnits("partOf", { name: unit.mergedInto.name })}</Chip>
              ) : !unit.isActive ? (
                <Chip tone="warn">{t("inactive")}</Chip>
              ) : null}
              {unit.includes.length > 0 ? <Chip tone="info">{t("grid.includes", { names: unit.includes.join(", ") })}</Chip> : null}
            </Link>
            <div className="truncate text-[12.5px] font-normal text-muted-foreground" title={address}>
              {address}
            </div>
          </div>
        );
      },
    },
    { key: "code", header: t("code"), cell: (unit) => (unit.code ? <span className="num">{unit.code}</span> : "—") },
    { key: "type", header: t("unitTypeLabel"), cell: (unit) => (
        <span className="inline-flex items-center gap-1.5">
          <UnitTypeIcon code={unit.unitType} className="size-3.5 shrink-0 text-muted-foreground" />
          {unitTypeName(unitTypes, unit.unitType, locale)}
        </span>
      ),
    },
    ...(canAnywhere(me.access, "ownerships")
      ? [{ key: "owners", header: tUnits("owners"), cell: (unit: UnitListItem) => <UnitOwners levels={unit.owners} locale={locale} /> }]
      : []),
    ...(canAnywhere(me.access, "tenancies")
      ? [{ key: "renters", header: tUnits("renter"), cell: (unit: UnitListItem) => <Renters renters={unit.renters} locale={locale} /> }]
      : []),
    {
      key: "size",
      header: t("size"),
      numeric: true,
      cell: (unit) => (unit.sizeSqft ? formatNumber(unit.sizeSqft, locale) : "—"),
    },
    { key: "billTo", header: t("billToLabel"), cell: (unit) => t(`billTo.${unit.billTo}`) },
    { key: "occupancy", header: t("occupancyLabel"), cell: (unit) => (unit.mergedInto ? "—" : <OccupancyChip occupancy={unit.occupancy} />) },
  ];

  return (
    <>
      <PageHeader
        title={tNav("units")}
        sub={tUnits("sub")}
        actions={
          canAnywhere(me.access, "units", "create") && canAnywhere(me.access, "locations") ? (
            <Link href="/dashboard/property" className={buttonVariants({ variant: "outline" })}>
              <Map aria-hidden />
              {tUnits("addHint")}
            </Link>
          ) : null
        }
      />

      <div className="mb-3.5 grid grid-cols-2 gap-2.5 min-[900px]:grid-cols-4">
        <StatCard icon={Building2} label={tUnits("total")} value={n(list.counts.total)} />
        <StatCard icon={House} label={t("occupancy.owner_occupied")} value={n(list.counts.owner_occupied)} tone="acc" />
        <StatCard icon={KeyRound} label={t("occupancy.rented")} value={n(list.counts.rented)} tone="info" />
        <StatCard icon={DoorOpen} label={t("occupancy.vacant")} value={n(list.counts.vacant)} tone="sun" />
      </div>

      <UnitFilters locale={locale} query={filters} areas={areas} unitTypes={unitTypes} ownerships={canAnywhere(me.access, "ownerships")} />

      <DataTable columns={columns} rows={list.items} rowKey={(unit) => unit.id} caption={tNav("units")} empty={tUnits("empty")} />

      <Pager
        locale={locale}
        page={query.page}
        pages={pages}
        href={(target) => ({
          pathname: "/dashboard/units",
          query: { ...filters, ...(target > 1 ? { page: String(target) } : {}) },
        })}
      />
    </>
  );
}
