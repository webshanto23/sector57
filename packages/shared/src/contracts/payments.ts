import { z } from 'zod';
import { compareMoney, fromPaisa, moneyOrZeroSchema, moneySchema, toPaisa } from '../money.js';
import { optionalText, pagination, text } from '../schemas.js';
import { cleanText } from '../text.js';
import { billToSnapshotSchema, invoiceRowSchema, type InvoiceStatus } from './billing.js';
import { documentHeaderSchema } from './finance.js';
import { isoDay } from './members.js';

// ---------------------------------------------------------------------------
// Settling bills (pure; money is decimal strings, arithmetic in paisa)
// ---------------------------------------------------------------------------

/** Most bills one payment may settle. */
export const MAX_PAYMENT_INVOICES = 50;

/** An open bill as allocation needs it. `due` is what is still owed on it. */
export type OpenBill = { id: string; invoiceNo: string; issueDate: string; dueDate: string; due: string };

/** Oldest first: due date, then bill date, then bill number. The order a payment settles bills in. */
export const byOldest = (a: OpenBill, b: OpenBill): number =>
  a.dueDate.localeCompare(b.dueDate) || a.issueDate.localeCompare(b.issueDate) || a.invoiceNo.localeCompare(b.invoiceNo);

export type Allocation = { invoiceId: string; amount: string };

/** Why an amount can't settle the ticked bills. */
export type AllocationRefusal = 'amount_exceeds_due' | 'bill_not_reached';

/**
 * Splits `amount` over the ticked bills, oldest first, each up to what it still owes, so only
 * the last one can be left partly paid. Refused when the amount is more than the bills owe
 * (no credit is kept) or too little to reach every ticked bill (untick the later ones).
 */
export function allocate(bills: readonly OpenBill[], amount: string): { ok: true; allocations: Allocation[] } | { ok: false; code: AllocationRefusal } {
  let left = toPaisa(amount);
  const owed = bills.reduce((sum, bill) => sum + toPaisa(bill.due), 0n);
  if (left > owed) return { ok: false, code: 'amount_exceeds_due' };
  const allocations: Allocation[] = [];
  for (const bill of [...bills].sort(byOldest)) {
    const take = left < toPaisa(bill.due) ? left : toPaisa(bill.due);
    if (take <= 0n) return { ok: false, code: 'bill_not_reached' };
    allocations.push({ invoiceId: bill.id, amount: fromPaisa(take) });
    left -= take;
  }
  return { ok: true, allocations };
}

/** A bill's status once `paid` of its `total` is paid (never `void`). */
export function statusAfterPayment(paid: string, total: string): Exclude<InvoiceStatus, 'void'> {
  if (toPaisa(paid) <= 0n) return 'unpaid';
  return compareMoney(paid, total) >= 0 ? 'paid' : 'partial';
}

/**
 * The collector may void their own payment themselves only on the day they took it, while
 * the cash is still with them (not in a handover). Anything else needs `payments.approve`.
 */
export const collectorMayVoid = (facts: { receivedBy: string; userId: string; receivedDay: string; today: string; inHandover: boolean }): boolean =>
  facts.receivedBy === facts.userId && facts.receivedDay === facts.today && !facts.inHandover;

// ---------------------------------------------------------------------------
// Finding what to collect
// ---------------------------------------------------------------------------

/** `GET /collect/lookup`: by search (unit name or code, member name, phone or number), or one unit or member. */
export const collectLookupQuery = z.object({
  q: z.string().transform(cleanText).pipe(z.string().max(100)).optional(),
  unitId: z.uuid().optional(),
  personId: z.uuid().optional(),
});
export type CollectLookupQuery = z.infer<typeof collectLookupQuery>;

/** Who can be named as the payer: someone a ticked bill was billed to. */
export const payerOptionSchema = z.object({
  kind: z.enum(['person', 'organisation']),
  id: z.uuid(),
  name: z.string(),
  nameEn: z.string().nullable(),
  phone: z.string().nullable(),
});
export type PayerOption = z.infer<typeof payerOptionSchema>;

