import { pick, type Locale, type PartyName, type UnitOwnerLevel } from "@s57/shared";
import { getTranslations } from "next-intl/server";

/** The first name and "+N" for the rest; the title lists them all. */
async function Names({ names, locale }: { names: PartyName[]; locale: Locale }) {
  const t = await getTranslations("Property.units");
  const all = names.map((name) => pick(name.name, name.nameEn, locale));
  return (
    <span title={all.length > 1 ? all.join(", ") : undefined}>
      {all[0]}
      {all.length > 1 ? <span className="text-muted-foreground"> {t("more", { count: all.length - 1 })}</span> : null}
    </span>
  );
}

/**
 * Owners at every level of a unit's chain, nearest first: the first (who the bills go to)
 * in full, the levels above muted, each named by its level unless it is the unit's own.
 */
export async function OwnerLevels({ levels, locale }: { levels: UnitOwnerLevel[] | null; locale: Locale }) {
  if (!levels?.length) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-col gap-0.5 whitespace-normal">
      {levels.map((level, index) => (
        <span key={level.locationId} className={index === 0 ? "font-medium text-fg" : "text-[12.5px] text-muted-foreground"}>
          {level.isUnit ? null : <span className="text-muted-foreground">{pick(level.levelBn, level.levelEn, locale)}: </span>}
          <Names names={level.owners} locale={locale} />
        </span>
      ))}
    </span>
  );
}

export async function Renters({ renters, locale }: { renters: PartyName[] | null; locale: Locale }) {
  if (!renters?.length) return <span className="text-muted-foreground">—</span>;
  return <Names names={renters} locale={locale} />;
}
