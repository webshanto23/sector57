import "server-only";

import { locationSearchQuery } from "@s57/shared";
import { getLevelCounts, searchLocations } from "@/lib/api/property";
import type { Finder } from "./location-page";

type Search = Record<string, string | string[] | undefined>;

/**
 * The level picker and search for one place (or the top) from the URL: `level`, `q`,
 * `page`. A bad value is dropped and the tree shows instead.
 */
export async function loadFinder(search: Search, under: string | undefined): Promise<Finder> {
  const text = (key: string) => (typeof search[key] === "string" && search[key].trim() ? search[key] : undefined);
  const parsed = locationSearchQuery.safeParse({ under, levelId: text("level"), q: text("q"), page: text("page") ?? 1 });
  const query = parsed.success ? parsed.data : { under, page: 1 };
  const searching = Boolean(query.levelId || query.q);
  const [counts, result] = await Promise.all([getLevelCounts(under), searching ? searchLocations(query) : Promise.resolve(null)]);
  return { levelId: query.levelId ?? null, q: query.q ?? null, page: query.page, counts, result };
}
