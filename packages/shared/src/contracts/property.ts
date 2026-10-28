import { z } from 'zod';
import { bnDigits } from '../format.js';
import { asciiDigits, optionalText, pagination, text } from '../schemas.js';
import { cleanText } from '../text.js';

/**
 * `units.unit_type`: the code of one of the society's `unit_types`. New societies start with
 * residential, shop, office, warehouse and other; names come from `GET /unit-types`.
 */
export const unitTypeCode = z.string().regex(/^[a-z0-9_]{1,40}$/, 'invalid_unit_type');
export type UnitType = string;

/** Most unit types one society keeps. */
export const MAX_UNIT_TYPES = 50;

/** `units.bill_to`: who gets the unit's bills. */
export const BILL_TO = ['owner', 'renter'] as const;
export type BillTo = (typeof BILL_TO)[number];

/**
 * `units.occupancy`, derived by the API (never typed in): `rented` while a tenancy is active or
 * moving out, else `owner_occupied` when the unit or a location above it has a current owner,
 * else `vacant`.
 */
export const OCCUPANCIES = ['owner_occupied', 'rented', 'vacant'] as const;
export type Occupancy = (typeof OCCUPANCIES)[number];

const oneOf =
  <T extends readonly string[]>(values: T, fallback: T[number]) =>
  (value: string): T[number] =>
    (values as readonly string[]).includes(value) ? (value as T[number]) : fallback;
export const toBillTo = oneOf(BILL_TO, 'owner');
export const toOccupancy = oneOf(OCCUPANCIES, 'vacant');

/** Most names one bulk add creates. */
export const MAX_BULK_NAMES = 300;
const MAX_LEVELS = 10;

const locationName = text(100);
const locationCode = optionalText(50);

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

/** One level of the tree (`location_levels`), with how many locations use it. */
export const locationLevelSchema = z.object({
  id: z.uuid(),
  depth: z.number().int().min(1),
  nameBn: z.string(),
  nameEn: z.string().nullable(),
  isUnitLevel: z.boolean(),
  locationCount: z.number().int().min(0),
});
export type LocationLevel = z.infer<typeof locationLevelSchema>;

/**
 * `PUT /location-levels`: the whole list, top level first. The last level always
 * holds the units. A new level has no `id`. Levels in use can be renamed but not
 * removed or put in a different order among themselves.
 */
export const levelsInputSchema = z.object({
  levels: z
    .array(z.object({ id: z.uuid().nullable(), nameBn: text(50), nameEn: optionalText(50) }))
    .min(2)
    .max(MAX_LEVELS)
    .superRefine((levels, ctx) => {
      const seen = new Set<string>();
      levels.forEach((level, index) => {
        if (seen.has(level.nameBn)) ctx.addIssue({ code: 'custom', message: 'duplicate_name', path: [index, 'nameBn'] });
        seen.add(level.nameBn);
      });
      const ids = levels.flatMap((level) => (level.id ? [level.id] : []));
      if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'duplicate_level' });
    }),
});
export type LevelsInput = z.infer<typeof levelsInputSchema>;

/** One of the society's unit types (`unit_types`), with how many units and charge schedules use it. */
export const unitTypeSchema = z.object({
  id: z.uuid(),
  code: unitTypeCode,
  nameBn: z.string(),
  nameEn: z.string().nullable(),
  unitCount: z.number().int().min(0),
  scheduleCount: z.number().int().min(0),
});
export type UnitTypeItem = z.infer<typeof unitTypeSchema>;

/**
 * `PUT /unit-types`: the whole list in display order. A new type has no `id`. A type that a
 * unit or a charge schedule uses can be renamed but not removed.
 */
export const unitTypesInputSchema = z.object({
  types: z
    .array(z.object({ id: z.uuid().nullable(), nameBn: text(50), nameEn: optionalText(50) }))
    .min(1)
    .max(MAX_UNIT_TYPES)
    .superRefine((types, ctx) => {
      const seen = new Set<string>();
      types.forEach((type, index) => {
        if (seen.has(type.nameBn)) ctx.addIssue({ code: 'custom', message: 'duplicate_name', path: [index, 'nameBn'] });
        seen.add(type.nameBn);
      });
      const ids = types.flatMap((type) => (type.id ? [type.id] : []));
      if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'duplicate_type' });
    }),
});
export type UnitTypesInput = z.infer<typeof unitTypesInputSchema>;

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

/** One location in the tree browser. Counts cover everything under it. */
export const locationNodeSchema = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  name: z.string(),
  code: z.string().nullable(),
  levelId: z.uuid(),
  depth: z.number().int(),
  levelBn: z.string(),
  levelEn: z.string().nullable(),
  /** A unit (flat, shop, office): managed on the units pages. */
  isUnit: z.boolean(),
  isActive: z.boolean(),
  /** Direct children. */
  childCount: z.number().int().min(0),
  /** Units anywhere below. */
  unitCount: z.number().int().min(0),
});
export type LocationNode = z.infer<typeof locationNodeSchema>;

