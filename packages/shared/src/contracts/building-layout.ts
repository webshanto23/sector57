import { z } from 'zod';
import { bnDigits } from '../format.js';
import { optionalText, text } from '../schemas.js';
import { cleanText } from '../text.js';
import { BILL_TO, graphemes, MAX_BULK_NAMES, OCCUPANCIES, sizeSqftSchema, unitTypeCode } from './property.js';

/*
 * "Set up floors and units" (Step 37): a new building's floors and the units on each, from
 * a pattern, in one go. Floors take the level right below the building, units the unit level.
 * Exceptions (ground-floor shops, duplexes) are fixed afterwards.
 */

/** Most floors one set-up creates. */
export const MAX_LAYOUT_FLOORS = 100;

/** Stands for the floor number in a pattern. */
export const FLOOR_TOKEN = '{n}';
/** Stands for the unit's letter in a pattern. */
export const LETTER_TOKEN = '{letter}';

/** `POST /locations/:id/layout`. */
export const buildingLayoutSchema = z
  .object({
    floors: z.object({
      from: z.coerce.number().int().min(0).max(MAX_LAYOUT_FLOORS),
      to: z.coerce.number().int().min(0).max(MAX_LAYOUT_FLOORS),
      /** "{n} তলা", "Floor {n}". */
      pattern: text(60).refine((value) => value.includes(FLOOR_TOKEN), 'floor_token_missing'),
      /** Name for floor 0 instead of the pattern ("নিচ তলা"). */
      groundName: optionalText(60),
      /** Floor 0 gets units too (often it is parking). */
      groundHasUnits: z.boolean().default(true),
    }),
    units: z.object({
      /** One unit per letter on each floor ("ABC", "এবিসি"); empty: one unit per floor. */
      letters: z.string().max(30).default(''),
      /** "ফ্ল্যাট {n}{letter}". */
      pattern: text(80).refine((value) => value.includes(FLOOR_TOKEN), 'floor_token_missing'),
    }),
    /** Numbers in Bangla digits. */
    bangla: z.boolean().default(true),
    unitType: unitTypeCode,
    sizeSqft: sizeSqftSchema,
    billTo: z.enum(BILL_TO),
  })
  .refine((input) => input.floors.to >= input.floors.from, { message: 'range_reversed', path: ['floors', 'to'] })
  .refine((input) => letters(input).length < 2 || input.units.pattern.includes(LETTER_TOKEN), {
    message: 'letter_token_missing',
    path: ['units', 'pattern'],
  })
  .refine((input) => unitCount(input) <= MAX_BULK_NAMES, { message: 'too_many', path: ['units', 'letters'] })
  .refine((input) => new Set(expandLayout(input).map((floor) => floor.name)).size === input.floors.to - input.floors.from + 1, {
    message: 'duplicate_name',
    path: ['floors', 'groundName'],
  });
export type BuildingLayoutInput = z.infer<typeof buildingLayoutSchema>;

/** `POST /locations/:id/layout` response. */
export const buildingLayoutResultSchema = z.object({ floors: z.number().int().min(0), units: z.number().int().min(0) });
export type BuildingLayoutResult = z.infer<typeof buildingLayoutResultSchema>;

type LayoutShape = {
  floors: { from: number; to: number; pattern: string; groundName?: string | null; groundHasUnits: boolean };
  units: { letters: string; pattern: string };
  bangla: boolean;
};

const letters = (input: Pick<LayoutShape, 'units'>) => [...new Set(graphemes(input.units.letters))];

function unitCount(input: LayoutShape): number {
  const floors = input.floors.to - input.floors.from + 1 - (input.floors.from === 0 && !input.floors.groundHasUnits ? 1 : 0);
  return Math.max(0, floors) * Math.max(1, letters(input).length);
}

/** The floors, bottom first, each with its unit names. Pure: the form previews it and the API saves it. */
export function expandLayout(input: LayoutShape): { number: number; name: string; units: string[] }[] {
  const marks = letters(input);
  const result: { number: number; name: string; units: string[] }[] = [];
  for (let number = input.floors.from; number <= input.floors.to; number++) {
    const digits = input.bangla ? bnDigits(number) : String(number);
    const ground = number === 0;
    const name = ground && input.floors.groundName ? input.floors.groundName : input.floors.pattern.replaceAll(FLOOR_TOKEN, digits);
    const units =
      ground && !input.floors.groundHasUnits
        ? []
        : (marks.length > 0 ? marks : ['']).map((mark) => input.units.pattern.replaceAll(FLOOR_TOKEN, digits).replaceAll(LETTER_TOKEN, mark));
    result.push({ number, name: cleanText(name), units: units.map(cleanText) });
  }
  return result;
}

// ---------------------------------------------------------------------------
// The building grid: floors as rows, their units as cells
// ---------------------------------------------------------------------------

export const buildingGridUnitSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  unitType: unitTypeCode,
  occupancy: z.enum(OCCUPANCIES),
  isActive: z.boolean(),
  /** Other storeys it covers (a duplex). */
  alsoOn: z.array(z.string()),
  /** Set when it was combined into another unit: shown as part of that one, not as its own flat. */
  mergedInto: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  /** Names of the units combined into this one. */
  includes: z.array(z.string()),
});
export type BuildingGridUnit = z.infer<typeof buildingGridUnitSchema>;

/** `GET /locations/:id/grid`: a building's floors in name order, each with its own units. */
export const buildingGridSchema = z.object({
  floors: z.array(z.object({ id: z.uuid(), name: z.string(), units: z.array(buildingGridUnitSchema) })),
  /** The caller may change the units' type here. */
  canEdit: z.boolean(),
});
export type BuildingGrid = z.infer<typeof buildingGridSchema>;

/** `POST /units/bulk-type`: one type for many units (ground-floor shops), all or none. */
export const unitTypeBulkSchema = z.object({
  unitIds: z
    .array(z.uuid())
    .min(1)
    .max(MAX_BULK_NAMES)
    .refine((ids) => new Set(ids).size === ids.length, 'duplicate_unit'),
  unitType: unitTypeCode,
});
export type UnitTypeBulkInput = z.infer<typeof unitTypeBulkSchema>;

// ---------------------------------------------------------------------------
// Combining units (3A + 4A into one duplex)
// ---------------------------------------------------------------------------

/** Most units one combine retires. */
export const MAX_COMBINE = 20;

/**
 * `POST /units/combine`: `keepId` carries on (and covers the others' floors); each of
 * `mergeIds` becomes inactive, "merged into" the kept unit, its history kept.
 */
export const unitCombineSchema = z
  .object({
    keepId: z.uuid(),
    mergeIds: z
      .array(z.uuid())
      .min(1)
      .max(MAX_COMBINE)
      .refine((ids) => new Set(ids).size === ids.length, 'duplicate_unit'),
  })
  .refine((input) => !input.mergeIds.includes(input.keepId), { message: 'duplicate_unit', path: ['mergeIds'] });
export type UnitCombineInput = z.infer<typeof unitCombineSchema>;

/** Why a combine is refused, in the order they are checked. */
export const COMBINE_PROBLEMS = [
  'unit_inactive',
  'not_side_by_side',
  'owners_differ',
  'open_bills',
  'open_tenancy',
  'occupants',
  'vehicles',
] as const;
export type CombineProblem = (typeof COMBINE_PROBLEMS)[number];
