import "server-only";

import {
  AUTH_COOKIES,
  type LocationPeople,
  type MemberList,
  type MemberListQuery,
  type OrganisationDetail,
  type PersonDetail,
} from "@s57/shared";
import { cookies } from "next/headers";
import { api } from "./client";

/** The access cookie, forwarded to the API from a server component (the proxy has already refreshed it). */
async function authHeaders() {
  const access = (await cookies()).get(AUTH_COOKIES.access)?.value;
  return access ? { cookie: `${AUTH_COOKIES.access}=${access}` } : {};
}

const failed = (what: string, status: number) => new Error(`Could not load ${what} (${status})`);
const missing = (status: number) => status === 404 || status === 400;

export async function getMembers(query: Partial<MemberListQuery>): Promise<MemberList> {
  const { data, response } = await api.GET("/members", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("members", response.status);
  return data;
}

/** Null when the person doesn't exist, belongs to another society or lives outside the caller's area. */
export async function getPerson(id: string): Promise<PersonDetail | null> {
  const { data, response } = await api.GET("/persons/{id}", {
    params: { path: { id } },
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (missing(response.status)) return null;
  if (!data) throw failed("the member", response.status);
  return data;
}

export async function getOrganisation(id: string): Promise<OrganisationDetail | null> {
  const { data, response } = await api.GET("/organisations/{id}", {
    params: { path: { id } },
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (missing(response.status)) return null;
  if (!data) throw failed("the organisation", response.status);
  return data;
}

/** Owners, tenancies and households of a location; null when the caller may see none of them there. */
export async function getLocationPeople(id: string): Promise<LocationPeople | null> {
  const { data, response } = await api.GET("/locations/{id}/people", {
    params: { path: { id } },
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (missing(response.status)) return null;
  if (!data) throw failed("the people of the location", response.status);
  return data;
}
