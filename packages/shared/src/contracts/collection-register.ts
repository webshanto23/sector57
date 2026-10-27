import { z } from 'zod';
import { addMoney, fromPaisa, toPaisa } from '../money.js';
import { BILL_TO_ROLES } from './billing.js';
import { PAYMENT_METHODS } from './finance.js';
import { isoDay } from './members.js';
import { isoMonth } from './staff.js';

// ---------------------------------------------------------------------------
// Collection register (Step 33): one month of receipts, day by day, one column per charge
// ---------------------------------------------------------------------------

/**
 * `GET /reports/collection-register`: receipts of one Dhaka month (this month when left
 * out) in the caller's `payments` area, optionally under one place, from one collector or
 * by one payment method. Voided receipts are listed (struck, never counted) unless
 * `voided=false`.
 */
export const collectionRegisterQuery = z.object({
  month: isoMonth.optional(),
  locationId: z.uuid().optional(),
  collectorId: z.uuid().optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  voided: z.stringbool().default(true),
});
export type CollectionRegisterQuery = z.infer<typeof collectionRegisterQuery>;

/**
 * Money columns: each charge type (active ones, and archived ones the month used), then
 * donations. Membership fees are a charge type, so they get their own column that way.
 */
export const REGISTER_COLUMN_KINDS = ['charge', 'donation'] as const;
export type RegisterColumnKind = (typeof REGISTER_COLUMN_KINDS)[number];

/** Column key of the donations column; a charge column's key is its charge type id. */
export const REGISTER_DONATION = 'donation';

const registerColumn = z.object({
  key: z.string(),
  kind: z.enum(REGISTER_COLUMN_KINDS),
  /** The charge type's name; null for the donations column (named by the web). */
  nameBn: z.string().nullable(),
  nameEn: z.string().nullable(),
});
export type RegisterColumn = z.infer<typeof registerColumn>;

/** Amount per column key; a column the receipt didn't touch is left out. */
const amounts = z.record(z.string(), z.string());

const registerRow = z.object({
  id: z.uuid(),
  receiptNo: z.string(),
  at: z.iso.datetime({ offset: true }),
  /** The Dhaka date it was taken. */
  day: isoDay,
  /** The payer's name; null when none is recorded (the web shows the role instead). */
  payer: z.string().nullable(),
  /** Owner, renter or member the bills went to; null for a donation. */
  role: z.enum(BILL_TO_ROLES).nullable(),
  /** The months the receipt paid for (`YYYY-MM`), oldest first. */
  months: z.array(isoMonth),
  /** The unit's place names, one per `levels` entry (null where its path has no such level). */
  places: z.array(z.string().nullable()),
  amounts,
  total: z.string(),
  method: z.enum(PAYMENT_METHODS),
  collector: z.object({ id: z.uuid(), name: z.string() }),
  /** Voided since: listed, never counted. */
  void: z.boolean(),
});
export type RegisterRow = z.infer<typeof registerRow>;

const registerTotals = z.object({ amounts, total: z.string(), receipts: z.number().int().min(0) });
export type RegisterTotals = z.infer<typeof registerTotals>;

export const collectionRegisterSchema = z.object({
  month: isoMonth,
  /** The place columns: the levels the listed units sit in, smallest first, without the society's single top level. */
  levels: z.array(z.object({ id: z.uuid(), nameBn: z.string(), nameEn: z.string().nullable() })),
  columns: z.array(registerColumn),
  days: z.array(registerTotals.extend({ day: isoDay, rows: z.array(registerRow) })),
  totals: registerTotals,
  /** Days with at least one counted receipt. */
  activeDays: z.number().int().min(0),
  /** Members whose membership bill was paid on this month (counted receipts only). */
  newMembers: z.number().int().min(0),
});
export type CollectionRegister = z.infer<typeof collectionRegisterSchema>;

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** A bill line for the split: the column it counts in and the month it is for. */
export type RegisterLine = { key: string; amount: string; month: string | null };

/**
 * The part of one allocation each bill line gets. A bill is paid line by line in line
 * order, so `paidBefore` (what earlier, unvoided receipts paid on this bill) fills the
 * first lines and `amount` the ones after. Exact on paisa; anything past the last line
 * (it shouldn't happen) counts on the last line, so the parts always add up to `amount`.
 */
export function splitAcrossLines(lines: readonly RegisterLine[], paidBefore: string, amount: string): RegisterLine[] {
  let skip = toPaisa(paidBefore);
  let left = toPaisa(amount);
  const parts: RegisterLine[] = [];
  for (const line of lines) {
    if (left <= 0n) break;
    let room = toPaisa(line.amount);
    const skipped = skip < room ? skip : room;
    room -= skipped;
    skip -= skipped;
    const take = left < room ? left : room;
    if (take > 0n) parts.push({ ...line, amount: fromPaisa(take) });
    left -= take;
  }
  if (left > 0n) {
    const last = parts.at(-1) ?? (lines.length > 0 ? { ...lines.at(-1)!, amount: '0.00' } : null);
    if (!last) throw new RangeError('A bill without lines cannot take money');
    const extra = { ...last, amount: addMoney(last.amount, fromPaisa(left)) };
    if (parts.length > 0) parts[parts.length - 1] = extra;
    else parts.push(extra);
  }
  return parts;
}

/** Adds the counted (unvoided) rows' amounts per column. */
export function sumRows(rows: readonly Pick<RegisterRow, 'amounts' | 'total' | 'void'>[]): RegisterTotals {
  const sums = new Map<string, bigint>();
  let total = 0n;
  let receipts = 0;
  for (const row of rows) {
    if (row.void) continue;
    receipts += 1;
    total += toPaisa(row.total);
    for (const [key, amount] of Object.entries(row.amounts)) sums.set(key, (sums.get(key) ?? 0n) + toPaisa(amount));
  }
  return {
    amounts: Object.fromEntries([...sums].map(([key, paisa]) => [key, fromPaisa(paisa)])),
    total: fromPaisa(total),
    receipts,
  };
}

/** Rows grouped by day (oldest first, each day in time order) with each day's totals. */
export function groupByDay(rows: readonly RegisterRow[]): CollectionRegister['days'] {
  const byDay = new Map<string, RegisterRow[]>();
  for (const row of [...rows].sort((a, b) => a.at.localeCompare(b.at) || a.receiptNo.localeCompare(b.receiptNo))) {
    const list = byDay.get(row.day);
    if (list) list.push(row);
    else byDay.set(row.day, [row]);
  }
  return [...byDay.keys()].sort().map((day) => ({ day, rows: byDay.get(day)!, ...sumRows(byDay.get(day)!) }));
}

/** The column with the most money (first in column order on a tie); null when nothing counted. */
export function largestColumn(columns: readonly RegisterColumn[], totals: RegisterTotals): { key: string; amount: string } | null {
  let best: { key: string; amount: string } | null = null;
  for (const column of columns) {
    const amount = totals.amounts[column.key];
    if (amount === undefined || toPaisa(amount) <= 0n) continue;
    if (!best || toPaisa(amount) > toPaisa(best.amount)) best = { key: column.key, amount };
  }
  return best;
}
