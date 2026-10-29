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

/** The unit's own owners only; plot and building owners above it are left out here. */
export async function UnitOwners({ levels, locale }: { levels: UnitOwnerLevel[] | null; locale: Locale }) {
  const own = levels?.find((level) => level.isUnit);
  if (!own?.owners.length) return <span className="text-muted-foreground">—</span>;
  return <Names names={own.owners} locale={locale} />;
}

export async function Renters({ renters, locale }: { renters: PartyName[] | null; locale: Locale }) {
  if (!renters?.length) return <span className="text-muted-foreground">—</span>;
  return <Names names={renters} locale={locale} />;
}
