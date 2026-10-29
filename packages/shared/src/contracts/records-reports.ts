import { z } from 'zod';
import { isoDay, MEMBERSHIP_STATUSES, RENTER_TYPES, TENANCY_STATUSES } from './members.js';
import { OCCUPANCIES } from './property.js';

const crumb = z.object({ id: z.uuid(), name: z.string() });

/** Whole percent of `part` in `whole` (rounded down), 0 when `whole` is zero. */
export const sharePercent = (part: number, whole: number): number => (whole <= 0 ? 0 : Math.floor((part * 100) / whole));

// ---------------------------------------------------------------------------
// Occupancy by area
// ---------------------------------------------------------------------------

/**
 * `GET /reports/occupancy` (`units.view`, in the caller's area): active units per place directly
 * under `parentId`, by derived occupancy. Without `parentId`: under the society's one top-level
 * place, or the top-level places themselves when there are several.
 */
export const occupancyQuery = z.object({ parentId: z.uuid().optional() });
export type OccupancyQuery = z.infer<typeof occupancyQuery>;

const occupancyFigures = z.object({
  units: z.number().int().min(0),
  ownerOccupied: z.number().int().min(0),
  rented: z.number().int().min(0),
  vacant: z.number().int().min(0),
  /** Owner-occupied and rented, as a whole percent of the units. */
  occupiedPercent: z.number().int().min(0).max(100),
});
export type OccupancyFigures = z.infer<typeof occupancyFigures>;

/** The figures from the three counts. */
export const occupancyFiguresOf = (ownerOccupied: number, rented: number, vacant: number): OccupancyFigures => {
  const units = ownerOccupied + rented + vacant;
  return { units, ownerOccupied, rented, vacant, occupiedPercent: sharePercent(ownerOccupied + rented, units) };
};

export const occupancyReportSchema = z.object({
  parent: crumb.nullable(),
  crumbs: z.array(crumb.extend({ open: z.boolean() })),
  areas: z.array(
    occupancyFigures.extend({
      id: z.uuid(),
      name: z.string(),
      /** A unit directly under the parent: its own occupancy, nothing to open below it. */
      isUnit: z.boolean(),
      occupancy: z.enum(OCCUPANCIES).nullable(),
    }),
  ),
  totals: occupancyFigures,
});
export type OccupancyReport = z.infer<typeof occupancyReportSchema>;

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

/**
 * `GET /reports/members` (`members.view`): memberships by status, and those who joined in the
 * range (this month by default; 400 `invalid_range`). A caller limited to an area sees the
 * memberships recorded at a place there; a whole-society caller sees all.
 */
export const membersReportQuery = z.object({
  from: isoDay.optional(),
  to: isoDay.optional(),
  locationId: z.uuid().optional(),
});
export type MembersReportQuery = z.infer<typeof membersReportQuery>;

/** Most joiners a members report lists; past it the list stops and says so. */
export const MEMBERS_REPORT_LIMIT = 2000;

export const membersReportSchema = z.object({
  from: isoDay,
  to: isoDay,
  location: crumb.nullable(),
  /** Memberships by status, in the caller's area (the range doesn't apply). */
  counts: z.object({ active: z.number().int().min(0), lapsed: z.number().int().min(0), cancelled: z.number().int().min(0) }),
  joined: z.array(
    z.object({
      memberNo: z.number().int(),
      membershipCode: z.string(),
      /** The member: a person or an organisation (exactly one is set). */
      personId: z.uuid().nullable(),
      organisationId: z.uuid().nullable(),
      name: z.string(),
      nameEn: z.string().nullable(),
      phone: z.string().nullable(),
      /** The place on the membership, top first, with its own name last; empty when none. */
      address: z.array(z.string()),
      joinedOn: isoDay,
      status: z.enum(MEMBERSHIP_STATUSES),
    }),
  ),
  truncated: z.boolean(),
});
export type MembersReport = z.infer<typeof membersReportSchema>;

// ---------------------------------------------------------------------------
// Renters for the thana
// ---------------------------------------------------------------------------

/**
 * `GET /reports/renters` (`members.export`, in that area): current renters (tenancy active or
 * moving out), for the police station. Only while the setting `share_renters_with_thana` is on
 * (403 `thana_sharing_off`). Never the NID.
 */
export const rentersReportQuery = z.object({ locationId: z.uuid().optional() });
export type RentersReportQuery = z.infer<typeof rentersReportQuery>;

/** Most renters a list holds; past it the list stops and says so. */
export const RENTERS_REPORT_LIMIT = 3000;

export const rentersReportSchema = z.object({
  asOf: isoDay,
  location: crumb.nullable(),
  rows: z.array(
    z.object({
      tenancyId: z.uuid(),
      unitId: z.uuid(),
      unit: z.string(),
      /** The places above the unit, top first. */
      address: z.array(z.string()),
      renter: z.object({ kind: z.enum(['person', 'organisation']), id: z.uuid(), name: z.string(), nameEn: z.string().nullable() }),
      phone: z.string().nullable(),
      renterType: z.enum(RENTER_TYPES),
      status: z.enum(TENANCY_STATUSES),
      startDate: isoDay,
      /** Current residents of the tenancy's household, the renter included when they live there. */
      household: z.number().int().min(0),
      policeForm: z.boolean(),
    }),
  ),
  totals: z.object({
    tenancies: z.number().int().min(0),
    people: z.number().int().min(0),
    policeFormMissing: z.number().int().min(0),
  }),
  truncated: z.boolean(),
});
export type RentersReport = z.infer<typeof rentersReportSchema>;
