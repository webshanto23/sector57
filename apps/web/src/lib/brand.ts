import "server-only";

import { pick, type Locale } from "@s57/shared";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { getSociety } from "@/lib/api/public";

/** What the header, footer and tab title show for the society. */
export type Brand = { name: string; mark: string; place: string | null };

/**
 * The society's name, logo badge and place line, all from the database (Settings >
 * Society profile). Only when the API can't be reached (a build without it) does a
 * neutral "Welfare society" stand in; the next revalidation shows the real name.
 */
export const getBrand = cache(async (locale: Locale): Promise<Brand> => {
  const society = await getSociety();
  if (!society) {
    const t = await getTranslations({ locale, namespace: "Common" });
    return { name: t("fallbackName"), mark: "", place: null };
  }
  return {
    name: pick(society.nameBn, society.nameEn, locale),
    mark: society.mark,
    place: society.placeBn ? pick(society.placeBn, society.placeEn, locale) : null,
  };
});
