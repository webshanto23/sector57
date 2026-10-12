import { z } from 'zod';
import { cleanText } from '../text.js';
import { pagination } from '../schemas.js';
import { isoDay, MOVE_KINDS, partySchema, placeSchema, RENTER_TYPES, TENANCY_STATUSES, type MoveKind } from './members.js';

/** `move_events.status`: open until done (the tenancy started or ended) or cancelled. */
export const MOVE_STATUSES = ['open', 'done', 'cancelled'] as const;
export type MoveStatus = (typeof MOVE_STATUSES)[number];

/**
 * The checklist of each kind, in order. Labels live in i18n (`Moves.check.*`). Ticking
 * `police_form` on a move-in also marks the tenancy's police form as submitted.
 */
export const MOVE_CHECKLIST = {
  move_in: ['nid', 'agreement', 'police_form', 'photo'],
  move_out: ['keys', 'meter', 'police_informed'],
} as const satisfies Record<MoveKind, readonly string[]>;
export type MoveCheckKey = (typeof MOVE_CHECKLIST)[MoveKind][number];
const ALL_CHECKS = [...new Set(Object.values(MOVE_CHECKLIST).flat())] as [MoveCheckKey, ...MoveCheckKey[]];

const note = z.string().transform(cleanText).pipe(z.string().max(500)).nullish();

/**
 * `POST /moves`: start a move for a tenancy. A move-in needs a `pending` tenancy; a move-out
 * an `active` one, which becomes `moving_out` until the move is done or cancelled.
 */
export const moveCreateSchema = z.object({
  tenancyId: z.uuid(),
  kind: z.enum(MOVE_KINDS),
  plannedDate: isoDay.nullish(),
  note,
});
export type MoveCreateInput = z.infer<typeof moveCreateSchema>;

/** `PATCH /moves/:id` (open moves only). `checklist` sets the ticks it names; keys of the other kind are refused. */
export const moveUpdateSchema = z.object({
  plannedDate: isoDay.nullish(),
  checklist: z.partialRecord(z.enum(ALL_CHECKS), z.boolean()).optional(),
  note,
});
export type MoveUpdateInput = z.infer<typeof moveUpdateSchema>;

/**
 * `POST /moves/:id/complete`: the day the renter moved in (the tenancy becomes `active` from
 * then) or out (the tenancy and its household end then). A move-out with bills still unpaid
 * on the unit needs `tenancies.approve` (409 `dues_outstanding` otherwise).
 */
export const moveCompleteSchema = z.object({ date: isoDay });
export type MoveCompleteInput = z.infer<typeof moveCompleteSchema>;

/** The checklist with each key of the move's kind, in order. */
export const checklistOf = (kind: MoveKind, stored: unknown): { key: MoveCheckKey; done: boolean }[] => {
  const ticks = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  return MOVE_CHECKLIST[kind].map((key) => ({ key, done: ticks[key] === true }));
};

const userRef = z.object({ id: z.uuid(), name: z.string() });

export const moveRowSchema = z.object({
  id: z.uuid(),
  kind: z.enum(MOVE_KINDS),
  status: z.enum(MOVE_STATUSES),
  plannedDate: isoDay.nullable(),
  place: placeSchema,
  renter: partySchema.nullable(),
  renterType: z.enum(RENTER_TYPES),
  /** Ticked and total checklist items. */
  checked: z.number().int().min(0),
  checks: z.number().int().min(0),
  createdAt: z.iso.datetime({ offset: true }),
  completedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type MoveRow = z.infer<typeof moveRowSchema>;

/** `GET /moves`: in the caller's `tenancies.view` area; open moves first, by planned date. */
export const moveListQuery = pagination.extend({
  kind: z.enum(MOVE_KINDS).optional(),
  status: z.enum(MOVE_STATUSES).optional(),
  areaId: z.uuid().optional(),
  /** Matches the renter's name or phone, or the unit's name, in either digit form. */
  q: z.string().transform(cleanText).pipe(z.string().max(100)).optional(),
});
export type MoveListQuery = z.infer<typeof moveListQuery>;

export const moveListSchema = z.object({
  items: z.array(moveRowSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  /** Open moves of each kind in the caller's area (filters ignored). */
  open: z.object({ moveIn: z.number().int().min(0), moveOut: z.number().int().min(0) }),
});
export type MoveList = z.infer<typeof moveListSchema>;

/** `GET /moves/:id`. */
export const moveDetailSchema = moveRowSchema.extend({
  tenancy: z.object({
    id: z.uuid(),
    status: z.enum(TENANCY_STATUSES),
    startDate: isoDay,
    endDate: isoDay.nullable(),
    policeFormSubmitted: z.boolean(),
  }),
  checklist: z.array(z.object({ key: z.enum(ALL_CHECKS), done: z.boolean() })),
  note: z.string().nullable(),
  duesCleared: z.boolean(),
  /** What is still owed on the unit's bills; null without `billing.view` there. */
  dues: z.object({ owed: z.string(), bills: z.number().int().min(0) }).nullable(),
  createdBy: userRef.nullable(),
  completedBy: userRef.nullable(),
  cancelledBy: userRef.nullable(),
  cancelledAt: z.iso.datetime({ offset: true }).nullable(),
  can: z.object({ edit: z.boolean(), complete: z.boolean(), cancel: z.boolean(), overrideDues: z.boolean() }),
});
export type MoveDetail = z.infer<typeof moveDetailSchema>;

