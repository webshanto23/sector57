import "server-only";

import {
  type CollectLookup,
  type CollectLookupQuery,
  type CollectSummary,
  type HandoverList,
  type HandoverListQuery,
  type PaymentDetail,
  type PaymentList,
  type PaymentListQuery,
} from "@s57/shared";
import { api } from "./client";
import { authHeaders } from "./session";

const failed = (what: string, status: number) => new Error(`Could not load ${what} (${status})`);

/** Units and members with their open bills (`payments.create`). */
export async function lookupCollect(query: CollectLookupQuery): Promise<CollectLookup> {
  const { open, ...rest } = query;
  const params = { query: { ...rest, ...(open ? { open: "true" } : {}) } };
  const { data, response } = await api.GET("/collect/lookup", { params, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("open bills", response.status);
  return data;
}

/** The caller's receipts today, cash in hand and pending handovers (`payments.create`). */
export async function getCollectSummary(): Promise<CollectSummary> {
  const { data, response } = await api.GET("/collect/summary", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the collection summary", response.status);
  return data;
}

export async function getPayments(query: Partial<PaymentListQuery>): Promise<PaymentList> {
  // The generated query type takes `inHand` as the string the URL carries.
  const { inHand, ...rest } = query;
  const { data, response } = await api.GET("/payments", {
    params: { query: { ...rest, ...(inHand === undefined ? {} : { inHand: inHand ? "true" : "false" }) } },
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (!data) throw failed("receipts", response.status);
  return data;
}

/** Null when the receipt doesn't exist, belongs to another society or is outside the caller's area. */
export async function getPayment(id: string): Promise<PaymentDetail | null> {
  const { data, response } = await api.GET("/payments/{id}", { params: { path: { id } }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404 || response.status === 400) return null;
  if (!data) throw failed("the receipt", response.status);
  return data;
}

export async function getHandovers(query: Partial<HandoverListQuery>): Promise<HandoverList> {
  const { data, response } = await api.GET("/handovers", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("handovers", response.status);
  return data;
}
