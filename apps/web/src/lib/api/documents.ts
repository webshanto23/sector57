import "server-only";

import type { DocumentList, DocumentListQuery } from "@s57/shared";
import { api } from "./client";
import { authHeaders } from "./session";

/** Null when the person or place can't be seen, or the caller lacks `documents.view`. */
export async function getDocuments(query: Partial<DocumentListQuery>): Promise<DocumentList | null> {
  const { archived, ...rest } = query;
  const params = { query: { ...rest, ...(archived ? { archived: "true" } : {}) } };
  const { data, response } = await api.GET("/documents", { params, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404 || response.status === 403) return null;
  if (!data) throw new Error(`Could not load the documents (${response.status})`);
  return data;
}
