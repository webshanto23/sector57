import { z } from 'zod';
import { moneySchema } from '../money.js';
import { optionalText, pagination, text } from '../schemas.js';
import { CHARGE_KINDS, fundOptionSchema } from './finance.js';
import { isoDay } from './members.js';
import { UNIT_TYPES } from './property.js';

// ---------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------

/** How often a schedule bills, in months; `null` is once only. */
export const SCHEDULE_FREQUENCIES = [1, 3, 6, 12] as const;
export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number];

/** `auto`: the nightly job bills it when due. `manual`: only a run started from the dashboard does. */
export const SCHEDULE_GENERATIONS = ['auto', 'manual'] as const;
export type ScheduleGeneration = (typeof SCHEDULE_GENERATIONS)[number];

export const SCHEDULE_STATUSES = ['active', 'paused', 'ended'] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

/** Why a unit got no line in a run. Labels live in i18n (`Recurring.skip.*`). */
export const SKIP_REASONS = ['no_bill_to', 'inactive', 'already_billed'] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

/** Why a whole schedule can't bill this run (it stays due). */
export const SCHEDULE_BLOCKS = ['charge_type_archived', 'fund_closed'] as const;
export type ScheduleBlock = (typeof SCHEDULE_BLOCKS)[number];

export const BILLING_RUN_TRIGGERS = ['manual', 'auto'] as const;
export type BillingRunTrigger = (typeof BILLING_RUN_TRIGGERS)[number];

export const BILLING_RUN_STATUSES = ['done', 'failed'] as const;
export type BillingRunStatus = (typeof BILLING_RUN_STATUSES)[number];

/** Most area rates one schedule may have. */
export const MAX_SCHEDULE_RATES = 300;

// ---------------------------------------------------------------------------
// Months and periods (pure; dates are `YYYY-MM-DD`, months `YYYY-MM`)
// ---------------------------------------------------------------------------

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** `2026-10` → `2026-10-01`. */
export const monthStart = (month: string): string => `${month}-01`;

/** `2026-10-17` → `2026-10`. */
export const monthOfDay = (day: string): string => day.slice(0, 7);

/** The first day of the month `n` months after the month of `day`. */
export function addMonths(day: string, n: number): string {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7)) - 1 + n;
  const date = new Date(Date.UTC(year, month, 1));
  return date.toISOString().slice(0, 10);
}

/** The last day of a period of `months` months starting on `start` (a first of the month). */
export function periodEndOf(start: string, months: number): string {
  const next = addMonths(start, months);
  const date = new Date(`${next}T00:00:00Z`);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

/** The months a schedule's period covers: its frequency, or one month when it bills once. */
export const periodMonths = (frequencyMonths: number | null): number => frequencyMonths ?? 1;

export type ScheduleTiming = {
  /** First day of the next period to bill; null once ended. */
  nextRunOn: string | null;
  frequencyMonths: number | null;
  /** Last day of the last month to bill, or null for no end. */
  endsOn: string | null;
};

/**
 * The periods (first days) a schedule should bill in a run for `upTo` (a first of the month):
 * every one from `nextRunOn` up to and including `upTo`, oldest first, so missed months are
 * caught up. A one-off schedule bills one period. None after `endsOn`.
 */
export function duePeriods(timing: ScheduleTiming, upTo: string): string[] {
  const periods: string[] = [];
  let period = timing.nextRunOn;
  while (period !== null && period <= upTo && (timing.endsOn === null || period <= timing.endsOn)) {
    periods.push(period);
    if (timing.frequencyMonths === null) break;
    period = addMonths(period, timing.frequencyMonths);
  }
  return periods;
}

/** Where a schedule stands after billing `periods`: its next period, or null when nothing is left. */
export function nextRunAfter(timing: ScheduleTiming, periods: string[]): string | null {
  const last = periods.at(-1);
  if (last === undefined) return timing.nextRunOn;
  if (timing.frequencyMonths === null) return null;
  const next = addMonths(last, timing.frequencyMonths);
  return timing.endsOn !== null && next > timing.endsOn ? null : next;
}

/**
 * Where a paused schedule picks up again: the months of the pause are not billed. The next
 * period on the schedule's rhythm (from its start) that begins this month or later.
 */
export function resumeFrom(timing: ScheduleTiming & { startsOn: string }, thisMonth: string): string | null {
  let period = timing.nextRunOn ?? timing.startsOn;
  const step = timing.frequencyMonths;
  if (period < thisMonth) {
    if (step === null) return thisMonth;
    while (period < thisMonth) period = addMonths(period, step);
  }
  return timing.endsOn !== null && period > timing.endsOn ? null : period;
}

/**
 * A unit's rate: the nearest location on its path (the unit itself first, then upwards)
 * that has one, else the schedule's own amount. `path` is the location ids top first.
 */
export function rateFor(path: readonly string[], rates: ReadonlyMap<string, string>, amount: string): { amount: string; from: string | null } {
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const rate = rates.get(path[i]!);
    if (rate !== undefined) return { amount: rate, from: path[i]! };
  }
  return { amount, from: null };
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

const month = z.string().regex(MONTH, 'invalid_month');
const placeRef = z.object({ id: z.uuid(), name: z.string(), address: z.array(z.string()) });

export const scheduleSchema = z.object({
  id: z.uuid(),
  nameBn: z.string(),
  nameEn: z.string().nullable(),
  chargeType: z.object({ id: z.uuid(), nameBn: z.string(), nameEn: z.string().nullable(), kind: z.enum(CHARGE_KINDS), archived: z.boolean() }),
  fund: fundOptionSchema,
  amount: z.string(),
  rates: z.array(z.object({ location: placeRef, amount: z.string() })),
  frequencyMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).nullable(),
  generation: z.enum(SCHEDULE_GENERATIONS),
  scope: placeRef.nullable(),
  /** Empty: every unit type. */
  unitTypes: z.array(z.enum(UNIT_TYPES)),
  startMonth: month,
  endMonth: month.nullable(),
  nextRunOn: isoDay.nullable(),
  dueDays: z.number().int(),
  status: z.enum(SCHEDULE_STATUSES),
  /** It has made bills, so its charge type, frequency and start are fixed. */
  billed: z.boolean(),
});
export type Schedule = z.infer<typeof scheduleSchema>;

