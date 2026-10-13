import "server-only";

import type { PayrollMonth, PayslipSheet } from "@s57/shared";
import { api } from "./client";
import { authHeaders } from "./session";

const failed = (what: string, status: number) => new Error(`Could not load ${what} (${status})`);

/** The month's run (or null), earlier voided ones, and the funds and heads the page offers. */
export async function getPayrollMonth(month: string): Promise<PayrollMonth> {
  const { data, response } = await api.GET("/payroll", { params: { query: { month } }, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("the payroll", response.status);
  return data;
}

/** Null when the run or the payslip doesn't exist in the caller's society. */
export async function getPayslipSheet(id: string, payslipId: string): Promise<PayslipSheet | null> {
  const { data, response } = await api.GET("/payroll/{id}/payslips/{payslipId}/sheet", {
    params: { path: { id, payslipId } },
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (response.status === 404 || response.status === 400) return null;
  if (!data) throw failed("the payslip", response.status);
  return data;
}
