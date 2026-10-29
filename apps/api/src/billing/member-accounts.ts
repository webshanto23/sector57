import type { Prisma } from '@s57/db';
import { asciiDigits, digitVariants, type Payer } from '@s57/shared';

/*
 * Membership fees are billed to the member: a person or an organisation. Bills, the billing
 * lookup, the collect lookup and payments name the member by `personId` or `organisationId`.
 */

/** The member named by `personId` or `organisationId`, if either is given. */
export function memberOf(input: { personId?: string | null; organisationId?: string | null }): Payer | null {
  if (input.personId) return { kind: 'person', id: input.personId };
  if (input.organisationId) return { kind: 'organisation', id: input.organisationId };
  return null;
}

/** A membership row's member. */
export const memberOfRow = (row: { person_id: string | null; organisation_id: string | null }): Payer =>
  row.person_id ? { kind: 'person', id: row.person_id } : { kind: 'organisation', id: row.organisation_id! };

/** That member's memberships, as a `memberships` filter. */
export const membershipsOf = (member: Payer): Prisma.membershipsWhereInput =>
  member.kind === 'person' ? { person_id: member.id } : { organisation_id: member.id };

/** Members by name, phone (an organisation's contact person) or membership ID, in either digit form. */
export function memberSearch(q: string): Prisma.membershipsWhereInput {
  const digits = asciiDigits(q).trim();
  return {
    OR: [
      ...digitVariants(q).flatMap((term) => [
        { persons: { full_name: { contains: term, mode: 'insensitive' as const } } },
        { persons: { full_name_en: { contains: term, mode: 'insensitive' as const } } },
        { organisations: { name: { contains: term, mode: 'insensitive' as const } } },
      ]),
      { persons: { phone: { contains: digits } } },
      { organisations: { persons: { phone: { contains: digits } } } },
      ...(/^\d{1,9}$/.test(digits) ? [{ member_no: Number(digits) }] : []),
      { membership_code: { equals: digits, mode: 'insensitive' as const } },
    ],
  };
}
