import "server-only";

import {
  type LicencePages,
  type LocationPeople,
  type MembershipSettings,
  type NidCopies,
  type OrganisationDetail,
  type PersonDetail,
} from "@s57/shared";
import { api } from "./client";
import { authHeaders } from "./session";

const failed = (what: string, status: number) => new Error(`Could not load ${what} (${status})`);
const missing = (status: number) => status === 404 || status === 400;

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

/** The NID copies of a person; null unless the caller may edit them. */
export async function getNidCopies(id: string): Promise<NidCopies | null> {
  const { data } = await api.GET("/persons/{id}/nid-copy", { params: { path: { id } }, headers: await authHeaders(), cache: "no-store" });
  return data ?? null;
}

/** The trade licence pages of an organisation; null unless the caller may edit them. */
export async function getLicencePages(id: string): Promise<LicencePages | null> {
  const { data } = await api.GET("/organisations/{id}/licence-pages", { params: { path: { id } }, headers: await authHeaders(), cache: "no-store" });
  return data ?? null;
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

/** The society code and first member number (`settings.view`). */
export async function getMembershipSettings(): Promise<MembershipSettings> {
  const { data, response } = await api.GET("/settings/membership", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the membership settings", response.status);
  return data;
}
