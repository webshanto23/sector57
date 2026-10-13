import "server-only";

import type { LocationLevel, LocationView, UnitDetail, UnitList, UnitListQuery } from "@s57/shared";
import { api } from "./client";
import { authHeaders } from "./session";

const failed = (what: string, status: number) => new Error(`Could not load ${what} (${status})`);
const missing = (status: number) => status === 404 || status === 400;

export async function getLevels(): Promise<LocationLevel[]> {
  const { data, response } = await api.GET("/location-levels", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the levels", response.status);
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

export async function getUnits(query: Partial<UnitListQuery>): Promise<UnitList> {
  const { data, response } = await api.GET("/units", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("units", response.status);
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
