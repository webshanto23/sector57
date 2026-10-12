import { z } from 'zod';
import { moneySchema } from '../money.js';
import { optionalText, pagination, text } from '../schemas.js';
import { fundOptionSchema, LEDGER_ACCOUNTS, LEDGER_SOURCES } from './finance.js';
import { isoDay } from './members.js';

const nameRef = z.object({ id: z.uuid(), nameBn: z.string(), nameEn: z.string().nullable() });
const step = z.object({ by: z.string().nullable(), at: z.iso.datetime({ offset: true }) });

// ---------------------------------------------------------------------------
// Fund transfers and bank deposits
// ---------------------------------------------------------------------------

/**
 * `POST /ledger/transfers`: money from one fund and account to another. A bank deposit is
 * the same fund, cash to bank; a withdrawal is bank to cash. It is dated today.
 */
export const transferInputSchema = z
  .object({
    fromFundId: z.uuid(),
    fromAccount: z.enum(LEDGER_ACCOUNTS),
    toFundId: z.uuid(),
    toAccount: z.enum(LEDGER_ACCOUNTS),
    amount: moneySchema,
    memo: optionalText(300),
  })
  .superRefine((input, ctx) => {
    if (input.fromFundId === input.toFundId && input.fromAccount === input.toAccount) {
      ctx.addIssue({ code: 'custom', path: ['toAccount'], message: 'transfer_nothing_moves' });
    }
  });
export type TransferInputValues = z.input<typeof transferInputSchema>;
export type TransferInput = z.output<typeof transferInputSchema>;

/** `POST /ledger/transfers/:id/void`. */
export const transferVoidSchema = z.object({ reason: text(300) });
export type TransferVoid = z.infer<typeof transferVoidSchema>;

/** What a transfer is, from its two sides. */
export const TRANSFER_KINDS = ['deposit', 'withdrawal', 'between_funds'] as const;
export type TransferKind = (typeof TRANSFER_KINDS)[number];

export const transferKind = (t: { fromFundId: string; fromAccount: string; toFundId: string; toAccount: string }): TransferKind =>
  t.fromFundId !== t.toFundId ? 'between_funds' : t.toAccount === 'bank' ? 'deposit' : 'withdrawal';

const side = z.object({ fund: nameRef, account: z.enum(LEDGER_ACCOUNTS) });

export const transferSchema = z.object({
  id: z.uuid(),
  kind: z.enum(TRANSFER_KINDS),
  from: side,
  to: side,
  amount: z.string(),
  date: isoDay,
  memo: z.string().nullable(),
  created: step,
  void: step.extend({ reason: z.string() }).nullable(),
  can: z.object({ void: z.boolean() }),
});
export type Transfer = z.infer<typeof transferSchema>;

/** `GET /ledger/transfers`: newest first. `fundId` matches either side. */
export const transferListQuery = pagination.extend({
  fundId: z.uuid().optional(),
  from: isoDay.optional(),
  to: isoDay.optional(),
});
export type TransferListQuery = z.infer<typeof transferListQuery>;

export const transferListSchema = z.object({
  items: z.array(transferSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});
export type TransferList = z.infer<typeof transferListSchema>;

// ---------------------------------------------------------------------------
// The statement
// ---------------------------------------------------------------------------

/** Where a ledger row leads in the dashboard: the record that wrote it. */
export const LEDGER_LINKS = ['receipt', 'donation', 'expense', 'transfer', 'fund'] as const;
export type LedgerLink = (typeof LEDGER_LINKS)[number];

/** `GET /ledger`: one fund (or all) and one account (or both), both dates included. Defaults to this month. */
export const ledgerQuery = pagination.extend({
  fundId: z.uuid().optional(),
  account: z.enum(LEDGER_ACCOUNTS).optional(),
  from: isoDay.optional(),
  to: isoDay.optional(),
});
export type LedgerQuery = z.infer<typeof ledgerQuery>;

export const ledgerRowSchema = z.object({
  /** `ledger_entries.id` (a bigint), as text. */
  id: z.string(),
  date: isoDay,
  fund: nameRef,
  account: z.enum(LEDGER_ACCOUNTS),
  direction: z.enum(['in', 'out']),
  amount: z.string(),
  source: z.enum(LEDGER_SOURCES),
  link: z.object({ kind: z.enum(LEDGER_LINKS), id: z.uuid() }).nullable(),
  /** The receipt, voucher or other number the row was written with. */
  reference: z.string().nullable(),
  /** This row reverses an earlier one (a void or a corrected opening). */
  reversal: z.boolean(),
  /** A later row reverses this one. */
  reversed: z.boolean(),
  /** The balance after this row, within the statement's fund and account. */
  balance: z.string(),
  by: z.string().nullable(),
});
export type LedgerRow = z.infer<typeof ledgerRowSchema>;

export const ledgerStatementSchema = z.object({
  from: isoDay,
  to: isoDay,
  fundId: z.uuid().nullable(),
  account: z.enum(LEDGER_ACCOUNTS).nullable(),
  /** The balance at the start of `from`, and the money in and out in the range. */
  opening: z.string(),
  totalIn: z.string(),
  totalOut: z.string(),
  closing: z.string(),
  items: z.array(ledgerRowSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  /** Every fund, open or closed, for the picker. */
  funds: z.array(fundOptionSchema.extend({ closed: z.boolean() })),
});
export type LedgerStatement = z.infer<typeof ledgerStatementSchema>;
