import "server-only";

import type { DonationDetail, DonationList, DonationListQuery, DonationOptions } from "@s57/shared";
import { api } from "./client";
import { authHeaders } from "./session";

const failed = (what: string, status: number) => new Error(`Could not load ${what} (${status})`);

export async function getDonations(query: Partial<DonationListQuery>): Promise<DonationList> {
  const { data, response } = await api.GET("/donations", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("donations", response.status);
  return data;
}

/** Null when the donation doesn't exist or belongs to another society. */
export async function getDonation(id: string): Promise<DonationDetail | null> {
  const { data, response } = await api.GET("/donations/{id}", { params: { path: { id } }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404 || response.status === 400) return null;
  if (!data) throw failed("the donation", response.status);
  return data;
}

/** Funds, earlier purposes and the receipt header for the form (`donations.create`). */
export async function getDonationOptions(): Promise<DonationOptions> {
  const { data, response } = await api.GET("/donations/options", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the donation form", response.status);
  return data;
}
