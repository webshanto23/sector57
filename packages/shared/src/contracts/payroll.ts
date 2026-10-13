import { z } from 'zod';
import { addMoney, fromPaisa, moneySchema, subtractMoney, toPaisa } from '../money.js';
import { optionalText, text } from '../schemas.js';
import { documentHeaderSchema, fundOptionSchema, LEDGER_ACCOUNTS } from './finance.js';
import { isoDay } from './members.js';
import { addDays, daysBetween } from './reports.js';
import { isoMonth, STAFF_KINDS, type StaffKind } from './staff.js';

// ---------------------------------------------------------------------------
// Pay rules
// ---------------------------------------------------------------------------

/** `payroll_runs.status`: draft → approved → paid; any of them → void. */
export const PAYROLL_STATUSES = ['draft', 'approved', 'paid', 'void'] as const;
export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];

/** `payslip_lines.kind`. */
export const PAYSLIP_LINE_KINDS = ['allowance', 'deduction'] as const;
export type PayslipLineKind = (typeof PAYSLIP_LINE_KINDS)[number];

/** At most this many allowance and deduction lines on one payslip. */
export const PAYSLIP_LINE_LIMIT = 20;

/** The month's first and last day (`YYYY-MM` → `YYYY-MM-01`, `YYYY-MM-30`). */
export function monthBounds(month: string): { first: string; last: string; days: number } {
  const first = `${month}-01`;
  const [y, m] = month.split('-').map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first, last: addDays(first, days - 1), days };
}

/**
 * The days of `month` inside a stint that began `joinedOn` and ended `leftOn` (the last day
 * worked, or null while current); null when the stint misses the month.
 */
export function stintInMonth(month: string, joinedOn: string, leftOn: string | null): { from: string; to: string; days: number } | null {
  const { first, last } = monthBounds(month);
  const from = joinedOn > first ? joinedOn : first;
  const to = leftOn !== null && leftOn < last ? leftOn : last;
  return from > to ? null : { from, to, days: daysBetween(from, to) + 1 };
}

/** `paisa × num / den`, rounded half up to the paisa (all non-negative). */
const share = (paisa: bigint, num: bigint, den: bigint): bigint => (paisa * num * 2n + den) / (den * 2n);

/** The attendance a payslip counts, within the stint's days of the month. */
export interface PayslipMarks {
  present: number;
  halfDay: number;
  absent: number;
}

/**
 * What the month owes before allowances and deductions:
 * - monthly staff (permanent, contract): the salary for the days of the stint in the month,
 *   less salary ÷ days in month for each absent day and half that for each half day; leave,
 *   off and unmarked days are paid;
 * - daily workers: the rate for each present day and half of it for each half day.
 * A blank rate pays nothing. The deduction never exceeds the base.
 */
export function payslipFigures(kind: StaffKind, rate: string, daysInMonth: number, daysEmployed: number, marks: PayslipMarks): { base: string; attendanceDeduction: string } {
  const paisa = toPaisa(rate);
  if (kind === 'daily') {
    return { base: fromPaisa(share(paisa, BigInt(marks.present * 2 + marks.halfDay), 2n)), attendanceDeduction: '0.00' };
  }
  const base = share(paisa, BigInt(daysEmployed), BigInt(daysInMonth));
  const deduction = share(paisa, BigInt(marks.absent * 2 + marks.halfDay), BigInt(daysInMonth * 2));
  return { base: fromPaisa(base), attendanceDeduction: fromPaisa(deduction < base ? deduction : base) };
}

/** Net pay; null when the deductions would take it below zero. */
export function payslipNet(base: string, attendanceDeduction: string, allowances: string, deductions: string): string | null {
  const net = subtractMoney(addMoney(base, allowances), addMoney(attendanceDeduction, deductions));
  return toPaisa(net) < 0n ? null : net;
}

/** The allowance and deduction sums of a payslip's lines. */
export function lineTotals(lines: readonly { kind: PayslipLineKind; amount: string }[]): { allowances: string; deductions: string } {
  const sum = (kind: PayslipLineKind) => addMoney('0', ...lines.filter((line) => line.kind === kind).map((line) => line.amount));
  return { allowances: sum('allowance'), deductions: sum('deduction') };
}

/** What the caller may do with a run. Nobody approves a run they prepared. */
export interface PayrollGrants {
  edit: boolean;
  approve: boolean;
  /** `expenses.create`: paying books the salary expenses. */
  expensesCreate: boolean;
  /** `expenses.approve`: voiding a paid run voids its expenses. */
  expensesApprove: boolean;
}

export function payrollActions(run: { status: PayrollStatus; preparedBy: string | null }, userId: string, grants: PayrollGrants) {
  const open = run.status === 'draft' || run.status === 'approved';
  return {
    edit: run.status === 'draft' && grants.edit,
    approve: run.status === 'draft' && grants.approve && run.preparedBy !== userId,
    pay: run.status === 'approved' && grants.edit && grants.expensesCreate,
    void: (open && grants.approve) || (run.status === 'paid' && grants.approve && grants.expensesApprove),
  };
}
export type PayrollActions = ReturnType<typeof payrollActions>;

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** `GET /payroll?month=`. */
export const payrollMonthQuery = z.object({ month: isoMonth });
export type PayrollMonthQuery = z.infer<typeof payrollMonthQuery>;

