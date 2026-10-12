import "server-only";

import { AUTH_COOKIES, type Overview } from "@s57/shared";
import { cookies } from "next/headers";
import { api } from "./client";

/** The access cookie, forwarded to the API from a server component (the proxy has already refreshed it). */
async function authHeaders() {
  const access = (await cookies()).get(AUTH_COOKIES.access)?.value;
  return access ? { cookie: `${AUTH_COOKIES.access}=${access}` } : {};
}

/** The dashboard overview: each card is null when the user may not see it. */
export async function getOverview(): Promise<Overview> {
  const { data, response } = await api.GET("/overview", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw new Error(`Could not load the overview (${response.status})`);
  return data;
}
