import "server-only";

import type { Budget, ExpenseDetail, ExpenseList, ExpenseListQuery, ExpenseOptions } from "@s57/shared";
import { api } from "./client";
import { authHeaders } from "./session";

const failed = (what: string, status: number) => new Error(`Could not load ${what} (${status})`);

export async function getExpenses(query: Partial<ExpenseListQuery>): Promise<ExpenseList> {
  const { data, response } = await api.GET("/expenses", { params: { query }, headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("expenses", response.status);
  return data;
}

/** Null when the expense doesn't exist or belongs to another society. */
export async function getExpense(id: string): Promise<ExpenseDetail | null> {
  const { data, response } = await api.GET("/expenses/{id}", { params: { path: { id } }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 404 || response.status === 400) return null;
  if (!data) throw failed("the expense", response.status);
  return data;
}

/** Heads, vendors and funds (`expenses.view` or `create`). */
export async function getExpenseOptions(): Promise<ExpenseOptions> {
  const { data, response } = await api.GET("/expenses/options", { headers: await authHeaders(), cache: "no-store" });
  if (!data) throw failed("expense heads", response.status);
  return data;
}

/** Null for a year label that isn't one of the society's fiscal years. */
export async function getBudget(year?: string): Promise<Budget | null> {
  const { data, response } = await api.GET("/budgets", { params: { query: year ? { year } : {} }, headers: await authHeaders(), cache: "no-store" });
  if (response.status === 400) return null;
  if (!data) throw failed("the budget", response.status);
  return data;
}
