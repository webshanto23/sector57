import "server-only";

import type { ChargeTypeList, FundList, SocietySettings } from "@s57/shared";
import { api } from "./client";
import { authHeaders } from "./session";

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
