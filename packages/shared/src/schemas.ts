import { z } from 'zod';
import { bnDigits } from './format.js';
import { cleanText } from './text.js';

const BN_TO_ASCII = Object.fromEntries([...bnDigits('0123456789')].map((d, i) => [d, String(i)]));

/**
 * Bangladesh mobile number. Accepts Bangla or ASCII digits, spaces, dashes and
 * an optional +88/88 prefix; outputs the 11-digit local form `01XXXXXXXXX`.
 */
export const bdPhone = z
  .string()
  .transform((value) =>
    value
      .replace(/[০-৯]/g, (d) => BN_TO_ASCII[d]!)
      .replace(/[\s-]/g, '')
      .replace(/^\+?88(?=01)/, ''),
  )
  .pipe(z.string().regex(/^01[3-9]\d{8}$/, 'invalid_phone'));

export const uuid = z.uuid();

/** Required user-typed text: NFC, trimmed, not empty. */
export const text = (max = 500) => z.string().transform(cleanText).pipe(z.string().min(1).max(max));

/** Optional user-typed text: blank becomes null. */
export const optionalText = (max = 500) =>
  z
    .string()
    .nullish()
    .transform((value) => (value == null ? null : cleanText(value) || null))
    .pipe(z.string().max(max).nullable());

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof pagination>;

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };
