import "server-only";

import {
  AUTH_COOKIES,
  type RoleDetail,
  type RoleList,
  type UserDetail,
  type UserFormOptions,
  type UserList,
  type UserListQuery,
} from "@s57/shared";
import { cookies } from "next/headers";
import { api } from "./client";

/** The access cookie, forwarded to the API from a server component (the proxy has already refreshed it). */
async function authHeaders() {
  const access = (await cookies()).get(AUTH_COOKIES.access)?.value;
  return access ? { cookie: `${AUTH_COOKIES.access}=${access}` } : {};
}

const failed = (what: string, status: number) => new Error(`Could not load ${what} (${status})`);

export async function getRoles(): Promise<RoleList> {
  const { data, response } = await api.GET("/roles", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("roles", response.status);
  return data;
}

/** Null when the role doesn't exist or belongs to another society. */
export async function getRole(id: string): Promise<RoleDetail | null> {
  const { data, response } = await api.GET("/roles/{id}", {
    params: { path: { id } },
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (response.status === 404 || response.status === 400) return null;
  if (!data) throw failed("the role", response.status);
  return data;
}

export async function getUsers(query: Partial<UserListQuery>): Promise<UserList> {
  const { data, response } = await api.GET("/users", {
    params: { query },
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (!data) throw failed("users", response.status);
  return data;
}

/** Null when the user doesn't exist or belongs to another society. */
export async function getUser(id: string): Promise<UserDetail | null> {
  const { data, response } = await api.GET("/users/{id}", {
    params: { path: { id } },
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (response.status === 404 || response.status === 400) return null;
  if (!data) throw failed("the user", response.status);
  return data;
}

export async function getUserFormOptions(): Promise<UserFormOptions> {
  const { data, response } = await api.GET("/users/options", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the user form options", response.status);
  return data;
}
