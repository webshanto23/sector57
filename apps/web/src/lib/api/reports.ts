import "server-only";

import {
  AUTH_COOKIES,
  type ArrearsQuery,
  type ArrearsReport,
  type AuditList,
  type AuditListQuery,
  type AuditOptions,
  type CollectionQuery,
  type CollectionReport,
  type DayBook,
  type IncomeQuery,
  type IncomeReport,
  type LedgerQuery,
  type LedgerStatement,
  type Transfer,
  type TransferList,
  type TransferListQuery,
} from "@s57/shared";
import { cookies } from "next/headers";
import { api } from "./client";

/** The access cookie, forwarded to the API from a server component (the proxy has already refreshed it). */
async function authHeaders() {
  const access = (await cookies()).get(AUTH_COOKIES.access)?.value;
  return access ? { cookie: `${AUTH_COOKIES.access}=${access}` } : {};
}

const failed = (what: string, status: number) => new Error(`Could not load ${what} (${status})`);

/** Null for a bad range or a fund that isn't the society's. */
export async function getLedger(query: Partial<LedgerQuery>): Promise<LedgerStatement | null> {
  const { data, response } = await api.GET("/ledger", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 400 || response.status === 404) return null;
  if (!data) throw failed("the ledger", response.status);
  return data;
}

export async function getTransfers(query: Partial<TransferListQuery>): Promise<TransferList> {
  const { data, response } = await api.GET("/ledger/transfers", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the transfers", response.status);
  return data;
}

/** Null when the transfer doesn't exist or belongs to another society. */
export async function getTransfer(id: string): Promise<Transfer | null> {
  const { data, response } = await api.GET("/ledger/transfers/{id}", { params: { path: { id } }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404 || response.status === 400) return null;
  if (!data) throw failed("the transfer", response.status);
  return data;
}

/** Null for a date the API refuses. */
export async function getDayBook(date?: string): Promise<DayBook | null> {
  const { data, response } = await api.GET("/reports/day-book", { params: { query: date ? { date } : {} }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 400) return null;
  if (!data) throw failed("the day book", response.status);
  return data;
}

/** Null for a bad range or a place outside the caller's area. */
export async function getCollection(query: CollectionQuery): Promise<CollectionReport | null> {
  const { data, response } = await api.GET("/reports/collection", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 400 || response.status === 404) return null;
  if (!data) throw failed("collection by area", response.status);
  return data;
}

/** Null for a place outside the caller's area. */
export async function getArrears(query: ArrearsQuery): Promise<ArrearsReport | null> {
  const { data, response } = await api.GET("/reports/arrears", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 400 || response.status === 404) return null;
  if (!data) throw failed("the arrears", response.status);
  return data;
}

/** Null for a year or fund the API refuses. */
export async function getIncome(query: IncomeQuery): Promise<IncomeReport | null> {
  const { data, response } = await api.GET("/reports/income", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 400 || response.status === 404) return null;
  if (!data) throw failed("income and expenditure", response.status);
  return data;
}

export async function getAuditLog(query: Partial<AuditListQuery>): Promise<AuditList> {
  const { data, response } = await api.GET("/audit", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the audit log", response.status);
  return data;
}

export async function getAuditOptions(): Promise<AuditOptions> {
  const { data, response } = await api.GET("/audit/options", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the audit filters", response.status);
  return data;
}

/** The API path of a report's CSV, through the web's `/api` proxy (the browser sends the session cookie). */
export function csvHref(report: "day-book" | "collection" | "arrears" | "income", query: Record<string, string | undefined>): string {
  const params = new URLSearchParams(Object.entries(query).flatMap(([key, value]) => (value ? [[key, value]] : [])));
  return `/api/reports/${report}/csv?${params.toString()}`;
}
