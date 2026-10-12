import { z } from 'zod';
import { pagination } from '../schemas.js';
import { cleanText } from '../text.js';
import { isoDay, OCCUPANT_RELATIONS, placeSchema } from './members.js';

/** Most residents one printed or exported directory lists; `truncated` says when there were more. */
export const DIRECTORY_EXPORT_LIMIT = 3000;

/**
 * `GET /directory`: who lives in units now (current household rows of owners' and renters'
 * households), in the caller's `members.view` area, ordered by address. `q` matches names,
 * phone or the unit's name, in either digit form.
 */
export const directoryQuery = pagination.extend({
  q: z.string().transform(cleanText).pipe(z.string().max(100)).optional(),
  areaId: z.uuid().optional(),
});
export type DirectoryQuery = z.infer<typeof directoryQuery>;

/** One resident. The national ID is never listed. */
export const directoryRowSchema = z.object({
  /** The household row (`occupants.id`). */
  id: z.uuid(),
  person: z.object({ id: z.uuid(), name: z.string(), nameEn: z.string().nullable(), phone: z.string().nullable(), photoUrl: z.string().nullable() }),
  relation: z.enum(OCCUPANT_RELATIONS),
  /** The owner's household or a renting one. */
  household: z.enum(['owner', 'renter']),
  /** Owns the unit, or a place above it, now. */
  isOwner: z.boolean(),
  /** Society member number, when they hold an active membership. */
  memberNo: z.number().int().nullable(),
  place: placeSchema,
  since: isoDay,
});
export type DirectoryRow = z.infer<typeof directoryRowSchema>;

export const directoryListSchema = z.object({
  items: z.array(directoryRowSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  /** Units with anyone living in them, and residents, in the caller's area (filters ignored). */
  counts: z.object({ units: z.number().int().min(0), residents: z.number().int().min(0) }),
});
export type DirectoryList = z.infer<typeof directoryListSchema>;

/** `GET /directory/print` and `/directory/csv`: everyone under one place (or the caller's whole area). */
export const directoryAllQuery = z.object({
  areaId: z.uuid().optional(),
  q: z.string().transform(cleanText).pipe(z.string().max(100)).optional(),
});
export type DirectoryAllQuery = z.infer<typeof directoryAllQuery>;

export const directoryPrintSchema = z.object({
  area: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  items: z.array(directoryRowSchema),
  truncated: z.boolean(),
});
export type DirectoryPrint = z.infer<typeof directoryPrintSchema>;
