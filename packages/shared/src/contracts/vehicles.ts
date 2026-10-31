import { z } from 'zod';
import { fiscalYearOf } from '../fiscal.js';
import { moneySchema } from '../money.js';
import { asciiDigits, optionalText, pagination, text } from '../schemas.js';
import { cleanText } from '../text.js';
import { documentHeaderSchema } from './finance.js';
import { isoDay, placeSchema } from './members.js';

// ---------------------------------------------------------------------------
// Vehicles (যানবাহন)
// ---------------------------------------------------------------------------

/** `vehicles.kind`: fixed keys, labels in i18n (`Vehicles.kind.*`). */
export const VEHICLE_KINDS = ['car', 'motorcycle', 'microbus', 'cng', 'bicycle', 'other'] as const;
export type VehicleKind = (typeof VEHICLE_KINDS)[number];

/**
 * The registration number for matching (`vehicles.reg_key`): English digits, no spaces, dashes,
 * dots or slashes, Latin letters in capitals. "ঢাকা মেট্রো-গ ১২-৩৪৫৬" and "ঢাকা মেট্রো গ 12 3456" match.
 */
export const regNoKey = (regNo: string): string =>
  asciiDigits(cleanText(regNo))
    .replace(/[\s\-‐-―.,/\\_]/g, '')
    .toUpperCase();

/** A registration number as typed; it must keep at least two letters or digits once cleaned. */
const regNo = text(40).refine((value) => regNoKey(value).length >= 2, 'invalid_reg_no');

/**
 * `POST /vehicles`, for a person or an organisation (exactly one). The person must currently own,
 * rent or live in the unit, the organisation own or rent it (409 `vehicle_person_not_at_unit`);
 * the number must not be on file already (409 `vehicle_exists`).
 */
export const vehicleCreateSchema = z
  .object({
    regNo,
    kind: z.enum(VEHICLE_KINDS),
    make: optionalText(60),
    colour: optionalText(40),
    unitId: z.uuid(),
    personId: z.uuid().optional(),
    organisationId: z.uuid().optional(),
    note: optionalText(500),
  })
  .refine((input) => !input.personId !== !input.organisationId, { message: 'one_holder', path: ['personId'] });
export type VehicleCreateInput = z.infer<typeof vehicleCreateSchema>;

/** `PATCH /vehicles/:id` (not once removed). Moving to another unit needs `vehicles.edit` there too. A new person or organisation replaces the other. */
export const vehicleUpdateSchema = z
  .object({
    regNo: regNo.optional(),
    kind: z.enum(VEHICLE_KINDS).optional(),
    make: optionalText(60).optional(),
    colour: optionalText(40).optional(),
    unitId: z.uuid().optional(),
    personId: z.uuid().optional(),
    organisationId: z.uuid().optional(),
    note: optionalText(500).optional(),
  })
  .refine((input) => !(input.personId && input.organisationId), { message: 'one_holder', path: ['personId'] });
export type VehicleUpdateInput = z.infer<typeof vehicleUpdateSchema>;

/** `POST /vehicles/:id/remove`: sold, gone, or entered by mistake. Revokes its sticker and frees its slot. */
export const vehicleRemoveSchema = z.object({ reason: text(300) });
export type VehicleRemoveInput = z.infer<typeof vehicleRemoveSchema>;

/** Which vehicles a list shows: still on file (the default), removed, or all. */
export const VEHICLE_VIEWS = ['active', 'removed', 'all'] as const;
export type VehicleView = (typeof VEHICLE_VIEWS)[number];

/** `GET /vehicles`: in the caller's `vehicles.view` area. */
export const vehicleListQuery = pagination.extend({
  /** Registration number (either digit form, spaces and dashes ignored), make, or the person's or organisation's name. */
  q: z.string().transform(cleanText).pipe(z.string().max(100)).optional(),
  view: z.enum(VEHICLE_VIEWS).default('active'),
  kind: z.enum(VEHICLE_KINDS).optional(),
  locationId: z.uuid().optional(),
  unitId: z.uuid().optional(),
  personId: z.uuid().optional(),
  organisationId: z.uuid().optional(),
});
export type VehicleListQuery = z.infer<typeof vehicleListQuery>;

