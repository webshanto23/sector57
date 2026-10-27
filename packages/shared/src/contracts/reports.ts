import { z } from 'zod';
import { toPaisa } from '../money.js';
import { CHARGE_KINDS, fundOptionSchema, LEDGER_ACCOUNTS } from './finance.js';
import { fiscalYearLabel } from './expenses.js';
import { isoDay } from './members.js';

const nameRef = z.object({ id: z.uuid(), nameBn: z.string(), nameEn: z.string().nullable() });
const userRef = z.object({ id: z.uuid(), name: z.string() });
const crumb = z.object({ id: z.uuid(), name: z.string() });

/**
 * The reports at `/dashboard/reports`. Each needs its source module's `view`; its CSV needs
 * that module's `export` as well. `ledger` covers the income and expenditure statement.
 */
export const REPORT_KEYS = ['day-book', 'collection', 'collection-register', 'arrears', 'income', 'occupancy', 'members', 'renters'] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

/** Whole percent of `part` in `whole` (rounded down), 0 when `whole` is zero. Exact, on paisa. */
export function percentOf(part: string, whole: string): number {
  const w = toPaisa(whole);
  if (w <= 0n) return 0;
  return Number((toPaisa(part) * 100n) / w);
}

// ---------------------------------------------------------------------------
// Day book
// ---------------------------------------------------------------------------

/** `GET /reports/day-book?date=`: one Dhaka day, today when left out. */
export const dayBookQuery = z.object({ date: isoDay.optional() });
export type DayBookQuery = z.infer<typeof dayBookQuery>;

const receiptLine = z.object({
  id: z.uuid(),
  receiptNo: z.string(),
  at: z.iso.datetime({ offset: true }),
  /** Who paid, as printed on the receipt; null for an anonymous donation. */
  payer: z.string().nullable(),
  /** The unit's name and the places above it, for a bill receipt. */
  unit: z.array(z.string()).nullable(),
  amount: z.string(),
  collector: userRef,
  /** Voided since: listed, never counted. */
  void: z.boolean(),
});
export type DayBookReceipt = z.infer<typeof receiptLine>;

const donationLine = receiptLine.omit({ unit: true }).extend({
  donationId: z.uuid(),
  fund: nameRef,
  purpose: z.string().nullable(),
});

/** One line of a paid expense: an expense with several lines shows one row per line. */
const expenseLine = z.object({
  id: z.uuid(),
  lineId: z.uuid(),
  voucherNo: z.string(),
  at: z.iso.datetime({ offset: true }),
  head: nameRef,
  description: z.string(),
  account: z.enum(LEDGER_ACCOUNTS),
  amount: z.string(),
  paidBy: z.string().nullable(),
  void: z.boolean(),
});

const transferLine = z.object({
  id: z.uuid(),
  from: z.object({ fund: nameRef, account: z.enum(LEDGER_ACCOUNTS) }),
  to: z.object({ fund: nameRef, account: z.enum(LEDGER_ACCOUNTS) }),
  amount: z.string(),
  memo: z.string().nullable(),
  void: z.boolean(),
});

const fundDay = z.object({
  fund: nameRef,
  account: z.enum(LEDGER_ACCOUNTS),
  opening: z.string(),
  in: z.string(),
  out: z.string(),
  closing: z.string(),
});

/**
 * Everything that happened on one day. A section is null when the caller may not see it:
 * bill receipts need `payments.view` (and only those in the caller's area), donations
 * `donations.view`, expenses `expenses.view`, transfers and the fund summary `ledger.view`.
 */
export const dayBookSchema = z.object({
  date: isoDay,
  receipts: z.object({ items: z.array(receiptLine), total: z.string() }).nullable(),
  donations: z.object({ items: z.array(donationLine), total: z.string() }).nullable(),
  expenses: z.object({ items: z.array(expenseLine), total: z.string() }).nullable(),
  transfers: z.object({ items: z.array(transferLine) }).nullable(),
  /** Cash each collector took that day, bill receipts and donations the caller can see; voids left out. */
  byCollector: z.array(z.object({ collector: userRef, receipts: z.number().int().min(0), amount: z.string() })),
  /** Per fund and account: what it held at the start of the day, in, out, and at the end. Null without `ledger.view`. */
  funds: z.array(fundDay).nullable(),
});
export type DayBook = z.infer<typeof dayBookSchema>;

// ---------------------------------------------------------------------------
// Collection by area
// ---------------------------------------------------------------------------

/**
 * `GET /reports/collection`: bills issued in the range (regular bills of units; earlier
 * arrears and membership fees are left out), billed against paid so far, per area directly
 * under `parentId`. Without `parentId`: under the society's one top-level place, or the
 * top-level places themselves when there are several.
 */
export const collectionQuery = z.object({
  from: isoDay.optional(),
  to: isoDay.optional(),
  parentId: z.uuid().optional(),
});
export type CollectionQuery = z.infer<typeof collectionQuery>;

