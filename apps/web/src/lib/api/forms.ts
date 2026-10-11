import "server-only";

import { AUTH_COOKIES, type FormDetail, type FormList, type FormListQuery } from "@s57/shared";
import { cookies } from "next/headers";
import { api } from "./client";

/** The access cookie, forwarded to the API from a server component (the proxy has already refreshed it). */
async function authHeaders() {
  const access = (await cookies()).get(AUTH_COOKIES.access)?.value;
  return access ? { cookie: `${AUTH_COOKIES.access}=${access}` } : {};
}

const failed = (what: string, status: number) => new Error(`Could not load ${what} (${status})`);

export async function getForms(query: Partial<FormListQuery>): Promise<FormList> {
  const { data, response } = await api.GET("/forms", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("applications", response.status);
  return data;
}

/** Null when the application doesn't exist, belongs to another society or is outside the caller's area. */
export async function getForm(id: string): Promise<FormDetail | null> {
  const { data, response } = await api.GET("/forms/{id}", { params: { path: { id } }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404 || response.status === 400) return null;
  if (!data) throw failed("the application", response.status);
  return data;
}
