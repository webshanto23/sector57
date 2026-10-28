import { z } from 'zod';
import { asciiDigits, bdPhone, optionalEmail, optionalText, pagination, text } from '../schemas.js';
import { cleanText } from '../text.js';

/** `tenancies.renter_type`. Labels live in i18n (`Members.renterType.*`). */
export const RENTER_TYPES = ['family', 'bachelor', 'office', 'warehouse', 'shop', 'other'] as const;
export type RenterType = (typeof RENTER_TYPES)[number];

/** `tenancies.status`. A tenancy is open until it is `ended`; a unit has at most one open tenancy. */
export const TENANCY_STATUSES = ['pending', 'active', 'moving_out', 'ended'] as const;
export type TenancyStatus = (typeof TENANCY_STATUSES)[number];
export const OPEN_TENANCY_STATUSES = ['pending', 'active', 'moving_out'] as const satisfies readonly TenancyStatus[];
/** `move_events.kind`: a renter moving into a unit, or out of it (see `contracts/moves.ts`). */
export const MOVE_KINDS = ['move_in', 'move_out'] as const;
export type MoveKind = (typeof MOVE_KINDS)[number];

/** Statuses that make a unit `rented`: the renter has moved in. */
export const RENTED_STATUSES = ['active', 'moving_out'] as const satisfies readonly TenancyStatus[];

/** `occupants.relation`, checked by the database. Labels live in i18n (`Members.relation.*`). */
export const OCCUPANT_RELATIONS = [
  'head',
  'spouse',
  'child',
  'parent',
  'sibling',
  'relative',
  'co_renter',
  'domestic_help',
  'driver',
  'other',
] as const;
export type OccupantRelation = (typeof OCCUPANT_RELATIONS)[number];

/** `persons.gender`. */
export const GENDERS = ['male', 'female', 'other'] as const;
export type Gender = (typeof GENDERS)[number];

const oneOf =
  <T extends readonly string[]>(values: T, fallback: T[number]) =>
  (value: string): T[number] =>
    (values as readonly string[]).includes(value) ? (value as T[number]) : fallback;
export const toRenterType = oneOf(RENTER_TYPES, 'other');
export const toTenancyStatus = oneOf(TENANCY_STATUSES, 'ended');
export const toRelation = oneOf(OCCUPANT_RELATIONS, 'other');
export const toMoveKind = oneOf(MOVE_KINDS, 'move_in');
export const toGender = (value: string | null): Gender | null => (value === null ? null : oneOf(GENDERS, 'other')(value));

const blankToNull = (value: string | null | undefined) => (value == null || value.trim() === '' ? null : value);

/** Optional phone: blank is null. */
export const optionalPhone = z.string().nullish().transform(blankToNull).pipe(bdPhone.nullable());

/** National ID: 10, 13 or 17 digits, Bangla digits and spaces or dashes allowed. Blank is null. */
export const nidSchema = z
  .string()
  .nullish()
  .transform((value) => {
    const plain = value == null ? '' : asciiDigits(value).replace(/[\s-]/g, '');
    return plain === '' ? null : plain;
  })
  .pipe(
    z
      .string()
      .regex(/^(\d{10}|\d{13}|\d{17})$/, 'invalid_nid')
      .nullable(),
  );

/** A calendar date, `YYYY-MM-DD`. */
export const isoDay = z.iso.date();
/** An optional date; blank (an empty date input) is null. */
const optionalDay = z.string().nullish().transform(blankToNull).pipe(z.iso.date().nullable());

/** Share of an ownership in percent, as a decimal string (`numeric(5,2)`), above 0 and at most 100. */
export const sharePercentSchema = z
  .string()
  .transform((value) => asciiDigits(value).trim())
  .pipe(
    z
      .string()
      .regex(/^\d{1,3}(\.\d{1,2})?$/, 'invalid_share')
      .refine((value) => Number(value) > 0 && Number(value) <= 100, 'invalid_share'),
  );

