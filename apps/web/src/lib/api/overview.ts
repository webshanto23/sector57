import "server-only";

import type { Overview } from "@s57/shared";
import { api } from "./client";
import { authHeaders } from "./session";

/** The dashboard overview: each card is null when the user may not see it. */
export async function getOverview(): Promise<Overview> {
  const { data, response } = await api.GET("/overview", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw new Error(`Could not load the overview (${response.status})`);
  return data;
}
