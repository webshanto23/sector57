import "server-only";

import {
  type BillingLookup,
  type BillingLookupQuery,
  type InvoiceDetail,
  type InvoiceList,
  type InvoiceListQuery,
} from "@s57/shared";
import { api } from "./client";
import { authHeaders } from "./session";

const failed = (what: string, status: number) => new Error(`Could not load ${what} (${status})`);

export async function getInvoices(query: Partial<InvoiceListQuery>): Promise<InvoiceList> {
  const { data, response } = await api.GET("/invoices", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("bills", response.status);
  return data;
}

/** Null when the bill doesn't exist, belongs to another society or is outside the caller's area. */
export async function getInvoice(id: string): Promise<InvoiceDetail | null> {
  const { data, response } = await api.GET("/invoices/{id}", {
    params: { path: { id } },
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (response.status === 404 || response.status === 400) return null;
  if (!data) throw failed("the bill", response.status);
  return data;
}

/** Units and members to bill (`billing.create`). */
export async function lookupBilling(query: BillingLookupQuery): Promise<BillingLookup> {
  const { data, response } = await api.GET("/billing/lookup", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("units to bill", response.status);
  return data;
}
