import { z } from 'zod';
import { moneySchema } from '../money.js';
import { optionalText, pagination, text } from '../schemas.js';
import { cleanText } from '../text.js';
import { documentHeaderSchema, fundOptionSchema } from './finance.js';
import { isoDay, optionalPhone } from './members.js';
import { paymentDetailSchema, payerSnapshotSchema } from './payments.js';

// ---------------------------------------------------------------------------
// Recording a donation
// ---------------------------------------------------------------------------

/** Longest purpose text. Purposes are free text until development projects get their own table. */
export const DONATION_PURPOSE_MAX = 200;

/** A purpose with its inner spaces collapsed, so the same words always group together. */
const purposeText = (value: string) => cleanText(value).replace(/\s+/g, ' ');

/**
 * Who gave: a person or organisation already on record, a new person (found by phone first,
 * else added), or nobody named.
 */
export const donorInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('person'), id: z.uuid() }),
  z.object({ kind: z.literal('organisation'), id: z.uuid() }),
  z.object({ kind: z.literal('new'), fullName: text(200), fullNameEn: optionalText(200), phone: optionalPhone }),
  z.object({ kind: z.literal('anonymous') }),
]);
export type DonorInput = z.infer<typeof donorInputSchema>;

/** `POST /donations`. Without `fundId` the default fund takes it. */
export const donationCreateSchema = z.object({
  donor: donorInputSchema,
  fundId: z.uuid().nullish(),
  purpose: z
    .string()
    .nullish()
    .transform((value) => (value == null ? null : purposeText(value) || null))
    .pipe(z.string().max(DONATION_PURPOSE_MAX).nullable()),
  amount: moneySchema,
  note: optionalText(300),
});
export type DonationCreateInput = z.input<typeof donationCreateSchema>;
export type DonationCreate = z.output<typeof donationCreateSchema>;

/** `GET /donations/donors?q=`: people and organisations on record, by name or phone. */
export const donorLookupQuery = z.object({ q: z.string().transform(cleanText).pipe(z.string().min(2).max(100)) });
export type DonorLookupQuery = z.infer<typeof donorLookupQuery>;

export const donorOptionSchema = z.object({
  kind: z.enum(['person', 'organisation']),
  id: z.uuid(),
  name: z.string(),
  nameEn: z.string().nullable(),
  phone: z.string().nullable(),
});
export type DonorOption = z.infer<typeof donorOptionSchema>;

export const donorLookupSchema = z.object({ donors: z.array(donorOptionSchema) });
export type DonorLookup = z.infer<typeof donorLookupSchema>;

/** `GET /donations/options`: what the form offers. `funds` is only the default one while separate funds are off. */
export const donationOptionsSchema = z.object({
  funds: z.array(fundOptionSchema),
  separateFunds: z.boolean(),
  /** Purposes used before, most used first, for suggestions. */
  purposes: z.array(z.string()),
  header: documentHeaderSchema,
});
export type DonationOptions = z.infer<typeof donationOptionsSchema>;

// ---------------------------------------------------------------------------
// Reading donations
// ---------------------------------------------------------------------------

const fundRef = z.object({ id: z.uuid(), nameBn: z.string(), nameEn: z.string().nullable() });

export const donationRowSchema = z.object({
  id: z.uuid(),
  paymentId: z.uuid(),
  receiptNo: z.string(),
  receivedAt: z.iso.datetime({ offset: true }),
  /** The Dhaka date it was received. */
  receivedDay: isoDay,
  amount: z.string(),
  /** The donor as on the day; null when anonymous. */
  donor: payerSnapshotSchema.nullable(),
  fund: fundRef,
  purpose: z.string().nullable(),
  collectedBy: z.object({ id: z.uuid(), name: z.string() }),
  voided: z.boolean(),
});
export type DonationRow = z.infer<typeof donationRowSchema>;

/** `GET /donations`. Dates are Dhaka days, both ends included. `purpose` matches exactly; `q` searches. */
export const donationListQuery = pagination.extend({
  q: z.string().transform(cleanText).pipe(z.string().max(100)).optional(),
  from: isoDay.optional(),
  to: isoDay.optional(),
  fundId: z.uuid().optional(),
  purpose: z.string().transform(purposeText).pipe(z.string().min(1).max(DONATION_PURPOSE_MAX)).optional(),
  personId: z.uuid().optional(),
  organisationId: z.uuid().optional(),
  status: z.enum(['valid', 'void']).optional(),
});
export type DonationListQuery = z.infer<typeof donationListQuery>;

const figure = z.object({ count: z.number().int().min(0), amount: z.string() });

/** What the filtered donations add up to. Void ones count only in `voidCount`. */
export const donationTotalsSchema = figure.extend({
  voidCount: z.number().int().min(0),
  /** Named donors (persons and organisations), each once. */
  donors: z.number().int().min(0),
  byFund: z.array(figure.extend({ fund: fundRef })),
  /** `purpose` null groups the donations given without one. */
  byPurpose: z.array(figure.extend({ purpose: z.string().nullable() })),
});
export type DonationTotals = z.infer<typeof donationTotalsSchema>;

/** The stat cards, unfiltered: this month and this fiscal year, valid donations only. */
export const donationSummarySchema = z.object({
  month: figure,
  fiscalYear: figure.extend({ label: z.string(), donors: z.number().int().min(0) }),
});
export type DonationSummary = z.infer<typeof donationSummarySchema>;

export const donationListSchema = z.object({
  items: z.array(donationRowSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totals: donationTotalsSchema,
  summary: donationSummarySchema,
  /**
   * The caller's own cash, every receipt they took (bills and donations): not yet handed over,
   * and handed over but not confirmed. A clerk who takes only donations closes the day here.
   */
  cash: z.object({ inHand: figure, pending: figure }),
});
export type DonationList = z.infer<typeof donationListSchema>;

/** `GET /donations/:id`: the donation with its receipt, ready to print. */
export const donationDetailSchema = donationRowSchema.extend({
  receipt: paymentDetailSchema,
  can: z.object({ void: z.boolean() }),
});
export type DonationDetail = z.infer<typeof donationDetailSchema>;
