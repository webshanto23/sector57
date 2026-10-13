import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import { expenseActions, type ExpenseActions, type ExpenseRow, type ExpenseStatus } from '@s57/shared';
import { isoDate } from '../common/dates.js';
import type { CallerAccess } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';

/** Selects, mappers and errors shared by the expense services. */

/** `documents.entity_type` / `doc_type` of a voucher file. */
export const VOUCHER_ENTITY = 'expense';
export const VOUCHER_DOC = 'voucher';
/** Most files one expense may carry. */
export const MAX_VOUCHERS = 10;

export const userName = { select: { id: true, phone: true, persons: { select: { full_name: true } } } } as const;
export type UserName = { id: string; phone: string; persons: { full_name: string } | null };
export const nameOf = (user: UserName) => user.persons?.full_name ?? user.phone;

export const rowSelect = {
  id: true,
  status: true,
  description: true,
  amount: true,
  spent_on: true,
  voucher_no: true,
  created_at: true,
  requested_by: true,
  expense_heads: { select: { id: true, name_bn: true, name_en: true } },
  funds: { select: { id: true, name_bn: true, name_en: true } },
  vendors: { select: { id: true, name: true, phone: true } },
  users_expenses_requested_byTousers: userName,
} satisfies Prisma.expensesSelect;
export type Row = Prisma.expensesGetPayload<{ select: typeof rowSelect }>;

export const detailSelect = {
  ...rowSelect,
  expense_head_id: true,
  approved_at: true,
  rejected_at: true,
  reject_reason: true,
  paid_at: true,
  paid_account: true,
  voided_at: true,
  void_reason: true,
  users_expenses_approved_byTousers: userName,
  users_expenses_rejected_byTousers: userName,
  users_expenses_paid_byTousers: userName,
  users_expenses_voided_byTousers: userName,
} satisfies Prisma.expensesSelect;

export const expenseNotFound = () => new NotFoundException({ code: 'expense_not_found', message: 'Expense not found' });
export const bad = (code: string, message: string) => new BadRequestException({ code, message });
export const conflict = (code: string, message: string) => new ConflictException({ code, message });
export const changed = () => conflict('expense_changed', 'The expense was changed in the meantime; reload it');

export const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** The caller's society-wide `expenses` grants, as `expenseActions` takes them. */
export function grantsOf(access: CallerAccess) {
  return { create: access.can('create', 'expenses'), edit: access.can('edit', 'expenses'), approve: access.can('approve', 'expenses') };
}

export function actionsFor(actor: Actor, row: { status: string; requested_by: string | null }): ExpenseActions {
  return expenseActions({ status: row.status as ExpenseStatus, requestedBy: row.requested_by }, actor.userId, grantsOf(actor.access));
}

export function toRow(row: Row): ExpenseRow {
  const requester = row.users_expenses_requested_byTousers;
  return {
    id: row.id,
    status: row.status as ExpenseStatus,
    head: { id: row.expense_heads.id, nameBn: row.expense_heads.name_bn, nameEn: row.expense_heads.name_en },
    fund: { id: row.funds.id, nameBn: row.funds.name_bn, nameEn: row.funds.name_en },
    vendor: row.vendors ? { id: row.vendors.id, name: row.vendors.name } : null,
    description: row.description,
    amount: row.amount.toFixed(2),
    spentOn: isoDate(row.spent_on),
    voucherNo: row.voucher_no,
    requestedBy: requester ? { id: requester.id, name: nameOf(requester) } : null,
    createdAt: row.created_at.toISOString(),
    vouchers: 0,
  };
}

export const auditOf = (actor: Actor, action: string, entityId: string) => ({
  societyId: actor.societyId,
  userId: actor.userId,
  action,
  entityType: 'expense',
  entityId,
  ip: actor.ip,
});