/** Hundredths of a percent, so shares add up exactly. */
export const shareHundredths = (share: string): number => {
  const [whole = '0', fraction = ''] = share.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
};

/** Taka as a decimal string (`numeric(14,2)`), Bangla digits and commas allowed. Blank is null. */
export const optionalMoney = z
  .string()
  .nullish()
  .transform((value) => (value == null ? null : asciiDigits(value).replace(/,/g, '').trim() || null))
  .pipe(
    z
      .string()
      .regex(/^\d{1,12}(\.\d{1,2})?$/, 'invalid_amount')
      .nullable(),
  );

// ---------------------------------------------------------------------------
// People and organisations
// ---------------------------------------------------------------------------

/**
 * A person as typed in a form. When added to a unit, the society's person with the same
 * phone (or else the same NID) is reused and their stored details are kept.
 */
export const personInputSchema = z.object({
  fullName: text(200),
  fullNameEn: optionalText(200),
  phone: optionalPhone,
  email: optionalEmail,
  nid: nidSchema,
  dateOfBirth: optionalDay,
  gender: z.enum(GENDERS).nullish().transform((value) => value ?? null),
});
export type PersonInput = z.infer<typeof personInputSchema>;

/** `PATCH /persons/:id`: every field, as on the form. */
export const personUpdateSchema = personInputSchema;
export type PersonUpdateInput = z.infer<typeof personUpdateSchema>;

/** `PUT /persons/:id/verified`: mark the person's details as checked against their papers, or undo it. */
export const personVerifySchema = z.object({ verified: z.boolean() });
export type PersonVerifyInput = z.infer<typeof personVerifySchema>;

/**
 * An organisation as typed. Reused when the society already has one with the same trade
 * licence (or else the same name). The contact person, when given, is found or added like any person.
 */
export const organisationInputSchema = z.object({
  name: text(200),
  tradeLicence: optionalText(100),
  contact: personInputSchema.nullish().transform((value) => value ?? null),
});
export type OrganisationInput = z.infer<typeof organisationInputSchema>;

/** Who owns or rents: a person or an organisation, as typed (found or added by the API). */
export const partyInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('person'), person: personInputSchema }),
  z.object({ kind: z.literal('organisation'), organisation: organisationInputSchema }),
]);
export type PartyInput = z.infer<typeof partyInputSchema>;

/** A person or organisation as shown in a row. `verified` is null for organisations. */
export const partySchema = z.object({
  kind: z.enum(['person', 'organisation']),
  id: z.uuid(),
  name: z.string(),
  nameEn: z.string().nullable(),
  phone: z.string().nullable(),
  photoUrl: z.string().nullable(),
  verified: z.boolean().nullable(),
});
export type Party = z.infer<typeof partySchema>;

/** A location a row points at. `address` is the names above it, top first (the society's single root left out). */
export const placeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.array(z.string()),
  isUnit: z.boolean(),
});
export type Place = z.infer<typeof placeSchema>;

// ---------------------------------------------------------------------------
// Ownerships, tenancies, occupants
// ---------------------------------------------------------------------------

export const ownershipSchema = z.object({
  id: z.uuid(),
  place: placeSchema,
  owner: partySchema,
  sharePercent: z.string(),
  startDate: isoDay,
  endDate: isoDay.nullable(),
});
export type Ownership = z.infer<typeof ownershipSchema>;

export const tenancySchema = z.object({
  id: z.uuid(),
  place: placeSchema,
  renter: partySchema.nullable(),
  renterType: z.enum(RENTER_TYPES),
  status: z.enum(TENANCY_STATUSES),
  startDate: isoDay,
  endDate: isoDay.nullable(),
  monthlyRent: z.string().nullable(),
  policeFormSubmitted: z.boolean(),
  /** The move-in or move-out under way, if any. */
  openMove: z.object({ id: z.uuid(), kind: z.enum(MOVE_KINDS) }).nullable(),
});
export type Tenancy = z.infer<typeof tenancySchema>;