/** `GET /schedules`. `canEdit`: the caller holds billing.edit society-wide. */
export const scheduleListSchema = z.object({ items: z.array(scheduleSchema), canEdit: z.boolean() });
export type ScheduleList = z.infer<typeof scheduleListSchema>;

/**
 * `POST /schedules`, `PUT /schedules/:id`. `amount` is per bill (one period), for every unit
 * without an area rate. `rates` are per location, nearest wins. Months are whole months.
 */
export const scheduleInputSchema = z
  .object({
    nameBn: text(150),
    nameEn: optionalText(150),
    chargeTypeId: z.uuid(),
    amount: moneySchema,
    rates: z.array(z.object({ locationId: z.uuid(), amount: moneySchema })).max(MAX_SCHEDULE_RATES),
    frequencyMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).nullable(),
    generation: z.enum(SCHEDULE_GENERATIONS),
    scopeLocationId: z.uuid().nullable(),
    unitTypes: z.array(z.enum(UNIT_TYPES)).max(UNIT_TYPES.length),
    startMonth: month,
    endMonth: month.nullable(),
    dueDays: z.number().int().min(0).max(365),
  })
  .superRefine((input, ctx) => {
    if (input.endMonth !== null && input.endMonth < input.startMonth) {
      ctx.addIssue({ code: 'custom', path: ['endMonth'], message: 'invalid_period' });
    }
    const seen = new Set<string>();
    input.rates.forEach((rate, index) => {
      if (seen.has(rate.locationId)) ctx.addIssue({ code: 'custom', path: ['rates', index, 'locationId'], message: 'duplicate_rate' });
      seen.add(rate.locationId);
    });
  });
export type ScheduleInputValues = z.input<typeof scheduleInputSchema>;
export type ScheduleInput = z.output<typeof scheduleInputSchema>;

// ---------------------------------------------------------------------------
// Billing runs
// ---------------------------------------------------------------------------

/** `GET /billing-runs/preview?month=`, `POST /billing-runs`. Only this month or earlier. */
export const billingRunInputSchema = z.object({ month });
export type BillingRunInput = z.infer<typeof billingRunInputSchema>;

/** A unit left out of a run, and why. */
export const skippedUnitSchema = z.object({
  unitId: z.uuid(),
  name: z.string(),
  address: z.array(z.string()),
  reason: z.enum(SKIP_REASONS),
  scheduleId: z.uuid(),
});
export type SkippedUnit = z.infer<typeof skippedUnitSchema>;

/** One line a run would make. `rateFrom` is the location whose rate applied, null for the schedule's amount. */
export const previewLineSchema = z.object({
  unitId: z.uuid(),
  unitName: z.string(),
  address: z.array(z.string()),
  billTo: z.string(),
  scheduleId: z.uuid(),
  periodStart: isoDay,
  periodEnd: isoDay,
  amount: z.string(),
  rateFrom: z.string().nullable(),
});
export type PreviewLine = z.infer<typeof previewLineSchema>;

/** Most lines and skipped units the preview lists (the counts cover all). */
export const PREVIEW_LIMIT = 500;

/** `GET /billing-runs/preview`: what confirming would make. Nothing is written. */
export const billingRunPreviewSchema = z.object({
  month,
  invoiceCount: z.number().int().min(0),
  lineCount: z.number().int().min(0),
  total: z.string(),
  schedules: z.array(
    z.object({
      id: z.uuid(),
      nameBn: z.string(),
      nameEn: z.string().nullable(),
      periods: z.array(isoDay),
      lines: z.number().int().min(0),
      total: z.string(),
      /** Set when the schedule can't bill this run; it stays due. */
      blocked: z.enum(SCHEDULE_BLOCKS).nullable(),
    }),
  ),
  lines: z.array(previewLineSchema),
  skipped: z.array(skippedUnitSchema),
  skippedCounts: z.object({ no_bill_to: z.number().int(), inactive: z.number().int(), already_billed: z.number().int() }),
});
export type BillingRunPreview = z.infer<typeof billingRunPreviewSchema>;

export const billingRunSchema = z.object({
  id: z.uuid(),
  month,
  trigger: z.enum(BILLING_RUN_TRIGGERS),
  status: z.enum(BILLING_RUN_STATUSES),
  startedBy: z.string().nullable(),
  startedAt: z.iso.datetime({ offset: true }),
  finishedAt: z.iso.datetime({ offset: true }).nullable(),
  invoiceCount: z.number().int().min(0),
  total: z.string(),
  skipped: z.array(skippedUnitSchema),
  error: z.string().nullable(),
});
export type BillingRun = z.infer<typeof billingRunSchema>;

export const billingRunListQuery = pagination;
export const billingRunListSchema = z.object({
  items: z.array(billingRunSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});
export type BillingRunList = z.infer<typeof billingRunListSchema>;
