import "server-only";

import {
  type MemberRegister,
  type MemberRegisterQuery,
  type OwnerRegister,
  type OwnerRegisterQuery,
  type RenterRegister,
  type RenterRegisterQuery,
} from "@s57/shared";
import { api } from "./client";
import { authHeaders } from "./session";

const failed = (what: string, status: number) => new Error(`Could not load ${what} (${status})`);

export async function getMemberRegister(query: Partial<MemberRegisterQuery>): Promise<MemberRegister> {
  const { data, response } = await api.GET("/registers/members", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the members", response.status);
  return data;
}

export async function getOwnerRegister(query: Partial<OwnerRegisterQuery>): Promise<OwnerRegister> {
  const { data, response } = await api.GET("/registers/owners", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the owners", response.status);
  return data;
}

export async function getRenterRegister(query: Partial<RenterRegisterQuery>): Promise<RenterRegister> {
  const { data, response } = await api.GET("/registers/renters", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the renters", response.status);
  return data;
}