/**
 * A unit (or a member, for membership fees) with its open bills, oldest first. `payers`
 * are the bills' bill-tos, the newest bill's first.
 */
export const collectAccountSchema = z.object({
  kind: z.enum(['unit', 'member']),
  /** The unit's id, or the member's person id. */
  id: z.uuid(),
  name: z.string(),
  code: z.string().nullable(),
  address: z.array(z.string()),
  memberNo: z.number().int().nullable(),
  bills: z.array(invoiceRowSchema),
  due: z.string(),
  payers: z.array(payerOptionSchema),
});
export type CollectAccount = z.infer<typeof collectAccountSchema>;

export const collectLookupSchema = z.object({ accounts: z.array(collectAccountSchema) });
export type CollectLookup = z.infer<typeof collectLookupSchema>;

/** `GET /collect/summary`: the stat cards, for the caller as collector. */
export const collectSummarySchema = z.object({
  today: z.object({ count: z.number().int().min(0), amount: z.string() }),
  /** Taken by the caller and not yet in a handover. */
  inHand: z.object({ count: z.number().int().min(0), amount: z.string() }),
  /** The caller's handovers still waiting for the treasurer. */
  pending: z.object({ count: z.number().int().min(0), amount: z.string() }),
  /** What the receipt prints at the top, for the live preview. */
  header: documentHeaderSchema,
});
export type CollectSummary = z.infer<typeof collectSummarySchema>;

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

/**
 * `POST /payments`: cash for open bills of one unit (`unitId`) or one member's membership
 * bills (`personId`). The amount may be lowered below what the bills owe, never raised above.
 */
export const paymentCreateSchema = z
  .object({
    unitId: z.uuid().nullish(),
    personId: z.uuid().nullish(),
    invoiceIds: z.array(z.uuid()).min(1).max(MAX_PAYMENT_INVOICES),
    amount: moneySchema,
    payer: z.object({ kind: z.enum(['person', 'organisation']), id: z.uuid() }),
    note: optionalText(300),
  })
  .superRefine((input, ctx) => {
    if (!input.unitId === !input.personId) ctx.addIssue({ code: 'custom', path: ['unitId'], message: 'unit_or_person' });
    if (new Set(input.invoiceIds).size !== input.invoiceIds.length) ctx.addIssue({ code: 'custom', path: ['invoiceIds'], message: 'duplicate_invoice' });
  });
export type PaymentCreateInput = z.input<typeof paymentCreateSchema>;
export type PaymentCreate = z.output<typeof paymentCreateSchema>;

/** Who paid and for which unit, as on the day. A reprint matches the paper. */
export const payerSnapshotSchema = billToSnapshotSchema.omit({ role: true });
export type PayerSnapshot = z.infer<typeof payerSnapshotSchema>;

const userRef = z.object({ id: z.uuid(), name: z.string() });

/** What a receipt is for: open bills (Step 14) or a donation (Step 15, no bills). */
export const PAYMENT_KINDS = ['bills', 'donation'] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const paymentRowSchema = z.object({
  id: z.uuid(),
  kind: z.enum(PAYMENT_KINDS),
  receiptNo: z.string(),
  receivedAt: z.iso.datetime({ offset: true }),
  /** The Dhaka date it was taken. */
  receivedDay: isoDay,
  amount: z.string(),
  /** Null only for an anonymous donation. */
  payer: payerSnapshotSchema.nullable(),
  collectedBy: userRef,
  voided: z.boolean(),
  handover: z.object({ id: z.uuid(), confirmed: z.boolean() }).nullable(),
  invoiceNos: z.array(z.string()),
});
export type PaymentRow = z.infer<typeof paymentRowSchema>;

