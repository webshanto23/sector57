import { z } from 'zod';
import { toPaisa } from '../money.js';
import { FORM_KEYS } from './forms.js';
import { TICKET_PRIORITIES, TICKET_STATUSES } from './helpdesk.js';
import { isoDay } from './members.js';
import { addMonths, monthOfDay } from './schedules.js';

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const userRef = z.object({ id: z.uuid(), name: z.string() });

/** Months in the overview's billed against collected chart, this month included. */
export const OVERVIEW_MONTHS = 6;
/** Items listed per kind in "Needs approval"; the count covers all of them. */
export const OVERVIEW_ITEMS = 3;
/** Collection by area marks an area below this percent. */
export const OVERVIEW_LOW_PERCENT = 80;

/** The `n` months up to and including the month of `day`, oldest first (`YYYY-MM`). */
export function lastMonths(day: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => monthOfDay(addMonths(day, i - n + 1)));
}

/** The unit a chart's axis counts in: taka, thousand taka or lakh taka. */
export type ChartUnit = 'taka' | 'thousand' | 'lakh';
const UNIT_TAKA: Record<ChartUnit, number> = { taka: 1, thousand: 1_000, lakh: 1_00_000 };

/**
 * A money chart's axis for these amounts: the unit, a round step and the top (three steps,
 * at least the largest amount). For drawing only: amounts become plain numbers here.
 */
export function chartScale(amounts: readonly string[]): { unit: ChartUnit; step: number; top: number; toUnits: (amount: string) => number } {
  const maxPaisa = amounts.reduce((max, amount) => (toPaisa(amount) > max ? toPaisa(amount) : max), 0n);
  const unit: ChartUnit = maxPaisa >= 1_00_000_00n ? 'lakh' : maxPaisa >= 1_000_00n ? 'thousand' : 'taka';
  const toUnits = (amount: string) => Number(toPaisa(amount)) / 100 / UNIT_TAKA[unit];
  const wanted = Number(maxPaisa) / 100 / UNIT_TAKA[unit] / 3;
  let step = 1;
  if (wanted > 0) {
    const power = 10 ** Math.floor(Math.log10(wanted));
    step = ([1, 2, 2.5, 5, 10].map((m) => m * power).find((candidate) => candidate >= wanted - 1e-9) ?? 10 * power);
  }
  return { unit, step, top: step * 3, toUnits };
}

const approvalList = <T extends z.ZodType>(item: T) => z.object({ count: z.number().int().min(0), items: z.array(item) });

/**
 * `GET /overview`: the dashboard's first page. Every block is null when the caller lacks the
 * grant it needs, and each sum counts only rows in the caller's area for that grant. Months
 * are Dhaka calendar months; "collected" is bill receipts (never donations), not voided.
 * The API keeps a result for a short while (30 s by default), so figures can lag a little.
 */
export const overviewSchema = z.object({
  asOf: isoDay,
  month,
  /** `payments.view`: receipts this month; `billed` and `percent` also need `billing.view`. */
  collected: z
    .object({
      amount: z.string(),
      billed: z.string().nullable(),
      percent: z.number().int().min(0).nullable(),
    })
    .nullable(),
  /** `billing.view`: what is still owed on units' bills past their due date (as the arrears report). */
  arrears: z.object({ owed: z.string(), units: z.number().int().min(0), bills: z.number().int().min(0) }).nullable(),
  /** `units.view`: active units by derived occupancy. */
  occupancy: z
    .object({ units: z.number().int().min(0), occupied: z.number().int().min(0), vacant: z.number().int().min(0) })
    .nullable(),
  /** `forms.view`: applications still open (new or in review). */
  forms: z.object({ open: z.number().int().min(0) }).nullable(),
  /**
   * `billing.view` or `payments.view`: per month, billed (bills issued, not void, no opening
   * arrears) and collected; a series is null without its grant.
   */
  months: z
    .array(z.object({ month, billed: z.string().nullable(), collected: z.string().nullable() }))
    .nullable(),
  /**
   * `billing.view`: this month's bills per area, as the collection report, under the deepest
   * place that holds all the caller's areas. Areas with no bills this month are left out.
   */
  areas: z
    .object({
      parent: z.object({ id: z.uuid(), name: z.string() }).nullable(),
      items: z.array(
        z.object({
          id: z.uuid(),
          name: z.string(),
          billed: z.string(),
          collected: z.string(),
          percent: z.number().int().min(0),
        }),
      ),
    })
    .nullable(),
  /**
   * `helpdesk.view`: tickets still waiting in the caller's area, how many are past their due
   * time, and the `OVERVIEW_ITEMS` due soonest (the most overdue first).
   */
  helpdesk: z
    .object({
      active: z.number().int().min(0),
      overdue: z.number().int().min(0),
      items: z.array(
        z.object({
          id: z.uuid(),
          ticketNo: z.string(),
          title: z.string(),
          priority: z.enum(TICKET_PRIORITIES),
          status: z.enum(TICKET_STATUSES),
          dueAt: z.iso.datetime({ offset: true }),
          overdue: z.boolean(),
        }),
      ),
    })
    .nullable(),
  /** What waits for the caller's decision; null when they may decide on none of these. */
  approvals: z
    .object({
      /** `expenses.approve`: pending requests by others. */
      expenses: approvalList(
        z.object({ id: z.uuid(), description: z.string(), amount: z.string(), requestedBy: userRef.nullable(), at: z.iso.datetime({ offset: true }) }),
      ).nullable(),
      /** `payments.approve`: handovers by others not yet confirmed, within the caller's area. */
      handovers: approvalList(
        z.object({ id: z.uuid(), collector: userRef, amount: z.string(), payments: z.number().int().min(0), at: z.iso.datetime({ offset: true }) }),
      ).nullable(),
      /** `forms.approve`: open applications in the caller's area. */
      forms: approvalList(
        z.object({ id: z.uuid(), reference: z.string(), formKey: z.enum(FORM_KEYS), place: z.string().nullable(), at: z.iso.datetime({ offset: true }) }),
      ).nullable(),
      /** Payroll runs waiting for the caller: drafts someone else prepared (`payroll.approve`), approved runs to pay (`payroll.edit` and `expenses.create`). */
      payroll: approvalList(z.object({ id: z.uuid(), month: z.string(), status: z.enum(['draft', 'approved']), net: z.string() })).nullable(),
    })
    .nullable(),
});
export type Overview = z.infer<typeof overviewSchema>;
