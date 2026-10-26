import {
  canAnywhere,
  formatNumber,
  OCCUPANCIES,
  UNIT_TYPES,
  unitListQuery,
  type Locale,
  type UnitSummary,
} from "@s57/shared";
import { Building2, DoorOpen, House, KeyRound, Map, X } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Pager } from "@/components/cms/pager";
import { Chip, DataTable, inputClass, PageHeader, SearchInput, StatCard, type Column } from "@/components/kit";
import { OccupancyChip } from "@/components/property/labels";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getLocation, getUnits } from "@/lib/api/property";
import { requirePermission } from "@/lib/api/session";

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
    page: search["page"] ?? 1,
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success ? parsed.data : { page: 1, pageSize: PAGE_SIZE };

  const [t, tUnits, tNav, list, area] = await Promise.all([
    getTranslations("Property"),
    getTranslations("Property.units"),
    getTranslations("Dashboard.nav"),
    getUnits(query),
    query.areaId && canAnywhere(me.access, "locations") ? getLocation(query.areaId) : Promise.resolve(null),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const filters = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.areaId ? { areaId: query.areaId } : {}),
    ...(query.unitType ? { unitType: query.unitType } : {}),
    ...(query.occupancy ? { occupancy: query.occupancy } : {}),
  };
  const n = (value: number) => formatNumber(value, locale);

  const columns: Column<UnitSummary>[] = [
    {
      key: "name",
      header: t("name"),
      cell: (unit) => (
        <Link href={`/dashboard/units/${unit.id}`} className="inline-flex flex-wrap items-center gap-2 font-semibold text-fg">
          {unit.name}
          {!unit.isActive ? <Chip tone="warn">{t("inactive")}</Chip> : null}
        </Link>
      ),
    },
    {
      key: "address",
      header: tUnits("address"),
      cell: (unit) => <span className="whitespace-normal">{unit.address.join(" › ")}</span>,
    },
    { key: "code", header: t("code"), cell: (unit) => (unit.code ? <span className="num">{unit.code}</span> : "—") },
    { key: "type", header: t("unitTypeLabel"), cell: (unit) => t(`unitType.${unit.unitType}`) },
    {
      key: "size",
      header: t("size"),
      numeric: true,
      cell: (unit) => (unit.sizeSqft ? formatNumber(unit.sizeSqft, locale) : "—"),
    },
    { key: "billTo", header: t("billToLabel"), cell: (unit) => t(`billTo.${unit.billTo}`) },
    { key: "occupancy", header: t("occupancyLabel"), cell: (unit) => <OccupancyChip occupancy={unit.occupancy} /> },
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

      {query.areaId ? (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-[13.5px]">
          <Chip tone="info" plain>
            {area?.location ? tUnits("inArea", { name: area.location.name }) : tUnits("inSomeArea")}
          </Chip>
          <Link
            href={{ pathname: "/dashboard/units", query: { ...filters, areaId: undefined } }}
            className="inline-flex items-center gap-1 font-semibold text-primary"
          >
            <X className="size-3.5" aria-hidden />
            {tUnits("clearArea")}
          </Link>
        </p>
      ) : null}

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-center gap-2.5">
        {query.areaId ? <input type="hidden" name="areaId" value={query.areaId} /> : null}
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={tUnits("searchPlaceholder")} aria-label={tUnits("searchLabel")} />
        <select name="unitType" defaultValue={query.unitType ?? ""} aria-label={t("unitTypeLabel")} className={`${inputClass} sm:w-auto!`}>
          <option value="">{tUnits("allTypes")}</option>
          {UNIT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`unitType.${type}`)}
            </option>
          ))}
        </select>
        <select name="occupancy" defaultValue={query.occupancy ?? ""} aria-label={t("occupancyLabel")} className={`${inputClass} sm:w-auto!`}>
          <option value="">{tUnits("allOccupancy")}</option>
          {OCCUPANCIES.map((value) => (
            <option key={value} value={value}>
              {t(`occupancy.${value}`)}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          {tUnits("filter")}
        </Button>
      </form>

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
