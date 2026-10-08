import "server-only";

import {
  homeContentSchema,
  siteInfoSchema,
  type HomeContent,
  type NoticeListQuery,
  type SiteInfo,
} from "@s57/shared";
import type { z } from "zod";
import { api } from "./client";

/**
 * Server-side reads for the public website. Pages are regenerated at most once
 * a minute (`revalidate` on each page), so the API sees a handful of requests.
 */

/** Notice board page; throws when the API is down so the error page (or the cached page) shows. */
export async function getNotices(query: Partial<NoticeListQuery>) {
  const { data, error } = await api.GET("/public/notices", { params: { query } });
  if (error || !data) throw new Error("Could not load notices");
  return data;
}

/** One notice, or null when the API says it does not exist (missing, private or not yet published). */
export async function getNotice(id: string) {
  const { data, response } = await api.GET("/public/notices/{id}", { params: { path: { id } } });
  if (response.status === 404 || response.status === 400) return null;
  if (!data) throw new Error("Could not load notice");
  return data;
}

/**
 * Latest notices for the home page. Returns [] when the API is unreachable, so
 * the home page still renders (for example while `next build` prerenders it).
 */
export async function getLatestNotices(count: number) {
  try {
    return (await getNotices({ pageSize: count })).items;
  } catch {
    return [];
  }
}

/** Published page content validated against its schema; null when missing, invalid or unreachable. */
async function getPageContent<S extends z.ZodType>(slug: string, schema: S): Promise<z.infer<S> | null> {
  try {
    const { data } = await api.GET("/public/pages/{slug}", { params: { path: { slug } } });
    if (!data) return null;
    const parsed = schema.safeParse(data.content);
    if (!parsed.success) {
      console.error(`site_pages "${slug}" has invalid content`, parsed.error.issues);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export const getHomeContent = (): Promise<HomeContent | null> => getPageContent("home", homeContentSchema);
export const getSiteInfo = (): Promise<SiteInfo | null> => getPageContent("site", siteInfoSchema);

/** The society this site serves; null when the API is unreachable (callers fall back to the i18n name). */
export async function getSociety() {
  try {
    const { data } = await api.GET("/society");
    return data ?? null;
  } catch {
    return null;
  }
}
