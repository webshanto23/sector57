import { pick, type Locale, type UnitTypeItem } from "@s57/shared";
import { Building2, BriefcaseBusiness, House, Store, Warehouse, type LucideIcon } from "lucide-react";

/** Icons for the starter type codes; a type the society added gets the plain unit icon. */
const UNIT_TYPE_ICONS: Record<string, LucideIcon> = {
  residential: House,
  shop: Store,
  office: BriefcaseBusiness,
  warehouse: Warehouse,
};

export function unitTypeIcon(code: string | null | undefined): LucideIcon {
  return (code && UNIT_TYPE_ICONS[code]) || Building2;
}

/** A unit type's name in the locale; the bare code if the society no longer has that type. */
export function unitTypeName(types: UnitTypeItem[], code: string, locale: Locale): string {
  const type = types.find((item) => item.code === code);
  return type ? pick(type.nameBn, type.nameEn, locale) : code;
}