/** `POST /payroll`: a draft for the month from current pay and attendance (409 `payroll_exists`). */
export const payrollCreateSchema = z.object({ month: isoMonth });
export type PayrollCreateInput = z.infer<typeof payrollCreateSchema>;

export const payslipLineInputSchema = z.object({
  kind: z.enum(PAYSLIP_LINE_KINDS),
  labelBn: text(100),
  labelEn: optionalText(100),
  amount: moneySchema,
});
export type PayslipLineInput = z.infer<typeof payslipLineInputSchema>;

/** `PATCH /payroll/:id/payslips/:payslipId` (draft only): the whole set of lines, the fund and the note. */
export const payslipEditSchema = z.object({
  fundId: z.uuid(),
  note: optionalText(300),
  lines: z.array(payslipLineInputSchema).max(PAYSLIP_LINE_LIMIT),
});
export type PayslipEditValues = z.input<typeof payslipEditSchema>;
export type PayslipEditInput = z.output<typeof payslipEditSchema>;

/** `POST /payroll/:id/pay`: the account the salaries leave and the expense head they are booked under. */
export const payrollPaySchema = z.object({ account: z.enum(LEDGER_ACCOUNTS), headId: z.uuid() });
export type PayrollPayInput = z.infer<typeof payrollPaySchema>;

/** `POST /payroll/:id/void`. */
export const payrollVoidSchema = z.object({ reason: text(300) });
export type PayrollVoidInput = z.infer<typeof payrollVoidSchema>;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

const instant = z.iso.datetime({ offset: true });
const money = z.string();
const userRef = z.object({ id: z.uuid(), name: z.string() });
const nameRef = z.object({ id: z.uuid(), nameBn: z.string(), nameEn: z.string().nullable() });

export const payslipLineSchema = z.object({
  id: z.uuid(),
  kind: z.enum(PAYSLIP_LINE_KINDS),
  labelBn: z.string(),
  labelEn: z.string().nullable(),
  amount: money,
});
export type PayslipLine = z.infer<typeof payslipLineSchema>;

export const payslipSchema = z.object({
  id: z.uuid(),
  staff: z.object({
    id: z.uuid(),
    staffNo: z.number().int(),
    name: z.string(),
    nameEn: z.string().nullable(),
    designationBn: z.string(),
    designationEn: z.string().nullable(),
  }),
  fund: nameRef,
  kind: z.enum(STAFF_KINDS),
  rate: money,
  daysInMonth: z.number().int(),
  daysEmployed: z.number().int(),
  presentDays: z.number().int(),
  halfDays: z.number().int(),
  absentDays: z.number().int(),
  base: money,
  attendanceDeduction: money,
  allowances: money,
  deductions: money,
  net: money,
  note: z.string().nullable(),
  lines: z.array(payslipLineSchema),
});
export type Payslip = z.infer<typeof payslipSchema>;

export const payrollTotalsSchema = z.object({
  count: z.number().int().min(0),
  base: money,
  attendanceDeduction: money,
  allowances: money,
  deductions: money,
  net: money,
});
export type PayrollTotals = z.infer<typeof payrollTotalsSchema>;

export const payrollRunSchema = z.object({
  id: z.uuid(),
  month: isoMonth,
  status: z.enum(PAYROLL_STATUSES),
  preparedBy: userRef.nullable(),
  preparedAt: instant,
  approvedBy: userRef.nullable(),
  approvedAt: instant.nullable(),
  paidBy: userRef.nullable(),
  paidAt: instant.nullable(),
  paidAccount: z.enum(LEDGER_ACCOUNTS).nullable(),
  expenseHead: nameRef.nullable(),
  voidedBy: userRef.nullable(),
  voidedAt: instant.nullable(),
  voidReason: z.string().nullable(),
  totals: payrollTotalsSchema,
  /** Net pay per fund: what paying books, one expense each. */
  byFund: z.array(z.object({ fund: nameRef, net: money })),
  /** The expenses a paid run booked. */
  expenses: z.array(z.object({ id: z.uuid(), voucherNo: z.string().nullable(), fundId: z.uuid(), amount: money, status: z.string() })),
  payslips: z.array(payslipSchema),
  can: z.object({ edit: z.boolean(), approve: z.boolean(), pay: z.boolean(), void: z.boolean() }),
});
export type PayrollRun = z.infer<typeof payrollRunSchema>;

/** `GET /payroll?month=`: the month's live run (or null), earlier voided ones, and what the page needs. */
export const payrollMonthSchema = z.object({
  month: isoMonth,
  run: payrollRunSchema.nullable(),
  voided: z.array(z.object({ id: z.uuid(), voidedAt: instant, voidReason: z.string(), net: money })),
  /** Funds a payslip may be charged to (only the default one unless separate funds is on). */
  funds: z.array(fundOptionSchema),
  /** Expense heads to pay under, with the one the last paid run used first. */
  heads: z.array(nameRef),
  can: z.object({ create: z.boolean() }),
});
export type PayrollMonth = z.infer<typeof payrollMonthSchema>;

/** `GET /payroll/:id/payslips/:payslipId/sheet`: one A5 payslip. */
export const payslipSheetSchema = z.object({
  header: documentHeaderSchema,
  month: isoMonth,
  status: z.enum(PAYROLL_STATUSES),
  paidAt: instant.nullable(),
  payslip: payslipSchema,
  /** The stint's days in the month. */
  period: z.object({ from: isoDay, to: isoDay }),
});
export type PayslipSheet = z.infer<typeof payslipSheetSchema>;
