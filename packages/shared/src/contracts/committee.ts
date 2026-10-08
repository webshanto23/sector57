import { z } from 'zod';

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
