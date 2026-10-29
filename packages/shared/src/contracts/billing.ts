import { z } from 'zod';
import { compareMoney, moneySchema } from '../money.js';
import { optionalText, pagination, text } from '../schemas.js';
import { cleanText } from '../text.js';
import { CHARGE_KINDS, fundOptionSchema, documentHeaderSchema } from './finance.js';
import { isoDay, partySchema, RENTED_STATUSES, type TenancyStatus } from './members.js';
import { printFormatsSchema } from './print.js';
import type { BillTo } from './property.js';

// ---------------------------------------------------------------------------
// Kinds and statuses
// ---------------------------------------------------------------------------

/**
 * What a bill is. `opening`: dues from before the society used the system, one per unit,
 * kept apart in reports. `membership`: a membership fee billed to a member, with no unit.
 */
export const INVOICE_KINDS = ['regular', 'opening', 'membership'] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];

/** `invoices.status` as stored. Payments (Step 14) move a bill to `partial` and `paid`. */
export const INVOICE_STATUSES = ['unpaid', 'partial', 'paid', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Statuses that still owe money. */
export const OPEN_INVOICE_STATUSES = ['unpaid', 'partial'] as const satisfies readonly InvoiceStatus[];

/** The list filter: a stored status, or `overdue` (open with the due date before today in Dhaka; never stored). */
export const INVOICE_FILTERS = [...INVOICE_STATUSES, 'overdue'] as const;
export type InvoiceFilter = (typeof INVOICE_FILTERS)[number];

const oneOf =
  <T extends readonly string[]>(values: T, fallback: T[number]) =>
  (value: string): T[number] =>
    (values as readonly string[]).includes(value) ? (value as T[number]) : fallback;
export const toInvoiceKind = oneOf(INVOICE_KINDS, 'regular');
export const toInvoiceStatus = oneOf(INVOICE_STATUSES, 'unpaid');

/** Overdue is derived: still owing, and due before `today` (both `YYYY-MM-DD`, Dhaka). */
export const isOverdue = (status: InvoiceStatus, dueDate: string, today: string): boolean =>
  (OPEN_INVOICE_STATUSES as readonly string[]).includes(status) && dueDate < today;

/** The text of an opening-arrears line, stored with the bill like any other line. */
export const OPENING_LINE = { bn: 'আগের বকেয়া', en: 'Earlier arrears' } as const;

/** Most lines one bill may have. */
export const MAX_INVOICE_LINES = 20;

// ---------------------------------------------------------------------------
// Who a bill goes to
// ---------------------------------------------------------------------------

/** Why this payer: they own the unit (or a location above it), rent it, or are the member. */
export const BILL_TO_ROLES = ['owner', 'renter', 'member'] as const;
export type BillToRole = (typeof BILL_TO_ROLES)[number];

/** A person or organisation who can be billed. */
export type Payer = { kind: 'person' | 'organisation'; id: string };

/** A current ownership, for choosing among co-owners. `sharePercent` is a decimal string. */
export type OwnerCandidate = { payer: Payer; sharePercent: string; startDate: string };

export type BillToFacts = {
  /** The unit's `bill_to` setting. */
  billTo: BillTo;
  /** The unit's open tenancy, if any. */
  tenancy: { status: TenancyStatus; payer: Payer | null } | null;
  /** Current owners of the unit first, then of each location above it, nearest first. */
  ownersByLevel: OwnerCandidate[][];
};

/** Larger share first, then the earlier start; ties keep the given order. */
const byShareThenStart = (a: OwnerCandidate, b: OwnerCandidate) =>
  compareMoney(b.sharePercent, a.sharePercent) || (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0);

/**
 * Who a unit's bill goes to:
 * 1. the renter, when the unit bills its renter and has an `active` or `moving_out` tenancy;
 * 2. otherwise the unit's current owners, else those of the nearest location above that has any;
 *    among co-owners the largest share, then the earliest start.
 * Null when nobody is found (the bill can't be made).
 */
export function pickBillTo(facts: BillToFacts): { payer: Payer; role: 'owner' | 'renter' } | null {
  const { tenancy } = facts;
  if (facts.billTo === 'renter' && tenancy?.payer && (RENTED_STATUSES as readonly string[]).includes(tenancy.status)) {
    return { payer: tenancy.payer, role: 'renter' };
  }
  const level = facts.ownersByLevel.find((owners) => owners.length > 0);
  if (!level) return null;
  const [first] = [...level].sort(byShareThenStart);
  return { payer: first!.payer, role: 'owner' };
}

/**
 * Who and where a bill went to, as it was on the day it was made. A reprint years later
 * matches the paper even after the owner changes.
 */
export const billToSnapshotSchema = z.object({
  kind: z.enum(['person', 'organisation']),
  id: z.uuid(),
  name: z.string(),
  nameEn: z.string().nullable(),
  phone: z.string().nullable(),
  role: z.enum(BILL_TO_ROLES),
  memberNo: z.number().int().nullable(),
  /** Older bills were saved before membership IDs and read as null. */
  membershipCode: z.string().nullable().default(null),
  unit: z
    .object({
      id: z.uuid(),
      name: z.string(),
      code: z.string().nullable(),
      /** The names above the unit, top first. */
      address: z.array(z.string()),
    })
    .nullable(),
});
export type BillToSnapshot = z.infer<typeof billToSnapshotSchema>;

// ---------------------------------------------------------------------------
// Reading bills
// ---------------------------------------------------------------------------

const chargeNameSchema = z.object({ nameBn: z.string(), nameEn: z.string().nullable() });

/** One bill in a list. Money is decimal strings. `due` is what is still owed (zero once paid or void). */
export const invoiceRowSchema = z.object({
  id: z.uuid(),
  invoiceNo: z.string(),
  kind: z.enum(INVOICE_KINDS),
  status: z.enum(INVOICE_STATUSES),
  overdue: z.boolean(),
  issueDate: isoDay,
  dueDate: isoDay,
  periodStart: isoDay.nullable(),
  periodEnd: isoDay.nullable(),
  total: z.string(),
  paid: z.string(),
  due: z.string(),
  billTo: billToSnapshotSchema,
  /** The charge types on its lines, each once, in line order. */
  charges: z.array(chargeNameSchema),
});
export type InvoiceRow = z.infer<typeof invoiceRowSchema>;

/** `GET /invoices` query. `q` matches the bill number, unit name or code, or bill-to name, in either digit form. */
export const invoiceListQuery = pagination.extend({
  q: z.string().transform(cleanText).pipe(z.string().max(100)).optional(),
  status: z.enum(INVOICE_FILTERS).optional(),
  kind: z.enum(INVOICE_KINDS).optional(),
  areaId: z.uuid().optional(),
  /** Bills issued in this month, `YYYY-MM`. */
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  unitId: z.uuid().optional(),
  personId: z.uuid().optional(),
  organisationId: z.uuid().optional(),
});
export type InvoiceListQuery = z.infer<typeof invoiceListQuery>;

/**
 * The four figures above the list, within the caller's area and the area, month, unit and
 * payer filters (status, kind and search are ignored). Void bills count nowhere.
 * `earlierArrears` is what is still owed on opening bills, whatever the month.
 */
export const invoiceTotalsSchema = z.object({
  billed: z.string(),
  billedCount: z.number().int().min(0),
  collected: z.string(),
  outstanding: z.string(),
  overdueCount: z.number().int().min(0),
  earlierArrears: z.string(),
  earlierArrearsUnits: z.number().int().min(0),
});
export type InvoiceTotals = z.infer<typeof invoiceTotalsSchema>;

/** `GET /invoices`. */
export const invoiceListSchema = z.object({
  items: z.array(invoiceRowSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totals: invoiceTotalsSchema,
});
export type InvoiceList = z.infer<typeof invoiceListSchema>;

export const invoiceLineSchema = z.object({
  id: z.uuid(),
  chargeType: chargeNameSchema.extend({ id: z.uuid(), kind: z.enum(CHARGE_KINDS) }),
  description: z.string(),
  descriptionEn: z.string().nullable(),
  amount: z.string(),
});
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;

/** `GET /invoices/:id`. */
export const invoiceDetailSchema = invoiceRowSchema.extend({
  fund: fundOptionSchema,
  lines: z.array(invoiceLineSchema),
  createdAt: z.iso.datetime({ offset: true }),
  createdBy: z.string().nullable(),
  void: z
    .object({ reason: z.string(), at: z.iso.datetime({ offset: true }), by: z.string().nullable() })
    .nullable(),
  /** Receipts that paid on it, oldest first; void ones are kept and marked. */
  payments: z.array(
    z.object({ id: z.uuid(), receiptNo: z.string(), receivedDay: isoDay, amount: z.string(), voided: z.boolean() }),
  ),
  /** What a printed bill shows at the top. */
  header: documentHeaderSchema,
  /** The unit's other unpaid and part-paid bills (never this one), for a note on the printed bill. */
  otherDue: z.object({ owed: z.string(), bills: z.number().int().min(0) }),
  /** Which papers the society offers for bills, and the note they print. */
  print: printFormatsSchema.shape.bill,
  /** Whether the caller may void it now (`billing.approve` there, and nothing paid). */
  can: z.object({ void: z.boolean() }),
});
export type InvoiceDetail = z.infer<typeof invoiceDetailSchema>;

// ---------------------------------------------------------------------------
// Making and voiding bills
// ---------------------------------------------------------------------------

/** A month, `YYYY-MM`. */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'invalid_month');
const month = monthSchema;

export const lineInputSchema = z.object({
  chargeTypeId: z.uuid(),
  amount: moneySchema,
  /** Blank uses the charge type's name. */
  description: optionalText(200),
  descriptionEn: optionalText(200),
});

/**
 * `POST /invoices`: a bill for a unit (billed to whoever `pickBillTo` finds) or, with
 * `personId` or `organisationId`, a membership fee for a member (a person or an organisation
 * with an active membership). Exactly one of the three. All lines of a bill must pay into the same fund.
 */
export const invoiceCreateSchema = z
  .object({
    unitId: z.uuid().nullish(),
    personId: z.uuid().nullish(),
    organisationId: z.uuid().nullish(),
    dueDate: isoDay,
    periodFrom: month.nullish(),
    periodTo: month.nullish(),
    lines: z.array(lineInputSchema).min(1).max(MAX_INVOICE_LINES),
  })
  .superRefine((input, ctx) => {
    if (!oneAccount(input)) ctx.addIssue({ code: 'custom', path: ['unitId'], message: 'unit_or_person' });
    refinePeriod(input, ctx);
  });

/** Exactly one of a unit, a person member or an organisation member. */
export const oneAccount = (input: { unitId?: string | null; personId?: string | null; organisationId?: string | null }) =>
  [input.unitId, input.personId, input.organisationId].filter(Boolean).length === 1;

/** A period needs its first month, and the last can't come before it. */
export function refinePeriod(input: { periodFrom?: string | null; periodTo?: string | null }, ctx: z.RefinementCtx): void {
  if (input.periodTo && !input.periodFrom) ctx.addIssue({ code: 'custom', path: ['periodFrom'], message: 'invalid_period' });
  if (input.periodFrom && input.periodTo && input.periodTo < input.periodFrom) {
    ctx.addIssue({ code: 'custom', path: ['periodTo'], message: 'invalid_period' });
  }
}
export type InvoiceCreateInput = z.input<typeof invoiceCreateSchema>;
export type InvoiceCreate = z.output<typeof invoiceCreateSchema>;

/**
 * `POST /invoices/opening`: a unit's dues from before the system, as one bill with one line,
 * dated `asOf` (today or earlier) and due the same day. One per unit (409 `opening_exists`).
 */
export const openingArrearsSchema = z.object({
  unitId: z.uuid(),
  asOf: isoDay,
  chargeTypeId: z.uuid(),
  amount: moneySchema,
  note: optionalText(200),
});
export type OpeningArrearsInput = z.input<typeof openingArrearsSchema>;
export type OpeningArrears = z.output<typeof openingArrearsSchema>;

/** `POST /invoices/:id/void`: only while nothing is paid on it. */
export const invoiceVoidSchema = z.object({ reason: text(300) });
export type InvoiceVoidInput = z.infer<typeof invoiceVoidSchema>;

/** First and last day of the months a bill covers. */
export function periodDays(from: string | null | undefined, to: string | null | undefined): { start: string; end: string } | null {
  if (!from) return null;
  const last = to ?? from;
  const [year, monthNo] = last.split('-').map(Number) as [number, number];
  const end = new Date(Date.UTC(year, monthNo, 0)).toISOString().slice(0, 10);
  return { start: `${from}-01`, end };
}

// ---------------------------------------------------------------------------
// Finding what to bill
// ---------------------------------------------------------------------------

/** `GET /billing/lookup?q=`: units and members to bill, within the caller's billing area. `personId` or `organisationId` finds one member. */
export const billingLookupQuery = z.object({
  q: z.string().transform(cleanText).pipe(z.string().max(100)).optional(),
  unitId: z.uuid().optional(),
  personId: z.uuid().optional(),
  organisationId: z.uuid().optional(),
});
export type BillingLookupQuery = z.infer<typeof billingLookupQuery>;

export const billingLookupSchema = z.object({
  units: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      code: z.string().nullable(),
      address: z.array(z.string()),
      isActive: z.boolean(),
      /** Who a bill would go to now; null when nobody is found. */
      billTo: partySchema.extend({ role: z.enum(['owner', 'renter']) }).nullable(),
      /** An opening-arrears bill already exists (not void). */
      hasOpening: z.boolean(),
    }),
  ),
  /** People and organisations with an active membership; only for a society-wide billing role. */
  members: z.array(partySchema.extend({ memberNo: z.number().int().nullable(), membershipCode: z.string().nullable() })),
});
export type BillingLookup = z.infer<typeof billingLookupSchema>;