/** `GET /payments`. Dates are Dhaka days, both ends included. `collectorId=me` is the caller. */
export const paymentListQuery = pagination.extend({
  q: z.string().transform(cleanText).pipe(z.string().max(100)).optional(),
  from: isoDay.optional(),
  to: isoDay.optional(),
  collectorId: z.union([z.uuid(), z.literal('me')]).optional(),
  status: z.enum(['valid', 'void']).optional(),
  unitId: z.uuid().optional(),
  personId: z.uuid().optional(),
  invoiceId: z.uuid().optional(),
  /** Only payments not yet in a handover. */
  inHand: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
export type PaymentListQuery = z.infer<typeof paymentListQuery>;

/** What the filtered payments add up to; void ones count only in `voidCount`. */
export const paymentTotalsSchema = z.object({ count: z.number().int().min(0), amount: z.string(), voidCount: z.number().int().min(0) });

export const paymentListSchema = z.object({
  items: z.array(paymentRowSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totals: paymentTotalsSchema,
});
export type PaymentList = z.infer<typeof paymentListSchema>;

/** One bill a payment settled (part of). Lines are the bill's, for the receipt. */
export const paymentAllocationSchema = z.object({
  invoiceId: z.uuid(),
  invoiceNo: z.string(),
  issueDate: isoDay,
  periodStart: isoDay.nullable(),
  periodEnd: isoDay.nullable(),
  total: z.string(),
  amount: z.string(),
  lines: z.array(z.object({ description: z.string(), descriptionEn: z.string().nullable(), amount: z.string() })),
});
export type PaymentAllocation = z.infer<typeof paymentAllocationSchema>;

/** `GET /payments/:id`, with what the receipt prints at the top. */
export const paymentDetailSchema = paymentRowSchema.extend({
  note: z.string().nullable(),
  allocations: z.array(paymentAllocationSchema),
  /** Set when the receipt is a donation's (then `allocations` is empty). */
  donation: z
    .object({ id: z.uuid(), purpose: z.string().nullable(), fund: z.object({ nameBn: z.string(), nameEn: z.string().nullable() }) })
    .nullable(),
  printCount: z.number().int().min(0),
  void: z.object({ reason: z.string(), at: z.iso.datetime({ offset: true }), by: z.string().nullable() }).nullable(),
  header: documentHeaderSchema,
  can: z.object({ void: z.boolean() }),
});
export type PaymentDetail = z.infer<typeof paymentDetailSchema>;

/** `POST /payments/:id/print`: the first print is the original, every later one a duplicate. */
export const paymentPrintSchema = z.object({ copy: z.enum(['original', 'duplicate']), printCount: z.number().int().min(1) });
export type PaymentPrint = z.infer<typeof paymentPrintSchema>;

/** `POST /payments/:id/void`. */
export const paymentVoidSchema = z.object({ reason: text(300) });
export type PaymentVoidInput = z.infer<typeof paymentVoidSchema>;

// ---------------------------------------------------------------------------
// Handovers
// ---------------------------------------------------------------------------

export const HANDOVER_STATUSES = ['pending', 'confirmed'] as const;
export type HandoverStatus = (typeof HANDOVER_STATUSES)[number];

/**
 * A collector's cash handed to the treasurer. `expected` is the sum of its payments not
 * voided (frozen once confirmed); `difference` is counted minus expected.
 */
export const handoverSchema = z.object({
  id: z.uuid(),
  collector: userRef,
  createdAt: z.iso.datetime({ offset: true }),
  status: z.enum(HANDOVER_STATUSES),
  paymentCount: z.number().int().min(0),
  expected: z.string(),
  counted: z.string().nullable(),
  difference: z.string().nullable(),
  note: z.string().nullable(),
  confirmedBy: z.string().nullable(),
  confirmedAt: z.iso.datetime({ offset: true }).nullable(),
  can: z.object({ confirm: z.boolean() }),
});
export type Handover = z.infer<typeof handoverSchema>;

export const handoverListQuery = pagination.extend({ status: z.enum(HANDOVER_STATUSES).optional() });
export type HandoverListQuery = z.infer<typeof handoverListQuery>;

export const handoverListSchema = z.object({
  items: z.array(handoverSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});
export type HandoverList = z.infer<typeof handoverListSchema>;

/** `POST /handovers/:id/confirm`. A count that differs from what was expected needs a note. */
export const handoverConfirmSchema = z.object({ amountCounted: moneyOrZeroSchema, note: optionalText(500) });
export type HandoverConfirmInput = z.input<typeof handoverConfirmSchema>;
export type HandoverConfirm = z.output<typeof handoverConfirmSchema>;
