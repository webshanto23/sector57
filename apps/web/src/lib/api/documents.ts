import "server-only";

import { AUTH_COOKIES, type DocumentList, type DocumentListQuery } from "@s57/shared";
import { cookies } from "next/headers";
import { api } from "./client";

/** The access cookie, forwarded to the API from a server component (the proxy has already refreshed it). */
async function authHeaders() {
  const access = (await cookies()).get(AUTH_COOKIES.access)?.value;
  return access ? { cookie: `${AUTH_COOKIES.access}=${access}` } : {};
}

/** Null when the person or place can't be seen, or the caller lacks `documents.view`. */
export async function getDocuments(query: Partial<DocumentListQuery>): Promise<DocumentList | null> {
  const { archived, ...rest } = query;
  const params = { query: { ...rest, ...(archived ? { archived: "true" } : {}) } };
  const { data, response } = await api.GET("/documents", { params, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404 || response.status === 403) return null;
  if (!data) throw new Error(`Could not load the documents (${response.status})`);
  return data;
}
