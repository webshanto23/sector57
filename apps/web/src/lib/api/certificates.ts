import "server-only";

import type { CertificateDetail, CertificateList, CertificateListQuery, CertificatePrint, CertificateTemplatesView } from "@s57/shared";
import { api } from "./client";
import { authHeaders } from "./session";

const failed = (what: string, status: number) => new Error(`Could not load ${what} (${status})`);

export async function getCertificates(query: Partial<CertificateListQuery>): Promise<CertificateList> {
  const { data, response } = await api.GET("/certificates", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the certificates", response.status);
  return data;
}

/** Null when the certificate doesn't exist or its unit lies outside the caller's area. */
export async function getCertificate(id: string): Promise<CertificateDetail | null> {
  const { data, response } = await api.GET("/certificates/{id}", { params: { path: { id } }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404 || response.status === 400) return null;
  if (!data) throw failed("the certificate", response.status);
  return data;
}

/** Null for a draft (nothing to print yet) or one out of reach. */
export async function getCertificatePrint(id: string): Promise<CertificatePrint | null> {
  const { data, response } = await api.GET("/certificates/{id}/print", { params: { path: { id } }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404 || response.status === 400 || response.status === 409) return null;
  if (!data) throw failed("the certificate", response.status);
  return data;
}

export async function getCertificateTemplates(): Promise<CertificateTemplatesView> {
  const { data, response } = await api.GET("/certificates/templates", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the certificate templates", response.status);
  return data;
}
