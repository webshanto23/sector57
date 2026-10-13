import "server-only";

import {
  type DirectoryAllQuery,
  type DirectoryList,
  type DirectoryPrint,
  type DirectoryQuery,
  type MoveDetail,
  type MoveList,
  type MoveListQuery,
} from "@s57/shared";
import { api } from "./client";
import { authHeaders } from "./session";

const failed = (what: string, status: number) => new Error(`Could not load ${what} (${status})`);

/** Null for a place outside the caller's area. */
export async function getMoves(query: MoveListQuery): Promise<MoveList | null> {
  const { data, response } = await api.GET("/moves", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404) return null;
  if (!data) throw failed("the moves", response.status);
  return data;
}

/** Null when the move doesn't exist or lies outside the caller's area. */
export async function getMove(id: string): Promise<MoveDetail | null> {
  const { data, response } = await api.GET("/moves/{id}", { params: { path: { id } }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404 || response.status === 400) return null;
  if (!data) throw failed("the move", response.status);
  return data;
}

/** Null for a place outside the caller's area. */
export async function getDirectory(query: DirectoryQuery): Promise<DirectoryList | null> {
  const { data, response } = await api.GET("/directory", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404) return null;
  if (!data) throw failed("the resident directory", response.status);
  return data;
}

/** Everyone under a place, for the printed sheet. Null for a place outside the caller's area. */
export async function getDirectoryPrint(query: DirectoryAllQuery): Promise<DirectoryPrint | null> {
  const { data, response } = await api.GET("/directory/print", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404) return null;
  if (!data) throw failed("the resident directory", response.status);
  return data;
}

/** The directory CSV through the web's `/api` proxy (the browser sends the session cookie). */
export function directoryCsvHref(query: { areaId?: string | undefined; q?: string | undefined; lang: string }): string {
  const params = new URLSearchParams(Object.entries(query).flatMap(([key, value]) => (value ? [[key, value]] : [])));
  return `/api/directory/csv?${params.toString()}`;
}
