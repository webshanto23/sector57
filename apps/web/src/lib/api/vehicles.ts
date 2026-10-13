import "server-only";

import type {
  ParkingList,
  ParkingListQuery,
  ParkingSlot,
  StickerList,
  StickerListQuery,
  StickerSettingsView,
  StickerSheet,
  VehicleDetail,
  VehicleList,
  VehicleListQuery,
} from "@s57/shared";
import { api } from "./client";
import { authHeaders } from "./session";

const failed = (what: string, status: number) => new Error(`Could not load ${what} (${status})`);

export async function getVehicles(query: Partial<VehicleListQuery>): Promise<VehicleList> {
  const { data, response } = await api.GET("/vehicles", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the vehicles", response.status);
  return data;
}

/** Null when the vehicle doesn't exist or its unit lies outside the caller's area. */
export async function getVehicle(id: string): Promise<VehicleDetail | null> {
  const { data, response } = await api.GET("/vehicles/{id}", { params: { path: { id } }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404 || response.status === 400) return null;
  if (!data) throw failed("the vehicle", response.status);
  return data;
}

export async function getStickers(query: Partial<StickerListQuery>): Promise<StickerList> {
  const { data, response } = await api.GET("/stickers", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the stickers", response.status);
  return data;
}

/** The stickers in force among `ids` that the caller sees; null when the ids are not valid. */
export async function getStickerSheet(ids: string[]): Promise<StickerSheet | null> {
  const { data, response } = await api.GET("/stickers/sheet", { params: { query: { ids: ids.join(",") } }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 400) return null;
  if (!data) throw failed("the sticker sheet", response.status);
  return data;
}

export async function getStickerSettings(): Promise<StickerSettingsView> {
  const { data, response } = await api.GET("/vehicles/settings", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the sticker settings", response.status);
  return data;
}

/** The stickers CSV through the web's `/api` proxy (the browser sends the session cookie). */
export function stickersCsvHref(query: Record<string, string | undefined>): string {
  const params = new URLSearchParams(Object.entries(query).flatMap(([key, value]) => (value ? [[key, value]] : [])));
  return `/api/stickers/csv?${params.toString()}`;
}

export async function getParking(query: Partial<ParkingListQuery>): Promise<ParkingList> {
  const { data, response } = await api.GET("/parking", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the parking slots", response.status);
  return data;
}

/** Null when the slot doesn't exist or lies outside the caller's area. */
export async function getParkingSlot(id: string): Promise<ParkingSlot | null> {
  const { data, response } = await api.GET("/parking/{id}", { params: { path: { id } }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404 || response.status === 400) return null;
  if (!data) throw failed("the parking slot", response.status);
  return data;
}
