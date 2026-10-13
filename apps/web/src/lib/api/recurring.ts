import "server-only";

import type { BillingRunList, BillingRunPreview, ScheduleList } from "@s57/shared";
import { api } from "./client";
import { authHeaders } from "./session";

const failed = (what: string, status: number) => new Error(`Could not load ${what} (${status})`);

export async function getSchedules(): Promise<ScheduleList> {
  const { data, response } = await api.GET("/schedules", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the recurring charges", response.status);
  return data;
}

/** Null when the caller isn't a society-wide billing role (403). */
export async function getBillingRuns(page = 1): Promise<BillingRunList | null> {
  const { data, response } = await api.GET("/billing-runs", {
    params: { query: { page, pageSize: 20 } },
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (response.status === 403) return null;
  if (!data) throw failed("the billing runs", response.status);
  return data;
}

/** Null when the month can't be billed yet (400 `future_month`) or the caller may not run billing. */
export async function getRunPreview(month: string): Promise<BillingRunPreview | null> {
  const { data, response } = await api.GET("/billing-runs/preview", {
    params: { query: { month } },
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (response.status === 400 || response.status === 403) return null;
  if (!data) throw failed("the billing preview", response.status);
  return data;
}
