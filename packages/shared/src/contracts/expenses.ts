import { z } from 'zod';
import { addMoney, compareMoney, moneyOrZeroSchema, moneySchema, subtractMoney, toPaisa } from '../money.js';
import { optionalText, pagination, text } from '../schemas.js';
import { cleanText } from '../text.js';
import { documentHeaderSchema, fundOptionSchema, LEDGER_ACCOUNTS, paymentMethodSchema, paymentRefSchema, refineMethodRef } from './finance.js';
import { isoDay, optionalPhone } from './members.js';

// ---------------------------------------------------------------------------
// The expense flow (pure)
// ---------------------------------------------------------------------------

/**
 * `pending` → `approved` or `rejected` (by someone other than the requester) → `paid` (a
 * voucher number and an `out` ledger row). An approved or paid expense is only ever voided;
 * a paid one gets a reversing ledger row.
 */
export const EXPENSE_STATUSES = ['pending', 'approved', 'rejected', 'paid', 'void'] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export type ExpenseActions = { edit: boolean; approve: boolean; reject: boolean; pay: boolean; void: boolean; upload: boolean };

/**
 * What a caller may do to an expense now. `grants` are their society-wide `expenses` grants.
 * The requester edits their own while it is pending (so does an `edit` holder); nobody
 * approves or rejects their own; paying needs `edit`; voiding needs `approve`. Vouchers can be
 * added until the expense is rejected or void (a bill often arrives after the payment).
 */
export function expenseActions(
  expense: { status: ExpenseStatus; requestedBy: string | null },
  userId: string,
  grants: { create: boolean; edit: boolean; approve: boolean },
): ExpenseActions {
  const own = expense.requestedBy === userId;
  const pending = expense.status === 'pending';
  const editor = grants.edit || (own && grants.create);
  return {
    edit: pending && editor,
    approve: pending && grants.approve && !own,
    reject: pending && grants.approve && !own,
    pay: expense.status === 'approved' && grants.edit,
    void: (expense.status === 'approved' || expense.status === 'paid') && grants.approve,
    upload: (pending || expense.status === 'approved' || expense.status === 'paid') && editor,
  };
}

/** A budget line's figures: what is left, how much is used (0–100+, whole percent) and whether it is over. */
export function budgetFigures(budget: string, approved: string, paid: string): { used: string; remaining: string; percent: number; over: boolean } {
  const used = addMoney(approved, paid);
  const remaining = subtractMoney(budget, used);
  const b = toPaisa(budget);
  const percent = b === 0n ? (toPaisa(used) > 0n ? 100 : 0) : Number((toPaisa(used) * 100n) / b);
  return { used, remaining, percent, over: compareMoney(used, budget) > 0 };
}

// ---------------------------------------------------------------------------
// Heads and vendors
// ---------------------------------------------------------------------------

export const expenseHeadSchema = z.object({
  id: z.uuid(),
  nameBn: z.string(),
  nameEn: z.string().nullable(),
  archived: z.boolean(),
  /** Expenses booked under it (any status). */
  used: z.number().int().min(0),
});
export type ExpenseHead = z.infer<typeof expenseHeadSchema>;

/** `POST /expense-heads`, `PUT /expense-heads/:id`. */
export const expenseHeadInputSchema = z.object({ nameBn: text(100), nameEn: optionalText(100) });
export type ExpenseHeadInput = z.infer<typeof expenseHeadInputSchema>;

export const vendorSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  phone: z.string().nullable(),
  service: z.string().nullable(),
  archived: z.boolean(),
  used: z.number().int().min(0),
});
export type Vendor = z.infer<typeof vendorSchema>;

/** `POST /vendors`, `PUT /vendors/:id`. The name is stored as typed. */
export const vendorInputSchema = z.object({ name: text(200), phone: optionalPhone, service: optionalText(100) });
export type VendorInput = z.infer<typeof vendorInputSchema>;

/** `GET /expenses/options`: heads and vendors (archived ones too, marked), the funds a new expense may use. */
export const expenseOptionsSchema = z.object({
  heads: z.array(expenseHeadSchema),
  vendors: z.array(vendorSchema),
  funds: z.array(fundOptionSchema),
  separateFunds: z.boolean(),
});
export type ExpenseOptions = z.infer<typeof expenseOptionsSchema>;

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

