import { pick, type Locale, type UnitTypeItem } from "@s57/shared";

/** A unit type's name in the locale; the bare code if the society no longer has that type. */
export function unitTypeName(types: UnitTypeItem[], code: string, locale: Locale): string {
  const type = types.find((item) => item.code === code);
  return type ? pick(type.nameBn, type.nameEn, locale) : code;
}
