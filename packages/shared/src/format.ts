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

/** Dates are shown in Dhaka time for now; becomes a per-society setting when another society is onboarded. */
export const TIME_ZONE = 'Asia/Dhaka';

const DATE_STYLES = {
  // ০২ নভেম্বর, ২০২৬ / 02 November 2026
  long: { day: '2-digit', month: 'long', year: 'numeric' },
  // Date tile: ২১ / 21
  day: { day: '2-digit' },
  // Date tile: ডিসেম্বর / Dec
  month: { month: 'short' },
  // Committee term: ২০২৫ / 2025
  year: { year: 'numeric' },
  // Clock time, e.g. when a locked login opens again: বিকাল ৩:৪৫ / 3:45 pm
  time: { hour: 'numeric', minute: '2-digit' },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

/**
 * Formats an ISO date or timestamp for display. Bangla uses `bn-BD`, which
 * already writes Bangla digits and month names. Plain dates (`2026-12-21`) are
 * read as that calendar day, not shifted by the time zone.
 */
export function formatDate(value: string | Date, locale: Locale, style: keyof typeof DATE_STYLES = 'long'): string {
  const plainDate = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = typeof value === 'string' ? new Date(plainDate ? `${value}T00:00:00Z` : value) : value;
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', {
    ...DATE_STYLES[style],
    timeZone: plainDate ? 'UTC' : TIME_ZONE,
  }).format(date);
}