/** Most lines one expense may hold. */
export const MAX_EXPENSE_LINES = 20;

/** One item of an expense: its head, vendor (each line may differ), what it was for and the amount. */
export const expenseLineInputSchema = z.object({
  headId: z.uuid(),
  vendorId: z.uuid().nullish(),
  description: text(500),
  amount: moneySchema,
});
export type ExpenseLineInputValues = z.input<typeof expenseLineInputSchema>;
export type ExpenseLineInput = z.output<typeof expenseLineInputSchema>;

/**
 * `POST /expenses`, `PATCH /expenses/:id` (only while pending). One date, one fund (the default
 * one without `fundId`) and one payment method for the whole record; the amount is the sum of
 * the lines. A cheque number or wallet reference may wait until it is paid.
 */
export const expenseInputSchema = z.object({
  title: optionalText(200),
  fundId: z.uuid().nullish(),
  method: paymentMethodSchema,
  methodRef: paymentRefSchema,
  spentOn: isoDay,
  lines: z.array(expenseLineInputSchema).min(1).max(MAX_EXPENSE_LINES),
});
export type ExpenseInputValues = z.input<typeof expenseInputSchema>;
export type ExpenseInput = z.output<typeof expenseInputSchema>;

/** The record's total: the sum of its lines. */
export const expenseTotal = (lines: readonly { amount: string }[]): string => addMoney('0', ...lines.map((line) => line.amount));

/** `POST /expenses/:id/reject` and `/void`. */
export const expenseReasonSchema = z.object({ reason: text(300) });
export type ExpenseReason = z.infer<typeof expenseReasonSchema>;

/** `POST /expenses/:id/pay`: how it is paid; the method decides the account the money leaves. */
export const expensePaySchema = z.object({ method: paymentMethodSchema, methodRef: paymentRefSchema }).superRefine(refineMethodRef);
export type ExpensePay = z.infer<typeof expensePaySchema>;

const userRef = z.object({ id: z.uuid(), name: z.string() });
const nameRef = z.object({ id: z.uuid(), nameBn: z.string(), nameEn: z.string().nullable() });

/** A list row. `head`, `vendor` and `description` are the first line's; `lines` counts them all. */
export const expenseRowSchema = z.object({
  id: z.uuid(),
  status: z.enum(EXPENSE_STATUSES),
  title: z.string().nullable(),
  head: nameRef,
  fund: nameRef,
  vendor: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  description: z.string(),
  lines: z.number().int().min(1),
  amount: z.string(),
  method: paymentMethodSchema,
  spentOn: isoDay,
  voucherNo: z.string().nullable(),
  requestedBy: userRef.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  /** How many voucher files are attached. */
  vouchers: z.number().int().min(0),
});
export type ExpenseRow = z.infer<typeof expenseRowSchema>;

/** `GET /expenses`. Dates are the day it was spent, both ends included. `requestedBy=me` is the caller. */
export const expenseListQuery = pagination.extend({
  q: z.string().transform(cleanText).pipe(z.string().max(100)).optional(),
  status: z.enum(EXPENSE_STATUSES).optional(),
  headId: z.uuid().optional(),
  fundId: z.uuid().optional(),
  vendorId: z.uuid().optional(),
  from: isoDay.optional(),
  to: isoDay.optional(),
  requestedBy: z.literal('me').optional(),
});
export type ExpenseListQuery = z.infer<typeof expenseListQuery>;

const figure = z.object({ count: z.number().int().min(0), amount: z.string() });

