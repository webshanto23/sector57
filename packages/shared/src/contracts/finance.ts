import { z } from 'zod';
import { moneyOrZeroSchema, optionalMoneySchema } from '../money.js';
import { optionalText, text } from '../schemas.js';
import { isoDay } from './members.js';
import { brandingSchema } from './society.js';

// ---------------------------------------------------------------------------
// Society settings
// ---------------------------------------------------------------------------

/**
 * The `society_settings` keys the API knows, by their contract name. Anything else is
 * refused. `fiscalYearStartMonth` is not here: it is the `societies` column.
 */
export const SETTING_KEYS = {
  shareRentersWithThana: 'share_renters_with_thana',
  separateFacilityFunds: 'separate_facility_funds',
  receiptHeader: 'receipt_header',
  /** Logo badge and place line (`brandingSchema`); the name itself is the `societies` row. */
  branding: 'branding',
} as const;
export type SettingKey = keyof typeof SETTING_KEYS;

/** What a receipt prints at the top. Starts from the society's name until the office changes it. */
export const receiptHeaderSchema = z.object({
  nameBn: z.string(),
  nameEn: z.string().nullable(),
  addressBn: z.string().nullable(),
  addressEn: z.string().nullable(),
  phone: z.string().nullable(),
});
export type ReceiptHeader = z.infer<typeof receiptHeaderSchema>;

/** A receipt or printed bill's header as the API sends it: the saved header plus the logo badge. */
export const documentHeaderSchema = receiptHeaderSchema.extend({ mark: z.string() });
export type DocumentHeader = z.infer<typeof documentHeaderSchema>;

export const receiptHeaderInputSchema = z.object({
  nameBn: text(150),
  nameEn: optionalText(150),
  addressBn: optionalText(300),
  addressEn: optionalText(300),
  phone: optionalText(60),
});

/** The society's name (`societies`) and branding, as the website header shows them. */
export const societyProfileSchema = z.object({ nameBn: z.string(), nameEn: z.string().nullable() }).extend(brandingSchema.shape);
export type SocietyProfile = z.infer<typeof societyProfileSchema>;

/** The badge holds at most three characters: it is a 22 px circle. */
export const LOGO_MARK_MAX = 3;

export const societyProfileInputSchema = z.object({
  nameBn: text(150),
  nameEn: optionalText(150),
  mark: text(LOGO_MARK_MAX),
  placeBn: optionalText(80),
  placeEn: optionalText(80),
});

/** `GET /settings`. */
export const societySettingsSchema = z.object({
  shareRentersWithThana: z.boolean(),
  separateFacilityFunds: z.boolean(),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  /** True once the ledger has any entry: moving the year then would split vouchers and reports. */
  fiscalYearLocked: z.boolean(),
  receiptHeader: receiptHeaderSchema,
  profile: societyProfileSchema,
});
export type SocietySettings = z.infer<typeof societySettingsSchema>;

/** `PATCH /settings`: only the keys being changed. Unknown keys are refused. */
export const settingsInputSchema = z
  .object({
    shareRentersWithThana: z.boolean(),
    separateFacilityFunds: z.boolean(),
    fiscalYearStartMonth: z.number().int().min(1).max(12),
    receiptHeader: receiptHeaderInputSchema,
    profile: societyProfileInputSchema,
  })
  .partial()
  .strict();
export type SettingsInput = z.infer<typeof settingsInputSchema>;

// ---------------------------------------------------------------------------
// Funds and the ledger
// ---------------------------------------------------------------------------

/** Where money in a fund sits: the office cash box or the society's bank account. */
export const LEDGER_ACCOUNTS = ['cash', 'bank'] as const;
export type LedgerAccount = (typeof LEDGER_ACCOUNTS)[number];

/**
 * How money changed hands: cash, a bank deposit or transfer, a cheque, or a mobile wallet
 * (bKash, Nagad, ...). Recorded only; no gateway is involved.
 */
