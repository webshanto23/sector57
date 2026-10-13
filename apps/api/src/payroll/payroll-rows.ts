import { Prisma } from '@s57/db';
import {
  addMoney,
  payrollActions,
  type LedgerAccount,
  type PayrollGrants,
  type PayrollRun,
  type PayrollStatus,
  type Payslip,
  type PayslipLineKind,
  type StaffKind,
} from '@s57/shared';
import type { Actor } from '../permissions/permissions.decorators.js';

const userName = { select: { id: true, phone: true, persons: { select: { full_name: true } } } } as const;
type UserName = { id: string; phone: string; persons: { full_name: string } | null };
const userRef = (user: UserName | null) => (user ? { id: user.id, name: user.persons?.full_name ?? user.phone } : null);
const nameRef = (row: { id: string; name_bn: string; name_en: string | null }) => ({ id: row.id, nameBn: row.name_bn, nameEn: row.name_en });

export const payslipSelect = {
  id: true,
  kind: true,
  rate: true,
  days_in_month: true,
  days_employed: true,
  present_days: true,
  half_days: true,
  absent_days: true,
  base: true,
  attendance_deduction: true,
  allowances: true,
  deductions: true,
  net: true,
  note: true,
  funds: { select: { id: true, name_bn: true, name_en: true } },
  staff: {
    select: {
      id: true,
      staff_no: true,
      designation_bn: true,
      designation_en: true,
      joined_on: true,
      left_on: true,
      persons: { select: { full_name: true, full_name_en: true } },
    },
  },
  payslip_lines: { select: { id: true, kind: true, label_bn: true, label_en: true, amount: true }, orderBy: { position: 'asc' } },
} satisfies Prisma.payslipsSelect;
export type PayslipSelected = Prisma.payslipsGetPayload<{ select: typeof payslipSelect }>;

export const runSelect = {
  id: true,
  month: true,
  status: true,
  prepared_by: true,
  prepared_at: true,
  approved_at: true,
  paid_at: true,
  paid_account: true,
  voided_at: true,
  void_reason: true,
  preparer: userName,
  approver: userName,
  payer: userName,
  voider: userName,
  expense_heads: { select: { id: true, name_bn: true, name_en: true } },
  payslips: { select: payslipSelect, orderBy: { staff: { staff_no: 'asc' } } },
  payroll_run_expenses: { select: { expenses: { select: { id: true, voucher_no: true, fund_id: true, amount: true, status: true } } } },
} satisfies Prisma.payroll_runsSelect;
export type RunSelected = Prisma.payroll_runsGetPayload<{ select: typeof runSelect }>;

/** `payroll_runs.month` (a first-of-month date) ↔ `YYYY-MM`. */
export const monthDate = (month: string) => new Date(`${month}-01T00:00:00.000Z`);
export const monthOf = (date: Date) => date.toISOString().slice(0, 7);

/** The caller's society-wide grants as `payrollActions` takes them. */
export function payrollGrants(actor: Actor): PayrollGrants {
  const { access } = actor;
  return {
    edit: access.can('edit', 'payroll'),
    approve: access.can('approve', 'payroll'),
    expensesCreate: access.can('create', 'expenses'),
    expensesApprove: access.can('approve', 'expenses'),
  };
}

export function toPayslip(row: PayslipSelected): Payslip {
  return {
    id: row.id,
    staff: {
      id: row.staff.id,
      staffNo: row.staff.staff_no,
      name: row.staff.persons.full_name,
      nameEn: row.staff.persons.full_name_en,
      designationBn: row.staff.designation_bn,
      designationEn: row.staff.designation_en,
    },
    fund: nameRef(row.funds),
    kind: row.kind as StaffKind,
    rate: row.rate.toFixed(2),
    daysInMonth: row.days_in_month,
    daysEmployed: row.days_employed,
    presentDays: row.present_days,
    halfDays: row.half_days,
    absentDays: row.absent_days,
    base: row.base.toFixed(2),
    attendanceDeduction: row.attendance_deduction.toFixed(2),
    allowances: row.allowances.toFixed(2),
    deductions: row.deductions.toFixed(2),
    net: row.net.toFixed(2),
    note: row.note,
    lines: row.payslip_lines.map((line) => ({
      id: line.id,
      kind: line.kind as PayslipLineKind,
      labelBn: line.label_bn,
      labelEn: line.label_en,
      amount: line.amount.toFixed(2),
    })),
  };
}

export function toRun(row: RunSelected, actor: Actor): PayrollRun {
  const payslips = row.payslips.map(toPayslip);
  const sum = (pick: (slip: Payslip) => string) => addMoney('0', ...payslips.map(pick));
  const byFund = new Map<string, { fund: Payslip['fund']; net: string }>();
  for (const slip of payslips) {
    const entry = byFund.get(slip.fund.id);
    byFund.set(slip.fund.id, { fund: slip.fund, net: entry ? addMoney(entry.net, slip.net) : slip.net });
  }
  const status = row.status as PayrollStatus;
  return {
    id: row.id,
    month: monthOf(row.month),
    status,
    preparedBy: userRef(row.preparer),
    preparedAt: row.prepared_at.toISOString(),
    approvedBy: userRef(row.approver),
    approvedAt: row.approved_at?.toISOString() ?? null,
    paidBy: userRef(row.payer),
    paidAt: row.paid_at?.toISOString() ?? null,
    paidAccount: row.paid_account as LedgerAccount | null,
    expenseHead: row.expense_heads ? nameRef(row.expense_heads) : null,
    voidedBy: userRef(row.voider),
    voidedAt: row.voided_at?.toISOString() ?? null,
    voidReason: row.void_reason,
    totals: {
      count: payslips.length,
      base: sum((slip) => slip.base),
      attendanceDeduction: sum((slip) => slip.attendanceDeduction),
      allowances: sum((slip) => slip.allowances),
      deductions: sum((slip) => slip.deductions),
      net: sum((slip) => slip.net),
    },
    byFund: [...byFund.values()],
    expenses: row.payroll_run_expenses.map(({ expenses: expense }) => ({
      id: expense.id,
      voucherNo: expense.voucher_no,
      fundId: expense.fund_id,
      amount: expense.amount.toFixed(2),
      status: expense.status,
    })),
    payslips,
    can: payrollActions({ status, preparedBy: row.prepared_by }, actor.userId, payrollGrants(actor)),
  };
}

export const auditOf = (actor: Actor, action: string, entityId: string) => ({
  societyId: actor.societyId,
  userId: actor.userId,
  action,
  entityType: 'payroll_run',
  entityId,
  ip: actor.ip,
});