/** One step of a breadcrumb. `open` is false above the caller's area: shown, not linked. */
export const crumbSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  levelBn: z.string(),
  levelEn: z.string().nullable(),
  open: z.boolean(),
});
export type Crumb = z.infer<typeof crumbSchema>;

/**
 * `GET /locations` (the top: whole-society roots, or the caller's areas) and
 * `GET /locations/:id` (one location, its ancestors and its children). `can` is what
 * the caller may do here; the API checks every change again.
 */
export const locationViewSchema = z.object({
  location: locationNodeSchema.nullable(),
  breadcrumb: z.array(crumbSchema),
  children: z.array(locationNodeSchema),
  can: z.object({
    /** Add locations here (under this one, or at the top). */
    create: z.boolean(),
    /** Add units under this location. */
    createUnit: z.boolean(),
    edit: z.boolean(),
    delete: z.boolean(),
  }),
});
export type LocationView = z.infer<typeof locationViewSchema>;

/** `POST /locations`. `parentId` null adds a top-level location. Units are added through `/units`. */
export const locationCreateSchema = z.object({
  parentId: z.uuid().nullable(),
  levelId: z.uuid(),
  name: locationName,
  code: locationCode,
});
export type LocationCreateInput = z.infer<typeof locationCreateSchema>;

/** `PATCH /locations/:id`. Only the fields sent change. */
export const locationUpdateSchema = z.object({
  name: locationName.optional(),
  code: locationCode.optional(),
  isActive: z.boolean().optional(),
});
export type LocationUpdateInput = z.infer<typeof locationUpdateSchema>;

const bulkNames = z
  .array(locationName)
  .min(1)
  .max(MAX_BULK_NAMES)
  .refine((names) => new Set(names).size === names.length, 'duplicate_name');

/** `POST /locations/bulk`: many locations of one level under one parent, all or none. */
export const locationBulkSchema = z.object({
  parentId: z.uuid().nullable(),
  levelId: z.uuid(),
  names: bulkNames,
});
export type LocationBulkInput = z.infer<typeof locationBulkSchema>;

/** `POST /locations/bulk` and `POST /units/bulk` response. */
export const bulkResultSchema = z.object({ created: z.number().int().min(0) });
export type BulkResult = z.infer<typeof bulkResultSchema>;

// ---------------------------------------------------------------------------
// Name ranges (the "add many" generator)
// ---------------------------------------------------------------------------

/**
 * A run of names: `prefix` + each number from `from` to `to` (+ each letter, if any).
 * `Road ` 1–3 gives Road 1, Road 2, Road 3; `Flat ` 1–2 with letters `AB` gives
 * Flat 1A, Flat 1B, Flat 2A, Flat 2B. Numbers use Bangla digits when `bangla` is set.
 */
export const nameRangeSchema = z
  .object({
    prefix: z.string().max(50).default(''),
    from: z.coerce.number().int().min(0).max(9999),
    to: z.coerce.number().int().min(0).max(9999),
    letters: z.string().max(30).default(''),
    bangla: z.boolean().default(false),
  })
  .refine((range) => range.to >= range.from, { message: 'range_reversed', path: ['to'] })
  .refine((range) => expandCount(range) <= MAX_BULK_NAMES, { message: 'too_many', path: ['to'] });
export type NameRange = z.infer<typeof nameRangeSchema>;

const graphemes = (value: string) =>
  [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)]
    .map((part) => part.segment)
    .filter((part) => /\S/u.test(part) && part !== ',');

function expandCount(range: { from: number; to: number; letters: string }): number {
  const letters = Math.max(1, new Set(graphemes(range.letters)).size);
  return Math.max(0, range.to - range.from + 1) * letters;
}

