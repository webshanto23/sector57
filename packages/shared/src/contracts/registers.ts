import { z } from 'zod';
import { asciiDigits, pagination } from '../schemas.js';
import { cleanText } from '../text.js';
import {
  isoDay,
  MEMBERSHIP_STATUSES,
  MOVE_KINDS,
  OPEN_TENANCY_STATUSES,
  partySchema,
  placeSchema,
  RENTER_TYPES,
} from './members.js';
import { unitTypeCode } from './property.js';

/*
 * The people registers on the dashboard: members (`memberships`), owners (current
 * `ownerships`) and renters (open `tenancies`), each within the caller's `members` area.
 * See docs/glossary.md: an owner is not a member until the office approves a membership.
 */

/** `q` matches names (fuzzy) or phone, in either digit form. */
const registerQuery = pagination.extend({
  q: z.string().transform(cleanText).pipe(z.string().max(100)).optional(),
  areaId: z.uuid().optional(),
});

const paged = <T extends z.ZodType, C extends z.ZodType>(row: T, counts: C) =>
  z.object({
    items: z.array(row),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    /** Figures within the caller's area; the filters don't apply. */
    counts,
  });

/** How many places someone owns now at one level ("2 plots"). Listed top level first. */
export const holdingCountSchema = z.object({
  levelId: z.uuid(),
  nameBn: z.string(),
  nameEn: z.string().nullable(),
  count: z.number().int().min(1),
});
export type HoldingCount = z.infer<typeof holdingCountSchema>;

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

/**
 * A member's membership fee: `paid` once they have membership bills and none is still open,
 * `unpaid` while one is (with what is owed and the oldest open bill), `not_billed` before any
 * bill. Void bills don't count.
 */
export const MEMBER_FEE_STATES = ['paid', 'unpaid', 'not_billed'] as const;
export type MemberFeeState = (typeof MEMBER_FEE_STATES)[number];

export const memberFeeSchema = z.object({
  state: z.enum(MEMBER_FEE_STATES),
  owed: z.string().nullable(),
  openBillId: z.uuid().nullable(),
});
export type MemberFee = z.infer<typeof memberFeeSchema>;

/** The fee filter: `not_paid` is unpaid or not billed. */
export const MEMBER_FEE_FILTERS = ['paid', 'not_paid'] as const;

/** `GET /registers/members`. Active members unless `status` says otherwise. `fee` needs society-wide `billing.view`. */
export const memberRegisterQuery = registerQuery.extend({
  status: z.enum(MEMBERSHIP_STATUSES).default('active'),
  fee: z.enum(MEMBER_FEE_FILTERS).optional(),
});
export type MemberRegisterQuery = z.infer<typeof memberRegisterQuery>;

export const memberRegisterRowSchema = z.object({
  memberNo: z.number().int(),
  status: z.enum(MEMBERSHIP_STATUSES),
  joinedOn: isoDay,
  person: partySchema,
  /** What they own now, in the caller's area. */
  holdings: z.array(holdingCountSchema),
  /** Their membership fee; null unless the caller may view billing for the whole society. */
  fee: memberFeeSchema.nullable(),
});
export type MemberRegisterRow = z.infer<typeof memberRegisterRowSchema>;

export const memberRegisterSchema = paged(
  memberRegisterRowSchema,
  z.object({
    active: z.number().int().min(0),
    lapsed: z.number().int().min(0),
    cancelled: z.number().int().min(0),
    /** Members with this status whose fee isn't paid; null when the fee isn't shown. */
    feeNotPaid: z.number().int().min(0).nullable(),
  }),
);
export type MemberRegister = z.infer<typeof memberRegisterSchema>;

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------

/** `GET /registers/owners`. `membership` and `residence` apply to people only (organisations are never members). */
export const ownerRegisterQuery = registerQuery.extend({
  membership: z.enum(['member', 'not_member']).optional(),
  residence: z.enum(['here', 'elsewhere']).optional(),
});
export type OwnerRegisterQuery = z.infer<typeof ownerRegisterQuery>;

export const ownerRegisterRowSchema = partySchema.extend({
  holdings: z.array(holdingCountSchema),
  /** The first place they own, and how many others. */
  place: placeSchema,
  otherPlaces: z.number().int().min(0),
  /** Lives in a unit in the caller's area now; null for an organisation. */
  livesHere: z.boolean().nullable(),
  /** The active membership number; null for a person who is not a member yet, and for an organisation. */
  memberNo: z.number().int().nullable(),
});
export type OwnerRegisterRow = z.infer<typeof ownerRegisterRowSchema>;

export const ownerRegisterSchema = paged(
  ownerRegisterRowSchema,
  z.object({
    owners: z.number().int().min(0),
    members: z.number().int().min(0),
    notMembers: z.number().int().min(0),
    livesHere: z.number().int().min(0),
  }),
);
export type OwnerRegister = z.infer<typeof ownerRegisterSchema>;

// ---------------------------------------------------------------------------
// Renters
// ---------------------------------------------------------------------------

/** `GET /registers/renters`: open tenancies. */
export const renterRegisterQuery = registerQuery.extend({
  renterType: z.enum(RENTER_TYPES).optional(),
  unitType: unitTypeCode.optional(),
  status: z.enum(OPEN_TENANCY_STATUSES).optional(),
});
export type RenterRegisterQuery = z.infer<typeof renterRegisterQuery>;

export const renterRegisterRowSchema = z.object({
  tenancyId: z.uuid(),
  renter: partySchema.nullable(),
  renterType: z.enum(RENTER_TYPES),
  status: z.enum(OPEN_TENANCY_STATUSES),
  /** The tenancy's start: the move-in date. */
  startDate: isoDay,
  monthlyRent: z.string().nullable(),
  policeFormSubmitted: z.boolean(),
  openMove: z.object({ id: z.uuid(), kind: z.enum(MOVE_KINDS) }).nullable(),
  unit: placeSchema,
  unitType: z.object({ code: unitTypeCode, nameBn: z.string(), nameEn: z.string().nullable() }),
  /** Current residents of the renter's household. */
  residents: z.number().int().min(0),
  /** The renter's active membership number; null when they aren't a member, and for an organisation. */
  memberNo: z.number().int().nullable(),
});
export type RenterRegisterRow = z.infer<typeof renterRegisterRowSchema>;

export const renterRegisterSchema = paged(
  renterRegisterRowSchema,
  z.object({
    renters: z.number().int().min(0),
    family: z.number().int().min(0),
    bachelor: z.number().int().min(0),
    policeFormMissing: z.number().int().min(0),
  }),
);
export type RenterRegister = z.infer<typeof renterRegisterSchema>;

/** `tel:` and WhatsApp links for a stored phone (`01…`, see `bdPhone`); WhatsApp needs Bangladesh's 880 in front. */
export function phoneLinks(phone: string): { tel: string; whatsapp: string } | null {
  const digits = asciiDigits(phone).replace(/\D/g, '');
  if (digits.length < 6) return null;
  return { tel: `tel:${digits}`, whatsapp: `https://wa.me/${digits.startsWith('0') ? `88${digits}` : digits}` };
}