export const occupantSchema = z.object({
  id: z.uuid(),
  place: placeSchema,
  person: partySchema,
  /** Null for the owner's household. */
  tenancyId: z.uuid().nullable(),
  relation: z.enum(OCCUPANT_RELATIONS),
  startDate: isoDay,
  endDate: isoDay.nullable(),
});
export type Occupant = z.infer<typeof occupantSchema>;

/** `POST /ownerships`: one more owner of a location (a co-owner). Current shares may not exceed 100%. */
export const ownershipCreateSchema = z.object({
  locationId: z.uuid(),
  owner: partyInputSchema,
  sharePercent: sharePercentSchema.default('100'),
  startDate: isoDay,
});
export type OwnershipCreateInput = z.infer<typeof ownershipCreateSchema>;

/**
 * `POST /ownerships/transfer`: on `date` every current owner of the location stops and
 * the new owners start. History is kept.
 */
export const ownershipTransferSchema = z
  .object({
    locationId: z.uuid(),
    date: isoDay,
    owners: z
      .array(z.object({ owner: partyInputSchema, sharePercent: sharePercentSchema.default('100') }))
      .min(1)
      .max(20),
  })
  .refine((input) => input.owners.reduce((sum, row) => sum + shareHundredths(row.sharePercent), 0) <= 10000, {
    message: 'shares_over_100',
    path: ['owners'],
  });
export type OwnershipTransferInput = z.infer<typeof ownershipTransferSchema>;

/** `PATCH /ownerships/:id`. */
export const ownershipUpdateSchema = z.object({
  sharePercent: sharePercentSchema.optional(),
  startDate: isoDay.optional(),
});
export type OwnershipUpdateInput = z.infer<typeof ownershipUpdateSchema>;

/** `POST /ownerships/:id/end`, `/tenancies/:id/end`, `/occupants/:id/end`. */
export const endSchema = z.object({ endDate: isoDay });
export type EndInput = z.infer<typeof endSchema>;

/** `POST /tenancies`: a renting household, mess or company moves into a unit that has no open tenancy. */
export const tenancyCreateSchema = z.object({
  unitId: z.uuid(),
  renter: partyInputSchema,
  renterType: z.enum(RENTER_TYPES),
  status: z.enum(['pending', 'active']).default('active'),
  startDate: isoDay,
  monthlyRent: optionalMoney,
  policeFormSubmitted: z.boolean().default(false),
});
export type TenancyCreateInput = z.infer<typeof tenancyCreateSchema>;

/** `PATCH /tenancies/:id` (open tenancies only; ending goes through `/end`). */
export const tenancyUpdateSchema = z.object({
  renterType: z.enum(RENTER_TYPES).optional(),
  status: z.enum(OPEN_TENANCY_STATUSES).optional(),
  startDate: isoDay.optional(),
  monthlyRent: optionalMoney.optional(),
  policeFormSubmitted: z.boolean().optional(),
});
export type TenancyUpdateInput = z.infer<typeof tenancyUpdateSchema>;

/**
 * `POST /occupants`: a resident of a unit, in the open tenancy's household or (`tenancyId` null)
 * the owner's. Either a typed `person` (found or added like any person) or `personId` of someone
 * already on record here: a current owner of the unit or a place above it (owner's household),
 * or the tenancy's renter.
 */
export const occupantCreateSchema = z
  .object({
    unitId: z.uuid(),
    tenancyId: z.uuid().nullable(),
    person: personInputSchema.optional(),
    personId: z.uuid().optional(),
    relation: z.enum(OCCUPANT_RELATIONS),
    startDate: isoDay,
  })
  .refine((input) => (input.person === undefined) !== (input.personId === undefined), {
    message: 'person_or_person_id',
    path: ['person'],
  });
export type OccupantCreateInput = z.infer<typeof occupantCreateSchema>;

