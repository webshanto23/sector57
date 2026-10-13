import "server-only";

import { AUTH_COOKIES, canAnywhere, type MeWithAccess, type PermissionAction, type PermissionModule } from "@s57/shared";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { api } from "./client";

/** Forwards the caller's access cookie on a server-side API call; empty when logged out. */
export async function authHeaders(): Promise<{ cookie?: string }> {
  const access = (await cookies()).get(AUTH_COOKIES.access)?.value;
  return access ? { cookie: `${AUTH_COOKIES.access}=${access}` } : {};
}

/**
 * The logged-in user and what they may do, for a server component, or null. The
 * proxy has already refreshed an expired access token, so a 401 here really means
 * "log in". Cached per request: the layout and the page share one API call.
 */
export const getMe = cache(async (): Promise<MeWithAccess | null> => {
  const headers = await authHeaders();
  if (!headers.cookie) return null;
  const { data, response } = await api.GET("/me", { headers, cache: "no-store" });
  if (response.status === 401) return null;
  if (!data) throw new Error("Could not load the current user");
  return data;
});

/**
 * The logged-in user, if they may `action` on `module` somewhere; otherwise a 404, so a
 * page they may not open isn't revealed. Only hides pages: the API checks every call.
 */
export async function requirePermission(module: PermissionModule, action: PermissionAction = "view"): Promise<MeWithAccess> {
  const me = await getMe();
  if (!me || !canAnywhere(me.access, module, action)) notFound();
  return me;
}