/** `GET /vehicles/lookup?plate=`: a guard's check. Gives only the unit, the sticker and its validity. */
export const vehicleLookupQuery = z.object({
  plate: z.string().transform(cleanText).pipe(z.string().min(2).max(40)),
});
export type VehicleLookupQuery = z.infer<typeof vehicleLookupQuery>;

/** `GET /vehicles/unit-people?unitId=`: who a vehicle at the unit may belong to. */
export const vehicleUnitPeopleQuery = z.object({ unitId: z.uuid() });
export type VehicleUnitPeopleQuery = z.infer<typeof vehicleUnitPeopleQuery>;

/** How a person is at the unit now: owns it (or a place above it), rents it, or lives in it. */
export const UNIT_TIES = ['owner', 'renter', 'resident'] as const;
export type UnitTie = (typeof UNIT_TIES)[number];

/** Lookup matches at most this many vehicles. */
export const VEHICLE_LOOKUP_LIMIT = 10;

// ---------------------------------------------------------------------------
// Stickers
// ---------------------------------------------------------------------------

export const STICKER_STATUSES = ['active', 'revoked', 'replaced'] as const;
export type StickerStatus = (typeof STICKER_STATUSES)[number];

/** Why a sticker was issued: a first one, next year's, or one in place of a lost or damaged one. */
export const STICKER_REASONS = ['new', 'renewal', 'replacement'] as const;
export type StickerReason = (typeof STICKER_REASONS)[number];

/** What a list shows: the stored status, with `expired` for an active sticker past its last day. */
export const STICKER_STATES = ['active', 'expired', 'revoked', 'replaced'] as const;
export type StickerState = (typeof STICKER_STATES)[number];

/** Expired is derived, never stored. `today` and `validUntil` are Dhaka days (`YYYY-MM-DD`). */
export const stickerStateOf = (status: StickerStatus, validUntil: string, today: string): StickerState =>
  status === 'active' && validUntil < today ? 'expired' : status;

/** Valid to the end of the calendar year (the default) or the society's fiscal year. */
export const STICKER_VALIDITIES = ['calendar', 'fiscal'] as const;
export type StickerValidity = (typeof STICKER_VALIDITIES)[number];

/** The `society_settings` key holding `StickerSettings`. */
export const VEHICLE_STICKERS_KEY = 'vehicle_stickers';

/** The start of every sticker number; letters (Bangla or English) and digits only. */
const stickerPrefix = z
  .string()
  .transform(cleanText)
  .pipe(z.string().regex(/^[A-Za-z0-9ঀ-৿]{1,10}$/, 'invalid_prefix'));

/**
 * `PUT /vehicles/settings` (`settings.edit`). `fee` null: stickers are free. Otherwise issuing,
 * renewing or replacing one bills the unit `amount` under the charge type. Changes apply to
 * stickers issued afterwards.
 */
export const stickerSettingsSchema = z
  .object({
    prefix: stickerPrefix,
    validity: z.enum(STICKER_VALIDITIES),
    fee: z.object({ chargeTypeId: z.uuid(), amount: moneySchema }).nullable(),
  })
  .strict();
export type StickerSettings = z.infer<typeof stickerSettingsSchema>;

/** Until the office saves its own: free, valid to 31 December, numbered `STK-0001`. */
export const DEFAULT_STICKER_SETTINGS: StickerSettings = { prefix: 'STK', validity: 'calendar', fee: null };

/** The saved setting over the defaults; anything missing or broken falls back to the default. */
export function stickerSettingsOf(value: unknown): StickerSettings {
  const saved = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const shape = stickerSettingsSchema.shape;
  const prefix = shape.prefix.safeParse(saved.prefix);
  const validity = shape.validity.safeParse(saved.validity);
  const fee = shape.fee.safeParse(saved.fee);
  return {
    prefix: prefix.success ? prefix.data : DEFAULT_STICKER_SETTINGS.prefix,
    validity: validity.success ? validity.data : DEFAULT_STICKER_SETTINGS.validity,
    fee: fee.success ? fee.data : DEFAULT_STICKER_SETTINGS.fee,
  };
}