/** `PATCH /occupants/:id`. */
export const occupantUpdateSchema = z.object({
  relation: z.enum(OCCUPANT_RELATIONS).optional(),
  startDate: isoDay.optional(),
});
export type OccupantUpdateInput = z.infer<typeof occupantUpdateSchema>;

/** True when a typed end date falls before the stored start date (the API answers 400 `end_before_start`). */
export const endsBeforeStart = (startDate: string, endDate: string | null) => endDate !== null && endDate < startDate;

/**
 * `GET /locations/:id/people`: who owns, rents and lives at a location. A section is null
 * when the caller may not view it there. `ownersAbove` are the current owners of the
 * locations above (a plot's owner owns its flats unless the flat has its own).
 */
export const locationPeopleSchema = z.object({
  location: z.object({ id: z.uuid(), name: z.string(), isUnit: z.boolean() }),
  owners: z.array(ownershipSchema).nullable(),
  ownersAbove: z.array(ownershipSchema).nullable(),
  tenancies: z.array(tenancySchema).nullable(),
  occupants: z.array(occupantSchema).nullable(),
  can: z.object({
    ownerships: z.object({ create: z.boolean(), edit: z.boolean(), delete: z.boolean() }),
    tenancies: z.object({ create: z.boolean(), edit: z.boolean(), delete: z.boolean() }),
    occupants: z.object({ create: z.boolean(), edit: z.boolean(), delete: z.boolean() }),
  }),
});
export type LocationPeople = z.infer<typeof locationPeopleSchema>;

// ---------------------------------------------------------------------------
// Members (memberships)
// ---------------------------------------------------------------------------

/** `memberships.status`. A registered member of the society (see docs/glossary.md: "Member"). */
export const MEMBERSHIP_STATUSES = ['active', 'lapsed', 'cancelled'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
export const toMembershipStatus = oneOf(MEMBERSHIP_STATUSES, 'cancelled');

/** A person's society membership, on their page. */
export const membershipSchema = z.object({
  memberNo: z.number().int(),
  /** Unique across all societies: the society code and the padded member number (`S15-000042`). */
  membershipCode: z.string(),
  status: z.enum(MEMBERSHIP_STATUSES),
  joinedOn: isoDay,
  endedOn: isoDay.nullable(),
});
export type Membership = z.infer<typeof membershipSchema>;

/**
 * `POST /memberships`: the office registers a member directly (whole-society callers). Either
 * `person` (matched by phone, then NID, else added) or `personId` (someone on file, such as an
 * owner or renter). A blank `locationId` takes their first current unit or plot (owned, then
 * rented); a blank `joinedOn` is today.
 */
export const memberCreateSchema = z
  .object({
    person: personInputSchema.nullish().transform((value) => value ?? null),
    personId: z.uuid().nullish().transform((value) => value ?? null),
    locationId: z.uuid().nullish().transform((value) => value ?? null),
    joinedOn: optionalDay,
  })
  .refine((value) => (value.person === null) !== (value.personId === null), {
    message: 'Give either person or personId',
    path: ['personId'],
  });
export type MemberCreateInput = z.infer<typeof memberCreateSchema>;

/**
 * A membership ID: the society code, a dash and the member number padded to six digits
 * (`S15-000042`). The database's `memberships_set_code` trigger writes the stored one; this
 * copy is only for previews and must stay the same.
 */
export const formatMembershipCode = (societyCode: string, memberNo: number) => `${societyCode}-${String(memberNo).padStart(6, '0')}`;

/** The next member number: the starter, or one past the highest number used, whichever is higher. */
export const nextMemberNumber = (firstMemberNo: number, highestUsed: number | null) => Math.max(firstMemberNo, (highestUsed ?? 0) + 1);

/** Largest starter the office may set (eight digits). */
export const MAX_FIRST_MEMBER_NO = 99_999_999;

/** A society code as typed: trimmed and upper-cased, then 2 to 10 English letters or digits. */
export const societyCodeSchema = z
  .string()
  .transform((value) => asciiDigits(value).trim().toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{2,10}$/));

