import "server-only";

import {
  type AlbumAdmin,
  type AlbumAdminList,
  type CommitteeSeatList,
  type EditablePage,
  type NoticeAdmin,
  type NoticeAdminList,
  type NoticeAdminListQuery,
  type Pagination,
  type SitePageAdmin,
} from "@s57/shared";
import { api } from "./client";
import { authHeaders } from "./session";

const failed = (what: string, status: number) => new Error(`Could not load ${what} (${status})`);
const missing = (status: number) => status === 404 || status === 400;

export async function getNoticesAdmin(query: Partial<NoticeAdminListQuery>): Promise<NoticeAdminList> {
  const { data, response } = await api.GET("/notices", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("notices", response.status);
  return data;
}

/** Null when the notice doesn't exist or belongs to another society. */
export async function getNoticeAdmin(id: string): Promise<NoticeAdmin | null> {
  const { data, response } = await api.GET("/notices/{id}", {
    params: { path: { id } },
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (missing(response.status)) return null;
  if (!data) throw failed("the notice", response.status);
  return data;
}

export async function getSitePageAdmin(slug: EditablePage): Promise<SitePageAdmin> {
  const { data, response } = await api.GET("/site-pages/{slug}", {
    params: { path: { slug } },
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (!data) throw failed(`page ${slug}`, response.status);
  return data;
}

export async function getCommitteeSeats(): Promise<CommitteeSeatList> {
  const { data, response } = await api.GET("/committee/members", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the committee", response.status);
  return data;
}

export async function getAlbumsAdmin(query: Partial<Pagination>): Promise<AlbumAdminList> {
  const { data, response } = await api.GET("/gallery/albums", {
    params: { query },
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (!data) throw failed("albums", response.status);
  return data;
}

/** Null when the album doesn't exist or belongs to another society. */
export async function getAlbumAdmin(id: string): Promise<AlbumAdmin | null> {
  const { data, response } = await api.GET("/gallery/albums/{id}", {
    params: { path: { id } },
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (missing(response.status)) return null;
  if (!data) throw failed("the album", response.status);
  return data;
}
