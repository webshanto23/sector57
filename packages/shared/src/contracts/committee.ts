import { z } from 'zod';
import { bdPhone, optionalText, text } from '../schemas.js';

/**
 * Standard committee positions, stored in `committee_members.position` as these
 * keys and labelled through i18n (`Committee.position.*`). Any other stored
 * text is a custom title and is shown as typed.
 */
export const COMMITTEE_POSITIONS = [
  'president',
  'vice_president',
  'general_secretary',
  'joint_secretary',
  'treasurer',
  'organizing_secretary',
  'cultural_secretary',
  'executive_member',
] as const;
export type CommitteePosition = (typeof COMMITTEE_POSITIONS)[number];

export function isCommitteePosition(value: string): value is CommitteePosition {
  return (COMMITTEE_POSITIONS as readonly string[]).includes(value);
}

/** One member of the current committee. Public: never carries contact or ID details. */
export const committeeMemberSchema = z.object({
  id: z.uuid(),
  nameBn: z.string(),
  nameEn: z.string().nullable(),
  position: z.string(),
  photoUrl: z.string().nullable(),
});
export type CommitteeMember = z.infer<typeof committeeMemberSchema>;

/** `GET /public/committee`: the committee serving today, in display order. */
export const committeeSchema = z.object({
  termStart: z.iso.date().nullable(),
  // null while any member's term is open-ended
  termEnd: z.iso.date().nullable(),
  members: z.array(committeeMemberSchema),
});
export type Committee = z.infer<typeof committeeSchema>;

/** One committee seat in the dashboard, current or not. `phone` is only shown to the office. */
export const committeeSeatSchema = z.object({
  id: z.uuid(),
  personId: z.uuid(),
  nameBn: z.string(),
  nameEn: z.string().nullable(),
  phone: z.string().nullable(),
  position: z.string(),
  sortOrder: z.number().int(),
  termStart: z.iso.date(),
  termEnd: z.iso.date().nullable(),
  photoUrl: z.string().nullable(),
});
export type CommitteeSeat = z.infer<typeof committeeSeatSchema>;

/** `GET /committee/members`: every seat, newest term first, then in display order. */
export const committeeSeatListSchema = z.object({ items: z.array(committeeSeatSchema) });
export type CommitteeSeatList = z.infer<typeof committeeSeatListSchema>;

const seatFields = z.object({
  nameBn: text(200),
  nameEn: optionalText(200),
  /** A standard position key, or any other title as typed. */
  position: text(100),
  sortOrder: z.coerce.number().int().min(0).max(999),
  termStart: z.iso.date(),
  termEnd: z.iso.date().nullish().transform((value) => value ?? null),
});

const termOrder = <T extends { termStart: string; termEnd: string | null }>(seat: T) =>
  seat.termEnd === null || seat.termEnd >= seat.termStart;
const termIssue = { message: 'term_end_before_start', path: ['termEnd'] };

/**
 * `POST /committee/members`. The person with this phone is reused when one exists
 * (their stored names are kept); without a phone a new person is always created.
 */
export const committeeSeatCreateSchema = seatFields
  .extend({
    phone: z
      .string()
      .nullish()
      .transform((value) => (value == null || value.trim() === '' ? null : value))
      .pipe(bdPhone.nullable()),
  })
  .refine(termOrder, termIssue);
export type CommitteeSeatCreateInput = z.infer<typeof committeeSeatCreateSchema>;

/** `PUT /committee/members/:id`. The names are saved on the linked person; the phone can't change here. */
export const committeeSeatUpdateSchema = seatFields.refine(termOrder, termIssue);
export type CommitteeSeatUpdateInput = z.infer<typeof committeeSeatUpdateSchema>;
