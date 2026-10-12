import { z } from 'zod';
import { bnDigits } from '../format.js';

/**
 * The `branding` society setting: the short mark in the logo badge and the place
 * line under the name in the header. Saved from the dashboard's society profile.
 */
export const brandingSchema = z.object({
  mark: z.string().min(1),
  placeBn: z.string().nullable(),
  placeEn: z.string().nullable(),
});
export type Branding = z.infer<typeof brandingSchema>;

/**
 * The logo badge before the office picks one: the first number in the name in
 * Bangla digits ("উত্তরা সেক্টর ১৫ ..." -> "১৫"), else the name's first letter.
 */
export function defaultLogoMark(nameBn: string): string {
  const number = /[0-9০-৯]+/.exec(nameBn)?.[0];
  if (number) return bnDigits(number.slice(0, 3));
  return Array.from(nameBn.trim())[0] ?? '';
}

/** The stored branding, or the defaults worked out from the name when none is saved. */
export function brandingOf(stored: unknown, nameBn: string): Branding {
  const parsed = brandingSchema.safeParse(stored);
  return parsed.success ? parsed.data : { mark: defaultLogoMark(nameBn), placeBn: null, placeEn: null };
}

/** `GET /society`: public facts about the society the site serves. */
export const societySchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    nameBn: z.string(),
    nameEn: z.string().nullable(),
    fiscalYearStartMonth: z.number().int().min(1).max(12),
  })
  .extend(brandingSchema.shape);
export type Society = z.infer<typeof societySchema>;
