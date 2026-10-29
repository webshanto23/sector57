import { z } from 'zod';
import { asciiDigits, text } from '../schemas.js';
import { documentHeaderSchema } from './finance.js';
import { isoDay, MEMBERSHIP_STATUSES } from './members.js';

// ---------------------------------------------------------------------------
// Membership ID cards
// ---------------------------------------------------------------------------

/** `society_settings` key of the card settings (`memberCardSettingsSchema`). */
export const MEMBER_CARD_KEY = 'member_card';

/** Most lines of terms the back of the card holds. */
export const MAX_CARD_TERMS = 4;
/** Longest validity the office may set, in years. */
export const MAX_CARD_YEARS = 10;

/**
 * What the back of a card says, set in Settings > Membership. Empty terms: the screens' default
 * terms (i18n). `validYears` null: the card has no "Valid till" line. The signature line is
 * labelled with `signatureBn` / `signatureEn` (null: the default label).
 */
export const memberCardSettingsSchema = z.object({
  termsBn: z.array(z.string()).max(MAX_CARD_TERMS),
  termsEn: z.array(z.string()).max(MAX_CARD_TERMS),
  validYears: z.number().int().min(1).max(MAX_CARD_YEARS).nullable(),
  signatureBn: z.string().nullable(),
  signatureEn: z.string().nullable(),
});
export type MemberCardSettings = z.infer<typeof memberCardSettingsSchema>;

/** The settings before the office changes them. */
export const DEFAULT_MEMBER_CARD_SETTINGS: MemberCardSettings = { termsBn: [], termsEn: [], validYears: null, signatureBn: null, signatureEn: null };

/** Lines of terms as typed: blank lines dropped, each NFC-normalised. */
const termLines = z.preprocess(
  (value) => (Array.isArray(value) ? value.filter((line) => typeof line !== 'string' || line.trim() !== '') : value),
  z.array(text(160)).max(MAX_CARD_TERMS),
);

/** `PUT /settings/member-card`. */
export const memberCardSettingsInputSchema = z.object({
  termsBn: termLines,
  termsEn: termLines,
  validYears: z.preprocess(
    (value) => (typeof value === 'string' ? (value.trim() === '' ? null : Number(asciiDigits(value).trim())) : value),
    z.number().int().min(1).max(MAX_CARD_YEARS).nullable(),
  ),
  signatureBn: z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? null : value), text(40).nullable()),
  signatureEn: z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? null : value), text(40).nullable()),
});
export type MemberCardSettingsInput = z.infer<typeof memberCardSettingsInputSchema>;

/** The last day a card printed on `today` is valid, `years` later (the day before the anniversary). */
export function cardValidTill(today: string, years: number): string {
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  // 29 Feb rolls on to 1 Mar in a year without it, so the card ends on 28 Feb.
  const anniversary = new Date(Date.UTC(year + years, month - 1, day));
  return new Date(anniversary.getTime() - 86_400_000).toISOString().slice(0, 10);
}

/**
 * `GET /memberships/:id/card`: what one card shows. Only an active membership with an ID
 * (409 `membership_id_pending`, `membership_not_active`). An organisation's card has no photo;
 * its phone and email are its contact person's.
 */
export const memberCardSchema = z.object({
  membershipId: z.uuid(),
  membershipCode: z.string(),
  kind: z.enum(['person', 'organisation']),
  name: z.string(),
  nameEn: z.string().nullable(),
  photoUrl: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  joinedOn: isoDay,
  /** Null when the society sets no validity. */
  validTill: isoDay.nullable(),
  status: z.enum(MEMBERSHIP_STATUSES),
  /** The society's band and contact line (the receipt header, with the logo badge). */
  header: documentHeaderSchema,
  settings: memberCardSettingsSchema,
});
export type MemberCard = z.infer<typeof memberCardSchema>;

/** Most cards one batch prints (ten A4 sheets of nine). */
export const MAX_CARD_BATCH = 90;

/** Why a ticked member got no card: outside the caller's area or rights, ID pending, not active. */
export const CARD_SKIP_CODES = ['membership_not_found', 'beyond_your_permissions', 'membership_id_pending', 'membership_not_active'] as const;
export type CardSkipCode = (typeof CARD_SKIP_CODES)[number];

/** `POST /memberships/cards`: memberships ticked on the members list, each once. */
export const memberCardsInputSchema = z.object({
  membershipIds: z
    .array(z.uuid())
    .min(1)
    .max(MAX_CARD_BATCH)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'Each one once' }),
});
export type MemberCardsInput = z.infer<typeof memberCardsInputSchema>;

/** The cards in the order asked for, and the memberships left out with why. */
export const memberCardsSchema = z.object({
  items: z.array(memberCardSchema),
  skipped: z.array(z.object({ membershipId: z.uuid(), code: z.enum(CARD_SKIP_CODES) })),
});
export type MemberCards = z.infer<typeof memberCardsSchema>;

/**
 * Where each card goes on the A4 sheets: `perSheet` cards a page, fronts on one page and backs
 * on the next. A back sits in the same row but mirrored left to right, so it lands behind its
 * front when the sheet is printed on both sides (flipped on the long edge).
 */
export function cardSheets<T>(cards: readonly T[], columns: number, rows: number): { fronts: (T | null)[]; backs: (T | null)[] }[] {
  const perSheet = columns * rows;
  const sheets: { fronts: (T | null)[]; backs: (T | null)[] }[] = [];
  for (let start = 0; start < cards.length; start += perSheet) {
    const fronts: (T | null)[] = Array.from({ length: perSheet }, (_, i) => cards[start + i] ?? null);
    const backs = fronts.map((_, i) => {
      const row = Math.floor(i / columns);
      const column = i % columns;
      return fronts[row * columns + (columns - 1 - column)] ?? null;
    });
    sheets.push({ fronts, backs });
  }
  return sheets;
}