/** `STK-0001`; numbers past the padding just grow longer. */
export const formatStickerNo = (prefix: string, no: number): string => `${prefix}-${String(no).padStart(4, '0')}`;

const addDays = (day: string, days: number): string => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** The last day of the sticker year `day` falls in. */
export function stickerYearEnd(day: string, validity: StickerValidity, fiscalStartMonth: number): string {
  return validity === 'calendar' ? `${day.slice(0, 4)}-12-31` : fiscalYearOf(day, fiscalStartMonth).end;
}

/**
 * A new sticker's last day: the end of this sticker year, or of the next one when the office
 * issues late in the year for the year ahead (`nextYear`).
 */
export function stickerValidUntil(today: string, validity: StickerValidity, fiscalStartMonth: number, nextYear = false): string {
  const end = stickerYearEnd(today, validity, fiscalStartMonth);
  return nextYear ? stickerYearEnd(addDays(end, 1), validity, fiscalStartMonth) : end;
}

/**
 * A renewal's last day: the sticker year after the old one's, or this year's when the old one
 * ran out more than a year ago. Never earlier than the old sticker's own last day.
 */
export function renewalValidUntil(oldValidUntil: string, today: string, validity: StickerValidity, fiscalStartMonth: number): string {
  const next = addDays(oldValidUntil, 1);
  return stickerYearEnd(next > today ? next : today, validity, fiscalStartMonth);
}

/** `POST /stickers`: a vehicle's first sticker, or a new one after the last was revoked. */
export const stickerIssueSchema = z.object({
  vehicleId: z.uuid(),
  /** For the coming sticker year rather than this one. */
  nextYear: z.boolean().default(false),
});
export type StickerIssueInput = z.infer<typeof stickerIssueSchema>;

/** At most this many stickers renewed in one request. */
export const STICKER_RENEW_LIMIT = 500;

/** `POST /stickers/renew`: next year's sticker for each (active or expired), with new numbers. */
export const stickerRenewSchema = z.object({
  stickerIds: z.array(z.uuid()).min(1).max(STICKER_RENEW_LIMIT),
});
export type StickerRenewInput = z.infer<typeof stickerRenewSchema>;

/** `POST /stickers/:id/revoke`. */
export const stickerRevokeSchema = z.object({ reason: text(300) });
export type StickerRevokeInput = z.infer<typeof stickerRevokeSchema>;

/** `GET /stickers`: in the caller's `vehicles.view` area. */
export const stickerListQuery = pagination.extend({
  /** Sticker number or the vehicle's registration number. */
  q: z.string().transform(cleanText).pipe(z.string().max(100)).optional(),
  state: z.enum(STICKER_STATES).optional(),
  /** Stickers whose last day is on or before this day (the ones to renew). */
  validUntilBy: z.iso.date().optional(),
  locationId: z.uuid().optional(),
});
export type StickerListQuery = z.infer<typeof stickerListQuery>;

// ---------------------------------------------------------------------------
// Vehicle responses
// ---------------------------------------------------------------------------

const instant = z.iso.datetime({ offset: true });

/** A vehicle's latest sticker as lists show it; `state` derives expired from the last day. */
export const stickerRefSchema = z.object({
  id: z.uuid(),
  stickerNo: z.string(),
  validUntil: isoDay,
  state: z.enum(STICKER_STATES),
});
export type StickerRef = z.infer<typeof stickerRefSchema>;

export const vehicleRowSchema = z.object({
  id: z.uuid(),
  regNo: z.string(),
  kind: z.enum(VEHICLE_KINDS),
  make: z.string().nullable(),
  colour: z.string().nullable(),
  /** The unit it belongs to. */
  place: placeSchema,
  /** Who it belongs to: a person or an organisation, never both. */
  person: z.object({ id: z.uuid(), name: z.string(), nameEn: z.string().nullable() }).nullable(),
  organisation: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  /** The latest sticker (in force, expired, revoked or replaced); null when it never had one. */
  sticker: stickerRefSchema.nullable(),
  removedAt: instant.nullable(),
  createdAt: instant,
});
export type VehicleRow = z.infer<typeof vehicleRowSchema>;