export const expenseListSchema = z.object({
  items: z.array(expenseRowSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  /** The filtered expenses that still count (not rejected, not void). */
  totals: figure,
  /** The stat cards, unfiltered. Paid figures go by the Dhaka day of payment. */
  summary: z.object({
    pending: figure,
    approved: figure,
    paidMonth: figure,
    paidYear: figure.extend({ label: z.string() }),
  }),
});
export type ExpenseList = z.infer<typeof expenseListSchema>;

export const expenseVoucherSchema = z.object({
  id: z.uuid(),
  fileName: z.string(),
  isImage: z.boolean(),
  uploadedAt: z.iso.datetime({ offset: true }),
  uploadedBy: z.string().nullable(),
});
export type ExpenseVoucher = z.infer<typeof expenseVoucherSchema>;

const step = z.object({ by: z.string().nullable(), at: z.iso.datetime({ offset: true }) });

export const expenseLineSchema = z.object({
  id: z.uuid(),
  head: nameRef,
  vendor: z.object({ id: z.uuid(), name: z.string(), phone: z.string().nullable() }).nullable(),
  description: z.string(),
  amount: z.string(),
});
export type ExpenseLine = z.infer<typeof expenseLineSchema>;

/** `GET /expenses/:id`: its lines, every step so far, the vouchers and what the caller may do. */
export const expenseDetailSchema = expenseRowSchema.omit({ vouchers: true, head: true, vendor: true, lines: true }).extend({
  lines: z.array(expenseLineSchema).min(1),
  methodRef: z.string().nullable(),
  approved: step.nullable(),
  rejected: step.extend({ reason: z.string() }).nullable(),
  paid: step.extend({ account: z.enum(LEDGER_ACCOUNTS), method: paymentMethodSchema, methodRef: z.string().nullable() }).nullable(),
  void: step.extend({ reason: z.string() }).nullable(),
  vouchers: z.array(expenseVoucherSchema),
  /** The fund's balance per account, for whoever may pay (null otherwise). */
  fundBalance: z.object({ cash: z.string(), bank: z.string() }).nullable(),
  /** The budget lines for the expense's heads in its fiscal year, for heads that have one. */
  budgets: z.array(z.object({ head: nameRef, year: z.string(), amount: z.string(), used: z.string(), remaining: z.string(), over: z.boolean() })),
  /** What the payment voucher prints at the top. */
  header: documentHeaderSchema,
  can: z.object({ edit: z.boolean(), approve: z.boolean(), reject: z.boolean(), pay: z.boolean(), void: z.boolean(), upload: z.boolean() }),
});
export type ExpenseDetail = z.infer<typeof expenseDetailSchema>;

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

/** A fiscal year as written: `2026-27`, or `2026` when the year starts in January. */
export const fiscalYearLabel = z.string().regex(/^\d{4}(-\d{2})?$/, 'invalid_year');

/** `GET /budgets?year=`. Without `year`, the current fiscal year. */
export const budgetQuery = z.object({ year: fiscalYearLabel.optional() });
export type BudgetQuery = z.infer<typeof budgetQuery>;

export const budgetLineSchema = z.object({
  head: nameRef.extend({ archived: z.boolean() }),
  /** Null when no budget is set for the head this year. */
  budget: z.string().nullable(),
  /** Approved, not yet paid. */
  approved: z.string(),
  paid: z.string(),
  remaining: z.string().nullable(),
  percent: z.number().int().min(0).nullable(),
  over: z.boolean(),
});
export type BudgetLine = z.infer<typeof budgetLineSchema>;

/** Expenses count in the fiscal year of the day they were spent; rejected and void ones don't count. */
export const budgetSchema = z.object({
  year: z.string(),
  start: isoDay,
  end: isoDay,
  /** Years to offer: the current one, the next, and any with budgets. */
  years: z.array(z.string()),
  lines: z.array(budgetLineSchema),
  totals: z.object({ budget: z.string(), approved: z.string(), paid: z.string(), remaining: z.string() }),
  can: z.object({ edit: z.boolean() }),
});
export type Budget = z.infer<typeof budgetSchema>;

/** `PUT /budgets`: the year's amounts per head. A head left out keeps its amount; zero clears it. */
export const budgetInputSchema = z
  .object({
    year: fiscalYearLabel,
    lines: z.array(z.object({ headId: z.uuid(), amount: moneyOrZeroSchema })).min(1).max(200),
  })
  .superRefine((input, ctx) => {
    if (new Set(input.lines.map((line) => line.headId)).size !== input.lines.length) {
      ctx.addIssue({ code: 'custom', path: ['lines'], message: 'duplicate_name' });
    }
  });
export type BudgetInputValues = z.input<typeof budgetInputSchema>;
export type BudgetInput = z.output<typeof budgetInputSchema>;