export const PAYMENT_METHODS = ['cash', 'bank', 'cheque', 'mobile'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

/** Longest reference: a cheque number, or the wallet and its transaction ID. */
export const PAYMENT_REF_MAX = 100;
export const paymentRefSchema = optionalText(PAYMENT_REF_MAX);

/** A cheque or a mobile wallet payment must say which one; a bank deposit may. */
export const methodNeedsRef = (method: PaymentMethod): boolean => method === 'cheque' || method === 'mobile';

/** Only cash sits in the cash box; every other method lands in the bank account. */
export const accountOfMethod = (method: PaymentMethod): LedgerAccount => (method === 'cash' ? 'cash' : 'bank');

/** For a schema's `superRefine`: `method_ref_required` on `methodRef` when it is missing. */
export function refineMethodRef(input: { method: PaymentMethod; methodRef: string | null }, ctx: z.RefinementCtx): void {
  if (methodNeedsRef(input.method) && !input.methodRef) ctx.addIssue({ code: 'custom', path: ['methodRef'], message: 'method_ref_required' });
}

/** What is stored: the method, the account it lands in, and the reference (never one for cash). */
export const storedMethod = (input: { method: PaymentMethod; methodRef: string | null }) => ({
  method: input.method,
  ref: input.method === 'cash' ? null : input.methodRef,
  account: accountOfMethod(input.method),
});
export type StoredMethod = ReturnType<typeof storedMethod>;

/** `ledger_entries.source_type`. */
export const LEDGER_SOURCES = ['opening', 'payment', 'donation', 'expense', 'transfer', 'adjustment'] as const;
export type LedgerSource = (typeof LEDGER_SOURCES)[number];

const amounts = z.object({ cash: z.string(), bank: z.string(), total: z.string() });

export const fundSchema = z.object({
  id: z.uuid(),
  nameBn: z.string(),
  nameEn: z.string().nullable(),
  isDefault: z.boolean(),
  closedAt: z.string().nullable(),
  /** Decimal strings, from the ledger. */
  balance: amounts,
  /** The balance the fund started with, null until entered. */
  opening: z.object({ date: z.string(), cash: z.string(), bank: z.string() }).nullable(),
  /** The opening can be corrected only until the fund has any other entry. */
  openingEditable: z.boolean(),
});
export type Fund = z.infer<typeof fundSchema>;

/** `GET /funds`. With separate funds off, only the default fund exists for new bills. */
export const fundListSchema = z.object({ items: z.array(fundSchema), separateFunds: z.boolean() });
export type FundList = z.infer<typeof fundListSchema>;

/** `POST /funds`, `PUT /funds/:id`. */
export const fundInputSchema = z.object({ nameBn: text(100), nameEn: optionalText(100) });
export type FundInput = z.infer<typeof fundInputSchema>;

/**
 * `PUT /funds/:id/opening`: what the fund held on the day the society started using the
 * system, in cash and at the bank. Zero is allowed. Each change reverses the earlier rows.
 */
export const openingInputSchema = z.object({ date: isoDay, cash: moneyOrZeroSchema, bank: moneyOrZeroSchema });
export type OpeningInput = z.infer<typeof openingInputSchema>;

/** A fund to pick in a form. */
export const fundOptionSchema = z.object({ id: z.uuid(), nameBn: z.string(), nameEn: z.string().nullable(), isDefault: z.boolean() });
export type FundOption = z.infer<typeof fundOptionSchema>;

// ---------------------------------------------------------------------------
// Charge types
// ---------------------------------------------------------------------------

/** What a bill line can be. Labels live in i18n (`Finance.chargeKind.*`). Donations have their own records. */
export const CHARGE_KINDS = ['due', 'fee', 'fine'] as const;
export type ChargeKind = (typeof CHARGE_KINDS)[number];

export const chargeTypeSchema = z.object({
  id: z.uuid(),
  nameBn: z.string(),
  nameEn: z.string().nullable(),
  kind: z.enum(CHARGE_KINDS),
  fund: fundOptionSchema,
  defaultAmount: z.string().nullable(),
  archived: z.boolean(),
});
export type ChargeType = z.infer<typeof chargeTypeSchema>;

/** `GET /charge-types`: with the open funds to choose from. */
export const chargeTypeListSchema = z.object({
  items: z.array(chargeTypeSchema),
  funds: z.array(fundOptionSchema),
  separateFunds: z.boolean(),
});
export type ChargeTypeList = z.infer<typeof chargeTypeListSchema>;

/** `POST /charge-types`, `PUT /charge-types/:id`. With separate funds off, the fund must be the default one. */
export const chargeTypeInputSchema = z.object({
  nameBn: text(100),
  nameEn: optionalText(100),
  kind: z.enum(CHARGE_KINDS),
  fundId: z.uuid(),
  defaultAmount: optionalMoneySchema,
});
export type ChargeTypeInput = z.infer<typeof chargeTypeInputSchema>;