/** The names a range stands for, in order, NFC and trimmed. */
export function expandNames(range: NameRange): string[] {
  const letters = [...new Set(graphemes(range.letters))];
  const names: string[] = [];
  for (let number = range.from; number <= range.to; number++) {
    const digits = range.bangla ? bnDigits(number) : String(number);
    for (const letter of letters.length > 0 ? letters : ['']) names.push(cleanText(`${range.prefix}${digits}${letter}`));
  }
  return names;
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/** Floor area in square feet, as a decimal string (`numeric(10,2)`); Bangla digits allowed. Blank is null. */
export const sizeSqftSchema = z
  .string()
  .nullish()
  .transform((value) => (value == null ? null : asciiDigits(value).replace(/,/g, '').trim() || null))
  .pipe(
    z
      .string()
      .regex(/^\d{1,8}(\.\d{1,2})?$/, 'invalid_size')
      .nullable(),
  );

const unitFields = {
  unitType: unitTypeCode,
  sizeSqft: sizeSqftSchema,
  billTo: z.enum(BILL_TO),
};

/** `POST /units`: a unit under a location (any level above the unit level). */
export const unitCreateSchema = z.object({
  parentId: z.uuid(),
  name: locationName,
  code: locationCode,
  ...unitFields,
});
export type UnitCreateInput = z.infer<typeof unitCreateSchema>;

/** `PATCH /units/:id`. Only the fields sent change. */
export const unitUpdateSchema = z.object({
  name: locationName.optional(),
  code: locationCode.optional(),
  isActive: z.boolean().optional(),
  unitType: unitFields.unitType.optional(),
  sizeSqft: sizeSqftSchema.optional(),
  billTo: unitFields.billTo.optional(),
});
export type UnitUpdateInput = z.infer<typeof unitUpdateSchema>;

/** `POST /units/bulk`: many units with the same facts under one parent, all or none. */
export const unitBulkSchema = z.object({
  parentId: z.uuid(),
  names: bulkNames,
  unitType: unitFields.unitType,
  sizeSqft: sizeSqftSchema,
  billTo: unitFields.billTo,
});
export type UnitBulkInput = z.infer<typeof unitBulkSchema>;

/** One unit in the list. `address` is the names above it, top first (the society's single root is left out). */
export const unitSummarySchema = z.object({
  id: z.uuid(),
  parentId: z.uuid(),
  name: z.string(),
  code: z.string().nullable(),
  address: z.array(z.string()),
  unitType: unitTypeCode,
  sizeSqft: z.string().nullable(),
  billTo: z.enum(BILL_TO),
  occupancy: z.enum(OCCUPANCIES),
  isActive: z.boolean(),
});
export type UnitSummary = z.infer<typeof unitSummarySchema>;

/** `GET /units/:id`. */
export const unitDetailSchema = unitSummarySchema.extend({
  breadcrumb: z.array(crumbSchema),
  can: z.object({ edit: z.boolean(), delete: z.boolean() }),
});
export type UnitDetail = z.infer<typeof unitDetailSchema>;

export const UNIT_STATUSES = ['active', 'inactive'] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

/**
 * `GET /units` query. `q` matches name or holding code (Bangla or ASCII digits), and the
 * name or phone of an owner at any level or the renter the caller may see; `areaId` keeps units under that location.
 */
export const unitListQuery = pagination.extend({
  q: z.string().transform(cleanText).pipe(z.string().max(100)).optional(),
  areaId: z.uuid().optional(),
  unitType: unitTypeCode.optional(),
  occupancy: z.enum(OCCUPANCIES).optional(),
  billTo: z.enum(BILL_TO).optional(),
  status: z.enum(UNIT_STATUSES).optional(),
});
export type UnitListQuery = z.infer<typeof unitListQuery>;

/** `GET /units/areas` query: the areas under `parentId`, or the caller's top areas. */
export const unitAreasQuery = z.object({ parentId: z.uuid().optional() });
export type UnitAreasQuery = z.infer<typeof unitAreasQuery>;

/** An area (not a unit) to narrow the units list to. */
export const unitAreaSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  levelBn: z.string(),
  levelEn: z.string().nullable(),
  unitCount: z.number().int().min(0),
});
export type UnitArea = z.infer<typeof unitAreaSchema>;

/**
 * `GET /units/areas`, for the units list's area picker with only the `units` permission:
 * the chosen area, its ancestors (`open` false above the caller's area) and the areas one level down.
 */
export const unitAreasSchema = z.object({
  area: unitAreaSchema.nullable(),
  breadcrumb: z.array(crumbSchema),
  children: z.array(unitAreaSchema),
});
export type UnitAreas = z.infer<typeof unitAreasSchema>;

/** Units by occupancy for the list's filters (all occupancies, whatever `occupancy` is). */
export const unitCountsSchema = z.object({
  total: z.number().int().min(0),
  owner_occupied: z.number().int().min(0),
  rented: z.number().int().min(0),
  vacant: z.number().int().min(0),
});
export type UnitCounts = z.infer<typeof unitCountsSchema>;

/** A name as typed, with the optional English form (people only; organisations have one name). */
export const partyNameSchema = z.object({ name: z.string(), nameEn: z.string().nullable() });
export type PartyName = z.infer<typeof partyNameSchema>;

/** The current owners at one location in a unit's chain: the unit itself, or a building, plot ... above it. */
export const unitOwnerLevelSchema = z.object({
  locationId: z.uuid(),
  /** The unit's own owners, not a level above. */
  isUnit: z.boolean(),
  levelBn: z.string(),
  levelEn: z.string().nullable(),
  owners: z.array(partyNameSchema).min(1),
});
export type UnitOwnerLevel = z.infer<typeof unitOwnerLevelSchema>;

/**
 * One row of `GET /units`. `owners` lists every level of the chain that has a current
 * owner, nearest first (the first is who the bills go to); `renters` is the active or
 * moving-out tenancy. Each is null when the caller may not view ownerships (tenancies) there.
 */
export const unitListItemSchema = unitSummarySchema.extend({
  owners: z.array(unitOwnerLevelSchema).nullable(),
  renters: z.array(partyNameSchema).nullable(),
});
export type UnitListItem = z.infer<typeof unitListItemSchema>;

/** `GET /units` response. */
export const unitListSchema = z.object({
  items: z.array(unitListItemSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  counts: unitCountsSchema,
});
export type UnitList = z.infer<typeof unitListSchema>;

/** Both digit forms of a search term, so "4B" also finds "৪B" and the other way round. */
export function digitVariants(term: string): string[] {
  return [...new Set([term, asciiDigits(term), bnDigits(term)])];
}
