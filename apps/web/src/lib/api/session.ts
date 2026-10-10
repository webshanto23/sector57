import "server-only";

import { AUTH_COOKIES, type Me } from "@s57/shared";
import { cookies } from "next/headers";
import { api } from "./client";

/**
 * The logged-in user for a server component, or null. The proxy has already
 * refreshed an expired access token, so a 401 here really means "log in".
 */
export async function getMe(): Promise<Me | null> {
  const access = (await cookies()).get(AUTH_COOKIES.access)?.value;
  if (!access) return null;
  const { data, response } = await api.GET("/me", {
    headers: { cookie: `${AUTH_COOKIES.access}=${access}` },
    cache: "no-store",
  });
  if (response.status === 401) return null;
  if (!data) throw new Error("Could not load the current user");
  return data;
}