const collectionFigures = z.object({
  bills: z.number().int().min(0),
  billed: z.string(),
  collected: z.string(),
  outstanding: z.string(),
  percent: z.number().int().min(0),
});

export const collectionReportSchema = z.object({
  from: isoDay,
  to: isoDay,
  /** The place the areas sit under, and the way up to it; null at the top. */
  parent: crumb.nullable(),
  crumbs: z.array(crumb.extend({ open: z.boolean() })),
  areas: z.array(
    collectionFigures.extend({
      id: z.uuid(),
      name: z.string(),
      /** A unit directly under the parent: nothing to open below it. */
      isUnit: z.boolean(),
    }),
  ),
  totals: collectionFigures,
});
export type CollectionReport = z.infer<typeof collectionReportSchema>;

// ---------------------------------------------------------------------------
// Arrears
// ---------------------------------------------------------------------------

/** How long a bill has been overdue: 1–30, 31–90, more than 90 days after its due date. */
export const ARREARS_BUCKETS = ['d30', 'd90', 'older'] as const;
export type ArrearsBucket = (typeof ARREARS_BUCKETS)[number];

/** Whole days from `dueDate` to `today` (both `YYYY-MM-DD`). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** `day` moved by `n` whole days (negative goes back), as `YYYY-MM-DD`. */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** The bucket of a bill overdue since `dueDate`; null when it is not overdue yet. */
export function arrearsBucket(dueDate: string, today: string): ArrearsBucket | null {
  const days = daysBetween(dueDate, today);
  if (days <= 0) return null;
  return days <= 30 ? 'd30' : days <= 90 ? 'd90' : 'older';
}

/** `GET /reports/arrears?locationId=`: units under a place (or all the caller's), with overdue bills. */
export const arrearsQuery = z.object({ locationId: z.uuid().optional() });
export type ArrearsQuery = z.infer<typeof arrearsQuery>;

const buckets = z.object({ d30: z.string(), d90: z.string(), older: z.string() });

export const arrearsRowSchema = z.object({
  unitId: z.uuid(),
  unit: z.string(),
  code: z.string().nullable(),
  /** The places above the unit, top first. */
  address: z.array(z.string()),
  /** Who the latest overdue bill went to. */
  billTo: z.object({ name: z.string(), phone: z.string().nullable() }).nullable(),
  bills: z.number().int().min(1),
  oldestDue: isoDay,
  owed: z.string(),
  buckets,
});
export type ArrearsRow = z.infer<typeof arrearsRowSchema>;

/** The most units one arrears list returns; narrow it to a block or road for more. */
export const ARREARS_LIMIT = 2000;

export const arrearsReportSchema = z.object({
  asOf: isoDay,
  location: crumb.nullable(),
  crumbs: z.array(crumb.extend({ open: z.boolean() })),
  /** The places directly under `location` (or the top), to narrow the list. */
  children: z.array(crumb),
  rows: z.array(arrearsRowSchema),
  totals: buckets.extend({ units: z.number().int().min(0), bills: z.number().int().min(0), owed: z.string() }),
  /** More units owed than `ARREARS_LIMIT`; the list stops there. */
  truncated: z.boolean(),
});
export type ArrearsReport = z.infer<typeof arrearsReportSchema>;

// ---------------------------------------------------------------------------
// Income and expenditure
// ---------------------------------------------------------------------------

/** `GET /reports/income?year=&fundId=`: a fiscal year (the current one when left out), one fund or all. */
export const incomeQuery = z.object({ year: fiscalYearLabel.optional(), fundId: z.uuid().optional() });
export type IncomeQuery = z.infer<typeof incomeQuery>;

export const incomeReportSchema = z.object({
  year: z.string(),
  start: isoDay,
  end: isoDay,
  /** Years with ledger entries, and the current one. */
  years: z.array(z.string()),
  fundId: z.uuid().nullable(),
  funds: z.array(fundOptionSchema),
  /**
   * Money received in the year (cash basis), by charge type. A part-paid bill's payment
   * settles its lines in their order. `billed` is what bills issued in the year charged
   * (earlier arrears left out), shown beside it.
   */
  income: z.object({
    charges: z.array(z.object({ chargeType: nameRef.extend({ kind: z.enum(CHARGE_KINDS) }), billed: z.string(), collected: z.string() })),
    donations: z.string(),
    billed: z.string(),
    total: z.string(),
  }),
  /** Expenses paid in the year by head, with the head's budget when the caller may see budgets. */
  expenditure: z.object({
    heads: z.array(
      z.object({
        head: nameRef,
        budget: z.string().nullable(),
        spent: z.string(),
        remaining: z.string().nullable(),
        percent: z.number().int().min(0).nullable(),
        over: z.boolean(),
      }),
    ),
    budget: z.string().nullable(),
    total: z.string(),
  }),
  /** Income less expenditure. Transfers and opening balances are neither. */
  surplus: z.string(),
});
export type IncomeReport = z.infer<typeof incomeReportSchema>;
