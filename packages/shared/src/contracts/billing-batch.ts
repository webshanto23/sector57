import { z } from 'zod';
import { isoDay, partySchema } from './members.js';
import { fundOptionSchema } from './finance.js';
import { invoiceDetailSchema, lineInputSchema, MAX_INVOICE_LINES, monthSchema, refinePeriod } from './billing.js';

// ---------------------------------------------------------------------------
// Billing several units at once (Step 27)
// ---------------------------------------------------------------------------

/** Most units one batch may bill. */
export const MAX_BATCH_UNITS = 50;

/** Most bills one print job may hold. */
export const MAX_PRINT_BILLS = 50;

/**
 * `POST /invoices/batch/check` and `POST /invoices/batch`: bills for several units, each with
 * lines of its own, sharing the due date and period. A unit whose lines pay into more than one
 * fund gets one bill per fund. Every unit once.
 */
export const invoiceBatchSchema = z
  .object({
    dueDate: isoDay,
    periodFrom: monthSchema.nullish(),
    periodTo: monthSchema.nullish(),
    units: z
      .array(z.object({ unitId: z.uuid(), lines: z.array(lineInputSchema).min(1).max(MAX_INVOICE_LINES) }))
      .min(1)
      .max(MAX_BATCH_UNITS),
  })
  .superRefine((input, ctx) => {
    refinePeriod(input, ctx);
    const seen = new Set<string>();
    input.units.forEach((unit, index) => {
      if (seen.has(unit.unitId)) ctx.addIssue({ code: 'custom', path: ['units', index, 'unitId'], message: 'duplicate_unit' });
      seen.add(unit.unitId);
    });
  });
export type InvoiceBatchInput = z.input<typeof invoiceBatchSchema>;
export type InvoiceBatch = z.output<typeof invoiceBatchSchema>;

/** Why a unit can't be billed now. */
export const BATCH_PROBLEMS = ['unit_inactive', 'no_bill_to'] as const;
export type BatchProblem = (typeof BATCH_PROBLEMS)[number];

/** An earlier bill (not void) of the unit with one of the same charges for an overlapping month. Shown, never blocking. */
export const batchWarningSchema = z.object({
  invoiceId: z.uuid(),
  invoiceNo: z.string(),
  charges: z.array(z.object({ nameBn: z.string(), nameEn: z.string().nullable() })),
});
export type BatchWarning = z.infer<typeof batchWarningSchema>;

/** `POST /invoices/batch/check`: what the batch would make, unit by unit, in the order given. */
export const invoiceBatchCheckSchema = z.object({
  units: z.array(
    z.object({
      unitId: z.uuid(),
      name: z.string(),
      code: z.string().nullable(),
      address: z.array(z.string()),
      billTo: partySchema.extend({ role: z.enum(['owner', 'renter']) }).nullable(),
      /** One bill per fund, in the order the lines first name it. */
      bills: z.array(z.object({ fund: fundOptionSchema, lineCount: z.number().int().min(1), total: z.string() })),
      total: z.string(),
      warnings: z.array(batchWarningSchema),
      problem: z.enum(BATCH_PROBLEMS).nullable(),
    }),
  ),
  billCount: z.number().int().min(0),
  total: z.string(),
});
export type InvoiceBatchCheck = z.infer<typeof invoiceBatchCheckSchema>;

/** `POST /invoices/batch`: the bills made, in the order of the units and then of their funds. */
export const invoiceBatchResultSchema = z.object({
  invoices: z.array(z.object({ id: z.uuid(), invoiceNo: z.string(), unitId: z.uuid() })),
});
export type InvoiceBatchResult = z.infer<typeof invoiceBatchResultSchema>;

/** `GET /invoices/print?ids=a,b,c`: bills to print together, in the order asked. */
export const invoicePrintQuery = z.object({
  ids: z
    .string()
    .transform((value) => [...new Set(value.split(',').map((id) => id.trim()).filter(Boolean))])
    .pipe(z.array(z.uuid()).min(1).max(MAX_PRINT_BILLS)),
});
export type InvoicePrintQuery = z.infer<typeof invoicePrintQuery>;

export const invoicePrintSchema = z.object({ items: z.array(invoiceDetailSchema) });
export type InvoicePrint = z.infer<typeof invoicePrintSchema>;

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** Groups a unit's lines into one bill per fund, funds in the order the lines first name them. */
export function splitByFund<T extends { chargeTypeId: string }>(lines: T[], fundOf: (chargeTypeId: string) => string): { fundId: string; lines: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const line of lines) {
    const fundId = fundOf(line.chargeTypeId);
    groups.set(fundId, [...(groups.get(fundId) ?? []), line]);
  }
  return [...groups].map(([fundId, grouped]) => ({ fundId, lines: grouped }));
}

/** The days a bill covers: its period, or else the month it was issued in. All `YYYY-MM-DD`. */
export function billSpan(periodStart: string | null, periodEnd: string | null, issueDate: string): { start: string; end: string } {
  if (periodStart && periodEnd) return { start: periodStart, end: periodEnd };
  const [year, month] = issueDate.split('-').map(Number) as [number, number];
  return { start: `${issueDate.slice(0, 7)}-01`, end: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) };
}

/** An earlier bill of a unit, as the duplicate check reads it. */
export type EarlierBill = { id: string; invoiceNo: string; span: { start: string; end: string }; chargeTypeIds: string[] };

/**
 * Earlier bills that look like the one about to be made: at least one of the same charge
 * types, and their spans overlap. Each bill once, with the shared charge types in its line order.
 */
export function duplicateBills(
  chargeTypeIds: string[],
  span: { start: string; end: string },
  earlier: EarlierBill[],
): { invoiceId: string; invoiceNo: string; chargeTypeIds: string[] }[] {
  const wanted = new Set(chargeTypeIds);
  return earlier.flatMap((bill) => {
    if (bill.span.start > span.end || bill.span.end < span.start) return [];
    const shared = [...new Set(bill.chargeTypeIds.filter((id) => wanted.has(id)))];
    return shared.length ? [{ invoiceId: bill.id, invoiceNo: bill.invoiceNo, chargeTypeIds: shared }] : [];
  });
}

// ---------------------------------------------------------------------------
// Choosing units from a list
// ---------------------------------------------------------------------------

/** Most units the picker lists at once. */
export const MAX_BILLABLE_UNITS = 2000;

/**
 * `GET /billing/units`: every unit the caller may bill, with who a bill would go to now,
 * sorted by address and then name. `truncated` when there were more than `MAX_BILLABLE_UNITS`.
 */
export const billableUnitsSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      code: z.string().nullable(),
      address: z.array(z.string()),
      isActive: z.boolean(),
      billTo: partySchema.extend({ role: z.enum(['owner', 'renter']) }).nullable(),
    }),
  ),
  truncated: z.boolean(),
});
export type BillableUnits = z.infer<typeof billableUnitsSchema>;
