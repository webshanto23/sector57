import "server-only";

import {
  type AssetDetail,
  type AssetList,
  type AssetListQuery,
  type AssetOptions,
  type FacilityDetail,
  type FacilityFunds,
  type FacilityList,
  type FacilityListQuery,
  type MaintenanceDue,
  type MaintenanceDueQuery,
} from "@s57/shared";
import { api } from "./client";
import { authHeaders } from "./session";

const failed = (what: string, status: number) => new Error(`Could not load ${what} (${status})`);

export async function getFacilities(query: FacilityListQuery): Promise<FacilityList> {
  const { data, response } = await api.GET("/facilities", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the facilities", response.status);
  return data;
}

/** Null when the facility doesn't exist or lies outside the caller's area. */
export async function getFacility(id: string): Promise<FacilityDetail | null> {
  const { data, response } = await api.GET("/facilities/{id}", { params: { path: { id } }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404 || response.status === 400) return null;
  if (!data) throw failed("the facility", response.status);
  return data;
}

export async function getFacilityFunds(): Promise<FacilityFunds> {
  const { data, response } = await api.GET("/facilities/funds", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the funds", response.status);
  return data;
}

/** Null for a facility or place outside the caller's area. */
export async function getAssets(query: AssetListQuery): Promise<AssetList | null> {
  const { data, response } = await api.GET("/assets", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404) return null;
  if (!data) throw failed("the assets", response.status);
  return data;
}

/** Null when the asset doesn't exist or lies outside the caller's area. */
export async function getAsset(id: string): Promise<AssetDetail | null> {
  const { data, response } = await api.GET("/assets/{id}", { params: { path: { id } }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404 || response.status === 400) return null;
  if (!data) throw failed("the asset", response.status);
  return data;
}

export async function getAssetOptions(): Promise<AssetOptions> {
  const { data, response } = await api.GET("/assets/options", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the asset options", response.status);
  return data;
}

/** Null for a place outside the caller's area. */
export async function getMaintenanceDue(query: MaintenanceDueQuery): Promise<MaintenanceDue | null> {
  const { data, response } = await api.GET("/assets/maintenance-due", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404) return null;
  if (!data) throw failed("the upkeep due", response.status);
  return data;
}

/** The assets CSV through the web's `/api` proxy (the browser sends the session cookie). */
export function assetsCsvHref(query: Record<string, string | undefined>): string {
  const params = new URLSearchParams(Object.entries(query).flatMap(([key, value]) => (value ? [[key, value]] : [])));
  return `/api/assets/csv?${params.toString()}`;
}