/** `GET /settings/membership`: how membership IDs are made, and what the next one will be. */
export const membershipSettingsSchema = z.object({
  societyCode: z.string(),
  firstMemberNo: z.number().int().min(1),
  /** Memberships the society has issued; changing the code re-issues all of them. */
  issued: z.number().int().min(0),
  /** The highest member number used so far; null before the first member. */
  highestMemberNo: z.number().int().nullable(),
  nextMemberNo: z.number().int().min(1),
  nextMembershipCode: z.string(),
});
export type MembershipSettings = z.infer<typeof membershipSettingsSchema>;

/**
 * `PUT /settings/membership`. A new code re-issues every membership ID of the society; the starter
 * only moves numbers given from now on (never below one already used).
 */
export const membershipSettingsInputSchema = z.object({
  societyCode: societyCodeSchema,
  firstMemberNo: z.preprocess(
    (value) => (typeof value === 'string' ? Number(asciiDigits(value).trim()) : value),
    z.number().int().min(1).max(MAX_FIRST_MEMBER_NO),
  ),
});
export type MembershipSettingsInput = z.infer<typeof membershipSettingsInputSchema>;

/** People made members in one go from the owners or renters list. */
export const MAX_BULK_MEMBERS = 200;

/** `POST /memberships/bulk`: people on file, numbered in this order, all joining on one day (blank is today). */
export const memberBulkSchema = z.object({
  personIds: z
    .array(z.uuid())
    .min(1)
    .max(MAX_BULK_MEMBERS)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'Each person once' }),
  joinedOn: optionalDay,
});
export type MemberBulkInput = z.infer<typeof memberBulkSchema>;

/** The new memberships, and how many people were skipped because they already are members. */
export const memberBulkResultSchema = z.object({
  created: z.array(z.object({ personId: z.uuid(), memberNo: z.number().int(), membershipCode: z.string() })),
  skipped: z.number().int().min(0),
});
export type MemberBulkResult = z.infer<typeof memberBulkResultSchema>;

export const memberCreatedSchema = z.object({
  personId: z.uuid(),
  memberNo: z.number().int(),
  membershipCode: z.string(),
  reusedPerson: z.boolean(),
});
export type MemberCreated = z.infer<typeof memberCreatedSchema>;

/**
 * `GET /persons/:id`. `nid` is null unless the caller may edit the person (`hasNid` says
 * whether one is on file). The ownerships, tenancies and households are those in the caller's area.
 */
export const personDetailSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  fullNameEn: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  nid: z.string().nullable(),
  hasNid: z.boolean(),
  dateOfBirth: isoDay.nullable(),
  gender: z.enum(GENDERS).nullable(),
  photoUrl: z.string().nullable(),
  verifiedAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  ownerships: z.array(ownershipSchema),
  tenancies: z.array(tenancySchema),
  households: z.array(occupantSchema),
  /** Their current or latest society membership, if any. */
  membership: membershipSchema.nullable(),
  can: z.object({ edit: z.boolean(), verify: z.boolean(), delete: z.boolean() }),
});
export type PersonDetail = z.infer<typeof personDetailSchema>;

/** `GET /organisations/:id`. */
export const organisationDetailSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  tradeLicence: z.string().nullable(),
  contact: partySchema.nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  ownerships: z.array(ownershipSchema),
  tenancies: z.array(tenancySchema),
  can: z.object({ edit: z.boolean(), delete: z.boolean() }),
});
export type OrganisationDetail = z.infer<typeof organisationDetailSchema>;

/** `PATCH /organisations/:id`: name and licence (the contact person is changed on their own page). */
export const organisationUpdateSchema = z.object({
  name: text(200),
  tradeLicence: optionalText(100),
});
export type OrganisationUpdateInput = z.infer<typeof organisationUpdateSchema>;
