import type { Locale } from './locale.js';

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

/** Replaces ASCII digits with Bangla digits (the mockup's `N()` for bn). */
export function bnDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => BN_DIGITS[Number(d)]!);
}

/** Digits for the given locale: Bangla digits in bn, unchanged in en. */
export function localDigits(value: string | number, locale: Locale): string {
  return locale === 'bn' ? bnDigits(value) : String(value);
}

/** Indian grouping on an integer string: 2170000 -> 21,70,000. */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

const DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/;

/**
 * Formats a whole or decimal number with Indian grouping, without going through
 * floating point. Accepts what Prisma Decimal serialises to (a string).
 */
export function formatNumber(value: string | number | bigint, locale: Locale): string {
  const text = typeof value === 'number' ? String(value) : value.toString();
  const match = DECIMAL.exec(text.trim());
  if (!match) throw new RangeError(`Not a decimal number: ${text}`);
  const [, sign = '', whole, fraction] = match;
  const integer = groupIndian(whole!.replace(/^0+(?=\d)/, ''));
  const out = fraction ? `${sign}${integer}.${fraction}` : `${sign}${integer}`;
  return localDigits(out, locale);
}

/**
 * Money in BDT: `৳ 21,70,000`. Paisa are shown only when not zero.
 * Pass the Decimal as a string; never convert money to a JS float.
 */
export function formatTaka(amount: string | number | bigint, locale: Locale): string {
  const text = typeof amount === 'number' ? String(amount) : amount.toString();
  const match = DECIMAL.exec(text.trim());
  if (!match) throw new RangeError(`Not a money amount: ${text}`);
  const [, sign = '', whole, fraction = ''] = match;
  const paisa = fraction.padEnd(2, '0').slice(0, 2);
  const value = paisa === '00' ? `${sign}${whole}` : `${sign}${whole}.${paisa}`;
  return `৳ ${formatNumber(value, locale)}`;
}
