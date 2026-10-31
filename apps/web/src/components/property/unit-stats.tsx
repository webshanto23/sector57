import { formatDate, formatTaka, isZeroMoney, localDigits, pick, type Locale, type LocationPeople, type Occupancy } from "@s57/shared";
import { getTranslations } from "next-intl/server";
import { StatGrid, Stat } from "./location-stats";

/** A unit's summary: owner (where units can have owners), renter, occupancy and what is due, each only if the caller may see it. */
export async function UnitStats({
  people,
  occupancy,
  outstanding,
  locale,
}: {
  people: LocationPeople | null;
  occupancy: Occupancy;
  /** Null without access to billing. */
  outstanding: string | null;
  locale: Locale;
}) {
  const [t, tOcc] = await Promise.all([getTranslations("Property.pageStats"), getTranslations("Property.occupancy")]);
  const tProperty = await getTranslations("Property");
  const owners = people?.location.canOwn ? people.owners : null;
  const current = owners?.filter((row) => row.endDate === null) ?? [];
  const tenancy = people?.tenancies?.find((row) => row.endDate === null && row.renter);
  const more = current.length > 1 ? localDigits(tProperty("ownerMore", { count: current.length - 1 }), locale) : undefined;

  return (
    <StatGrid>
      {owners ? (
        <Stat
          label={t("owner")}
          value={current[0] ? pick(current[0].owner.name, current[0].owner.nameEn, locale) : tProperty("ownerNone")}
          note={more ?? (current[0] ? `${localDigits(current[0].sharePercent, locale)}%` : undefined)}
        />
      ) : null}
      {people?.tenancies ? (
        <Stat
          label={t("renter")}
          value={tenancy?.renter ? pick(tenancy.renter.name, tenancy.renter.nameEn, locale) : "—"}
          note={tenancy ? t("since", { date: formatDate(tenancy.startDate, locale, "short") }) : undefined}
        />
      ) : null}
      <Stat label={t("occupancy")} value={tOcc(occupancy)} />
      {outstanding !== null ? (
        <Stat label={t("dueNow")} value={<span className={isZeroMoney(outstanding) ? undefined : "text-bad"}>{formatTaka(outstanding, locale)}</span>} />
      ) : null}
    </StatGrid>
  );
}
