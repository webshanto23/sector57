import { z } from 'zod';
import { asciiDigits } from './schemas.js';
import { cleanText } from './text.js';

/**
 * Money is a decimal string everywhere outside the database (`numeric(14,2)`):
 * `"4500.00"`. Arithmetic runs on whole paisa as `bigint`, never on JS numbers,
 * so `0.10 + 0.20` is exactly `0.30`.
 */
const MONEY = /^(-)?(\d{1,12})(?:\.(\d{1,2}))?$/;

/** What a person may type: Bangla or ASCII digits, commas, spaces and a leading ৳. */
const typed = (value: string) =>
  asciiDigits(cleanText(value))
    .replace(/^৳/, '')
    .replace(/[,\s]/g, '');

/** A decimal string as whole paisa. Throws on anything that isn't money (`-` allowed, at most two decimals). */
export function toPaisa(amount: string): bigint {
  const match = MONEY.exec(amount.trim());
  if (!match) throw new RangeError(`Not a money amount: ${amount}`);
  const [, sign, whole, fraction = ''] = match;
  const paisa = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  return sign ? -paisa : paisa;
}

/** Whole paisa as the canonical decimal string: `450000n` → `"4500.00"`. */
export function fromPaisa(paisa: bigint): string {
  const sign = paisa < 0n ? '-' : '';
  const abs = paisa < 0n ? -paisa : paisa;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

/** The canonical form of a money string: `"0045.5"` → `"45.50"`. */
export const normaliseMoney = (amount: string): string => fromPaisa(toPaisa(amount));

export const addMoney = (...amounts: string[]): string => fromPaisa(amounts.reduce((sum, amount) => sum + toPaisa(amount), 0n));

export const subtractMoney = (from: string, amount: string): string => fromPaisa(toPaisa(from) - toPaisa(amount));

export function compareMoney(a: string, b: string): -1 | 0 | 1 {
  const diff = toPaisa(a) - toPaisa(b);
  return diff < 0n ? -1 : diff > 0n ? 1 : 0;
}

export const isZeroMoney = (amount: string): boolean => toPaisa(amount) === 0n;

/** A typed amount of zero or more, as the canonical string. Errors carry `invalid_amount`. */
export const moneyOrZeroSchema = z
  .string()
  .transform(typed)
  .pipe(z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'invalid_amount'))
  .transform(normaliseMoney);

/** A typed amount above zero (what a bill line, receipt or expense needs). */
export const moneySchema = moneyOrZeroSchema.refine((amount) => !isZeroMoney(amount), 'invalid_amount');

/** An optional amount above zero: blank becomes null. */
export const optionalMoneySchema = z
  .string()
  .nullish()
  .transform((value) => (value == null ? null : typed(value) || null))
  .pipe(moneySchema.nullable());