export const vehicleListSchema = z.object({
  items: z.array(vehicleRowSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  /** In the caller's area, filters ignored: vehicles on file, and those of them without a sticker in force today. */
  counts: z.object({ active: z.number().int().min(0), noSticker: z.number().int().min(0) }),
  can: z.object({ create: z.boolean() }),
});
export type VehicleList = z.infer<typeof vehicleListSchema>;

export const vehicleDetailSchema = vehicleRowSchema.extend({
  note: z.string().nullable(),
  removeReason: z.string().nullable(),
  can: z.object({ edit: z.boolean(), remove: z.boolean() }),
});
export type VehicleDetail = z.infer<typeof vehicleDetailSchema>;

/** A guard's answer: the number on file, its unit, and its sticker in force or last one; nothing about people. */
export const vehicleLookupSchema = z.object({
  items: z.array(
    z.object({
      regNo: z.string(),
      kind: z.enum(VEHICLE_KINDS),
      place: placeSchema,
      sticker: stickerRefSchema.omit({ id: true }).nullable(),
    }),
  ),
});
export type VehicleLookup = z.infer<typeof vehicleLookupSchema>;

export const vehicleUnitPeopleSchema = z.object({
  items: z.array(z.object({ id: z.uuid(), name: z.string(), nameEn: z.string().nullable(), ties: z.array(z.enum(UNIT_TIES)) })),
});
export type VehicleUnitPeople = z.infer<typeof vehicleUnitPeopleSchema>;

/** Who a vehicle at the unit may belong to: the people, and the organisations that own or rent it. */
export const vehicleUnitHoldersSchema = vehicleUnitPeopleSchema.extend({
  organisations: z.array(z.object({ id: z.uuid(), name: z.string(), ties: z.array(z.enum(UNIT_TIES)) })),
});
export type VehicleUnitHolders = z.infer<typeof vehicleUnitHoldersSchema>;

// ---------------------------------------------------------------------------
// Parking slots
// ---------------------------------------------------------------------------

/** `POST /parking`. Codes are unique per place among slots in use (409 `parking_code_taken`). */
export const parkingSlotCreateSchema = z.object({
  locationId: z.uuid(),
  code: text(20),
  note: optionalText(300),
});
export type ParkingSlotCreateInput = z.infer<typeof parkingSlotCreateSchema>;

/** `PATCH /parking/:id` (not once removed). */
export const parkingSlotUpdateSchema = z.object({
  locationId: z.uuid().optional(),
  code: text(20).optional(),
  note: optionalText(300).optional(),
});
export type ParkingSlotUpdateInput = z.infer<typeof parkingSlotUpdateSchema>;

/** `POST /parking/:id/assign`: to a unit or one vehicle (never both), or free with both null. */
export const parkingAssignSchema = z
  .object({
    unitId: z.uuid().nullable().default(null),
    vehicleId: z.uuid().nullable().default(null),
  })
  .refine((input) => !(input.unitId && input.vehicleId), { message: 'one_assignee', path: ['vehicleId'] });
export type ParkingAssignInput = z.infer<typeof parkingAssignSchema>;

/** Which slots a list shows. */
export const PARKING_VIEWS = ['all', 'free', 'taken', 'removed'] as const;
export type ParkingView = (typeof PARKING_VIEWS)[number];

/** `GET /parking`: in the caller's `vehicles.view` area. */
export const parkingListQuery = pagination.extend({
  q: z.string().transform(cleanText).pipe(z.string().max(100)).optional(),
  view: z.enum(PARKING_VIEWS).default('all'),
  locationId: z.uuid().optional(),
});
export type ParkingListQuery = z.infer<typeof parkingListQuery>;

// ---------------------------------------------------------------------------
// Sticker and parking responses
// ---------------------------------------------------------------------------

export const stickerRowSchema = z.object({
  id: z.uuid(),
  stickerNo: z.string(),
  reason: z.enum(STICKER_REASONS),
  status: z.enum(STICKER_STATUSES),
  /** `status` with expired derived from the last day. */
  state: z.enum(STICKER_STATES),
  validUntil: isoDay,
  vehicle: z.object({ id: z.uuid(), regNo: z.string(), kind: z.enum(VEHICLE_KINDS), removed: z.boolean() }),
  /** The vehicle's unit. */
  place: placeSchema,
  /** The sticker this one took over from. */
  replaces: z.object({ id: z.uuid(), stickerNo: z.string() }).nullable(),
  /** The fee bill, when one was made. */
  invoice: z.object({ id: z.uuid(), invoiceNo: z.string() }).nullable(),
  issuedAt: instant,
  revokedAt: instant.nullable(),
  revokeReason: z.string().nullable(),
});
export type StickerRow = z.infer<typeof stickerRowSchema>;

export const stickerListSchema = z.object({
  items: z.array(stickerRowSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  /** In the caller's area, filters ignored: in force today, and active but past their last day. */
  counts: z.object({ active: z.number().int().min(0), expired: z.number().int().min(0) }),
  can: z.object({ issue: z.boolean(), export: z.boolean() }),
});
export type StickerList = z.infer<typeof stickerListSchema>;

/** `GET /stickers/csv`: the list's filters, every page. */
export const stickerCsvQuery = stickerListQuery.omit({ page: true, pageSize: true });
export type StickerCsvQuery = z.infer<typeof stickerCsvQuery>;

/** Why one sticker in a bulk renewal was left alone (the error code the single action would give). */
export const stickerRenewResultSchema = z.object({
  renewed: z.array(stickerRowSchema),
  skipped: z.array(z.object({ stickerId: z.uuid(), code: z.string() })),
});
export type StickerRenewResult = z.infer<typeof stickerRenewResultSchema>;

/** `GET /vehicles/settings`. */
export const stickerSettingsViewSchema = z.object({
  settings: z.object({
    prefix: z.string(),
    validity: z.enum(STICKER_VALIDITIES),
    fee: z.object({ chargeTypeId: z.uuid(), amount: z.string() }).nullable(),
  }),
  can: z.object({ edit: z.boolean() }),
});
export type StickerSettingsView = z.infer<typeof stickerSettingsViewSchema>;

/** At most this many stickers on one printed sheet request. */
export const STICKER_SHEET_LIMIT = 200;

/** `GET /stickers/sheet?ids=a,b,c`: stickers in force to print on A4. */
export const stickerSheetQuery = z.object({
  ids: z
    .string()
    .transform((value) => [...new Set(value.split(',').map((id) => id.trim()).filter(Boolean))])
    .pipe(z.array(z.uuid()).min(1).max(STICKER_SHEET_LIMIT)),
});
export type StickerSheetQuery = z.infer<typeof stickerSheetQuery>;

export const stickerSheetSchema = z.object({
  header: documentHeaderSchema,
  items: z.array(
    z.object({ stickerNo: z.string(), regNo: z.string(), kind: z.enum(VEHICLE_KINDS), place: placeSchema, validUntil: isoDay }),
  ),
});
export type StickerSheet = z.infer<typeof stickerSheetSchema>;

/** Who holds a slot: a unit, one vehicle, or nobody. */
export const parkingAssigneeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unit'), place: placeSchema }),
  z.object({ kind: z.literal('vehicle'), id: z.uuid(), regNo: z.string(), place: placeSchema }),
]);
export type ParkingAssignee = z.infer<typeof parkingAssigneeSchema>;

export const parkingSlotSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  note: z.string().nullable(),
  place: placeSchema,
  assignee: parkingAssigneeSchema.nullable(),
  removedAt: instant.nullable(),
  can: z.object({ edit: z.boolean(), remove: z.boolean() }),
});
export type ParkingSlot = z.infer<typeof parkingSlotSchema>;

export const parkingListSchema = z.object({
  items: z.array(parkingSlotSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  /** In the caller's area, filters ignored: slots in use, and those of them free. */
  counts: z.object({ slots: z.number().int().min(0), free: z.number().int().min(0) }),
  can: z.object({ create: z.boolean() }),
});
export type ParkingList = z.infer<typeof parkingListSchema>;
