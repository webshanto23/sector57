import "server-only";

import { AUTH_COOKIES, type ChargeTypeList, type FundList, type SocietySettings } from "@s57/shared";
import { cookies } from "next/headers";
import { api } from "./client";

/** The access cookie, forwarded to the API from a server component (the proxy has already refreshed it). */
async function authHeaders() {
  const access = (await cookies()).get(AUTH_COOKIES.access)?.value;
  return access ? { cookie: `${AUTH_COOKIES.access}=${access}` } : {};
}

const failed = (what: string, status: number) => new Error(`Could not load ${what} (${status})`);

export async function getSettings(): Promise<SocietySettings> {
  const { data, response } = await api.GET("/settings", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the settings", response.status);
  return data;
}

export async function getFunds(): Promise<FundList> {
  const { data, response } = await api.GET("/funds", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the funds", response.status);
  return data;
}

export async function getChargeTypes(): Promise<ChargeTypeList> {
  const { data, response } = await api.GET("/charge-types", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the charge types", response.status);
  return data;
}
