import "server-only";

import { AUTH_COOKIES, type BillingRunList, type BillingRunPreview, type ScheduleList } from "@s57/shared";
import { cookies } from "next/headers";
import { api } from "./client";

/** The access cookie, forwarded to the API from a server component (the proxy has already refreshed it). */
async function authHeaders() {
  const access = (await cookies()).get(AUTH_COOKIES.access)?.value;
  return access ? { cookie: `${AUTH_COOKIES.access}=${access}` } : {};
}

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
