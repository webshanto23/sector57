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
 * moving out, else `owner_occupied` while a resident of the owner's household (no tenancy) lives
 * there, else `vacant`, owned or not.
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
  /** Places at this level can have owners (plots, buildings, units; not sectors, blocks or roads). */
  canOwn: z.boolean(),
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
    .array(z.object({ id: z.uuid().nullable(), nameBn: text(50), nameEn: optionalText(50), canOwn: z.boolean() }))
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
  /** Its level can have owners. */
  canOwn: z.boolean(),
  isActive: z.boolean(),
  /** Direct children. */
  childCount: z.number().int().min(0),
  /** Units anywhere below. */
  unitCount: z.number().int().min(0),
  /** A unit covering more storeys than its own (a duplex): the names of the others. Empty otherwise. */
  alsoOn: z.array(z.string()),
  /** A unit's type (code and name); null for other locations. */
  unitType: z.object({ code: z.string(), nameBn: z.string(), nameEn: z.string().nullable() }).nullable(),
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
  /** Units that live on a neighbouring storey and cover this one too, with the name of their own storey. */
  alsoHere: z.array(locationNodeSchema.extend({ homeName: z.string() })),
  can: z.object({
    /** Add locations here (under this one, or at the top). */
    create: z.boolean(),
    /** Add units under this location. */
    createUnit: z.boolean(),
    edit: z.boolean(),
    delete: z.boolean(),
    /** Remove units here (the place page's "Remove selected" also needs this for units). */
    deleteUnit: z.boolean(),
  }),
});
export type LocationView = z.infer<typeof locationViewSchema>;

export const LOCATION_SEARCH_PAGE_SIZE = 48;

/**
 * `GET /locations/search`: places (never units) inside `under` (or the caller's whole
 * tree) at one level and/or matching `q` (name or holding code, either digit form).
 */
export const locationSearchQuery = z.object({
  under: z.uuid().optional(),
  levelId: z.uuid().optional(),
  q: z.string().transform(cleanText).pipe(z.string().max(100)).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type LocationSearchQuery = z.infer<typeof locationSearchQuery>;

/** A name as typed, with the optional English form (people only; organisations have one name). */
export const partyNameSchema = z.object({ name: z.string(), nameEn: z.string().nullable() });
export type PartyName = z.infer<typeof partyNameSchema>;

/**
 * A search result: the map's card plus the names above it, top first (a single root left out),
 * and its current owners, largest share first (null where its level has no owners or the
 * caller may not view ownerships).
 */
export const locationHitSchema = locationNodeSchema.extend({ address: z.array(z.string()), owners: z.array(partyNameSchema).nullable() });
export type LocationHit = z.infer<typeof locationHitSchema>;

export const locationSearchSchema = z.object({
  items: z.array(locationHitSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});
export type LocationSearch = z.infer<typeof locationSearchSchema>;

/** `GET /locations/level-counts?under=`: places per level below `under`, in the caller's area (unit level left out). */
export const levelCountsQuery = z.object({ under: z.uuid().optional() });
export type LevelCountsQuery = z.infer<typeof levelCountsQuery>;
export const levelCountsSchema = z.object({
  items: z.array(z.object({ levelId: z.uuid(), count: z.number().int().min(0) })),
});
export type LevelCounts = z.infer<typeof levelCountsSchema>;

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

/**
 * `POST /locations/remove-many`: places and units picked on a place page, removed together,
 * all or none. A picked place goes with the units straight inside it (a floor with its flats).
 */
export const locationRemoveManySchema = z.object({
  ids: z
    .array(z.uuid())
    .min(1)
    .max(MAX_BULK_NAMES)
    .refine((ids) => new Set(ids).size === ids.length, 'duplicate_location'),
});
export type LocationRemoveManyInput = z.infer<typeof locationRemoveManySchema>;
export const locationRemoveManyResultSchema = z.object({ removed: z.number().int().min(1) });

/** Why a removal is refused (409 `remove_<problem>`, with the names in `details.names`); `in_use` comes from the records check. */
export const REMOVAL_PROBLEMS = ['has_places', 'joined'] as const;
export type RemovalProblem = (typeof REMOVAL_PROBLEMS)[number];

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

/** The letters typed for an "add many" or a building layout, one per grapheme (spaces and commas skipped). */
export const graphemes = (value: string) =>
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

/** A storey a unit covers. */
export const storeyRefSchema = z.object({ id: z.uuid(), name: z.string() });
export type StoreyRef = z.infer<typeof storeyRefSchema>;

/** `GET /units/:id`. */
export const unitDetailSchema = unitSummarySchema.extend({
  breadcrumb: z.array(crumbSchema),
  /** The other storeys it covers, besides its own: a duplex, made by combining units. */
  covers: z.array(storeyRefSchema),
  /** Combined into another unit (Step 37): that unit and the date. Such a unit is history only. */
  mergedInto: z.object({ id: z.uuid(), name: z.string(), on: z.iso.date() }).nullable(),
  /** `separate`: take this part back out of the unit it was joined into. */
  can: z.object({ edit: z.boolean(), delete: z.boolean(), separate: z.boolean() }),
});
export type UnitDetail = z.infer<typeof unitDetailSchema>;

export const UNIT_STATUSES = ['active', 'inactive'] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];
/** What a unit lacks: a current owner or a holding number anywhere in its chain, or a size. */
export const UNIT_MISSING = ['owner', 'code', 'size'] as const;
export type UnitMissing = (typeof UNIT_MISSING)[number];
/** Whether a current owner (at any level of the chain) is a current resident of the unit. */
export const OWNER_LIVES = ['here', 'elsewhere'] as const;
export type OwnerLives = (typeof OWNER_LIVES)[number];

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
  missing: z.enum(UNIT_MISSING).optional(),
  ownerLives: z.enum(OWNER_LIVES).optional(),
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
  /** Set when it was combined into another unit: shown as part of that one, not as an empty unit. */
  mergedInto: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  /** Names of the units combined into this one. */
  includes: z.array(z.string()),
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
