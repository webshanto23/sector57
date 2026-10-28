import "server-only";

import type {
  LevelCounts,
  LocationLevel,
  LocationSearch,
  LocationSearchQuery,
  LocationView,
  UnitAreas,
  UnitDetail,
  UnitList,
  UnitListQuery,
  UnitTypeItem,
} from "@s57/shared";
import { api } from "./client";
import { authHeaders } from "./session";

const failed = (what: string, status: number) => new Error(`Could not load ${what} (${status})`);
const missing = (status: number) => status === 404 || status === 400;

export async function getLevels(): Promise<LocationLevel[]> {
  const { data, response } = await api.GET("/location-levels", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the levels", response.status);
  return data.items;
}

/** The society's unit types, in display order. */
export async function getUnitTypes(): Promise<UnitTypeItem[]> {
  const { data, response } = await api.GET("/unit-types", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the unit types", response.status);
  return data.items;
}

/** The top of the map the caller may see. */
export async function getTopLocations(): Promise<LocationView> {
  const { data, response } = await api.GET("/locations", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the property map", response.status);
  return data;
}

/** Null when the location doesn't exist, is a unit, belongs to another society or lies outside the caller's area. */
export async function getLocation(id: string): Promise<LocationView | null> {
  const { data, response } = await api.GET("/locations/{id}", {
    params: { path: { id } },
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (missing(response.status)) return null;
  if (!data) throw failed("the location", response.status);
  return data;
}

/** The map's level picker and search; null when `under` is unknown or outside the caller's area. */
export async function searchLocations(query: Partial<LocationSearchQuery>): Promise<LocationSearch | null> {
  const { data, response } = await api.GET("/locations/search", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (missing(response.status)) return null;
  if (!data) throw failed("the places", response.status);
  return data;
}

/** Places per level below `under` (or the caller's whole tree). */
export async function getLevelCounts(under: string | undefined): Promise<LevelCounts> {
  const { data, response } = await api.GET("/locations/level-counts", {
    params: { query: under ? { under } : {} },
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (!data) throw failed("the level counts", response.status);
  return data;
}

export async function getUnits(query: Partial<UnitListQuery>): Promise<UnitList> {
  const { data, response } = await api.GET("/units", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("units", response.status);
  return data;
}

/** The units list's area picker; null when the area doesn't exist, is a unit or lies outside the caller's area. */
export async function getUnitAreas(parentId: string | undefined): Promise<UnitAreas | null> {
  const { data, response } = await api.GET("/units/areas", {
    params: { query: parentId ? { parentId } : {} },
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (missing(response.status)) return null;
  if (!data) throw failed("the areas", response.status);
  return data;
}

/** Null when the unit doesn't exist or is out of the caller's reach. */
export async function getUnit(id: string): Promise<UnitDetail | null> {
  const { data, response } = await api.GET("/units/{id}", {
    params: { path: { id } },
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (missing(response.status)) return null;
  if (!data) throw failed("the unit", response.status);
  return data;
}
