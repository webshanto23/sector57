import { BILL_TO, formatNumber, OCCUPANCIES, pick, type Locale, type UnitAreas, type UnitListQuery, type UnitTypeItem } from "@s57/shared";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { inputClass, SearchInput } from "@/components/kit";
import { AreaCrumbs } from "@/components/reports/area-crumbs";

type Filters = Partial<Pick<UnitListQuery, "q" | "areaId" | "unitType" | "occupancy" | "billTo" | "status">>;

const selectClass = `${inputClass} sm:w-auto!`;

/**
 * The units list's filters as a plain GET form. The area picker narrows one level at a
 * time: the way down as links, and the areas one level below in a select.
 */
export async function UnitFilters({
  locale,
  query,
  areas,
  unitTypes,
}: {
  locale: Locale;
  query: Filters;
  /** Null when the area in the URL is unknown or out of reach. */
  areas: UnitAreas | null;
  unitTypes: UnitTypeItem[];
}) {
  const [t, tUnits] = await Promise.all([getTranslations("Property"), getTranslations("Property.units")]);
  const area = areas?.area ?? null;
  const children = areas?.children ?? [];
  const rest = { ...query, areaId: undefined };
  const at = (id: string) => ({ pathname: "/dashboard/units", query: { ...rest, areaId: id } });

  return (
    <>
      {query.areaId ? (
        <AreaCrumbs
          top={tUnits("allAreas")}
          topHref={{ pathname: "/dashboard/units", query: rest }}
          crumbs={area ? [...areas!.breadcrumb, { id: area.id, name: area.name, open: true }] : [{ id: query.areaId, name: tUnits("inSomeArea"), open: false }]}
          href={at}
          label={tUnits("area")}
        />
      ) : null}

      <form method="get" role="search" className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <SearchInput name="q" defaultValue={query.q ?? ""} placeholder={tUnits("searchPlaceholder")} aria-label={tUnits("searchLabel")} />
        {children.length ? (
          <select name="areaId" defaultValue={query.areaId ?? ""} aria-label={tUnits("area")} className={selectClass}>
            <option value={query.areaId ?? ""}>{area ? tUnits("allIn", { name: area.name }) : tUnits("allAreas")}</option>
            {children.map((child) => (
              <option key={child.id} value={child.id}>
                {tUnits("areaOption", { name: child.name, count: formatNumber(child.unitCount, locale) })}
              </option>
            ))}
          </select>
        ) : query.areaId ? (
          <input type="hidden" name="areaId" value={query.areaId} />
        ) : null}
        <select name="unitType" defaultValue={query.unitType ?? ""} aria-label={t("unitTypeLabel")} className={selectClass}>
          <option value="">{tUnits("allTypes")}</option>
          {unitTypes.map((type) => (
            <option key={type.code} value={type.code}>
              {pick(type.nameBn, type.nameEn, locale)}
            </option>
          ))}
        </select>
        <select name="occupancy" defaultValue={query.occupancy ?? ""} aria-label={t("occupancyLabel")} className={selectClass}>
          <option value="">{tUnits("allOccupancy")}</option>
          {OCCUPANCIES.map((value) => (
            <option key={value} value={value}>
              {t(`occupancy.${value}`)}
            </option>
          ))}
        </select>
        <select name="billTo" defaultValue={query.billTo ?? ""} aria-label={t("billToLabel")} className={selectClass}>
          <option value="">{tUnits("allBillTo")}</option>
          {BILL_TO.map((value) => (
            <option key={value} value={value}>
              {t(`billTo.${value}`)}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={query.status ?? ""} aria-label={tUnits("allStatus")} className={selectClass}>
          <option value="">{tUnits("allStatus")}</option>
          <option value="active">{tUnits("active")}</option>
          <option value="inactive">{t("inactive")}</option>
        </select>
        <Button type="submit" variant="outline">
          {tUnits("filter")}
        </Button>
      </form>
    </>
  );
}
