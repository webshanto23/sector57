import "server-only";

import {
  type SlaView,
  type TicketDetail,
  type TicketList,
  type TicketListQuery,
  type WorkOrderDetail,
  type WorkOrderList,
  type WorkOrderListQuery,
  type WorkOrderOptions,
} from "@s57/shared";
import { api } from "./client";
import { authHeaders } from "./session";

const failed = (what: string, status: number) => new Error(`Could not load ${what} (${status})`);

export async function getTickets(query: TicketListQuery): Promise<TicketList> {
  const { data, response } = await api.GET("/tickets", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the tickets", response.status);
  return data;
}

/** Null when the ticket doesn't exist or lies outside the caller's area. */
export async function getTicket(id: string): Promise<TicketDetail | null> {
  const { data, response } = await api.GET("/tickets/{id}", { params: { path: { id } }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404 || response.status === 400) return null;
  if (!data) throw failed("the ticket", response.status);
  return data;
}

export async function getSla(): Promise<SlaView> {
  const { data, response } = await api.GET("/helpdesk/sla", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the helpdesk hours", response.status);
  return data;
}

export async function getWorkOrders(query: WorkOrderListQuery): Promise<WorkOrderList> {
  const { data, response } = await api.GET("/work-orders", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the work orders", response.status);
  return data;
}

/** Null when the work order doesn't exist or lies outside the caller's area. */
export async function getWorkOrder(id: string): Promise<WorkOrderDetail | null> {
  const { data, response } = await api.GET("/work-orders/{id}", { params: { path: { id } }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404 || response.status === 400) return null;
  if (!data) throw failed("the work order", response.status);
  return data;
}

export async function getWorkOrderOptions(): Promise<WorkOrderOptions> {
  const { data, response } = await api.GET("/work-orders/options", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the work order options", response.status);
  return data;
}
