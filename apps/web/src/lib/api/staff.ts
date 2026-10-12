import "server-only";

import {
  AUTH_COOKIES,
  type AttendanceDay,
  type AttendanceDayQuery,
  type AttendanceMonth,
  type StaffDetail,
  type StaffList,
  type StaffListQuery,
} from "@s57/shared";
import { cookies } from "next/headers";
import { api } from "./client";

/** The access cookie, forwarded to the API from a server component (the proxy has already refreshed it). */
async function authHeaders() {
  const access = (await cookies()).get(AUTH_COOKIES.access)?.value;
  return access ? { cookie: `${AUTH_COOKIES.access}=${access}` } : {};
}

const failed = (what: string, status: number) => new Error(`Could not load ${what} (${status})`);

/** Null for a place outside the caller's area. */
export async function getStaffList(query: StaffListQuery): Promise<StaffList | null> {
  const { data, response } = await api.GET("/staff", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404) return null;
  if (!data) throw failed("the staff", response.status);
  return data;
}

/** Null when the stint doesn't exist or lies outside the caller's area. */
export async function getStaff(id: string): Promise<StaffDetail | null> {
  const { data, response } = await api.GET("/staff/{id}", { params: { path: { id } }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404 || response.status === 400) return null;
  if (!data) throw failed("the staff member", response.status);
  return data;
}

/** Null for a place outside the caller's area. */
export async function getAttendanceDay(query: AttendanceDayQuery): Promise<AttendanceDay | null> {
  const { data, response } = await api.GET("/attendance", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404) return null;
  if (!data) throw failed("the attendance", response.status);
  return data;
}

/** Null without `attendance.view` at the staff member's post. */
export async function getAttendanceMonth(staffId: string, month: string): Promise<AttendanceMonth | null> {
  const { data, response } = await api.GET("/attendance/month", { params: { query: { staffId, month } }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404 || response.status === 403 || response.status === 400) return null;
  if (!data) throw failed("the month's attendance", response.status);
  return data;
}

/** A CSV through the web's `/api` proxy (the browser sends the session cookie). */
export function csvHref(path: "/staff/csv" | "/attendance/csv", query: Record<string, string | undefined>): string {
  const params = new URLSearchParams(Object.entries(query).flatMap(([key, value]) => (value ? [[key, value]] : [])));
  return `/api${path}?${params.toString()}`;
}
