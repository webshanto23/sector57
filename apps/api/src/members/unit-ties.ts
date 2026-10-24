import type { Prisma } from '@s57/db';
import type { UnitTie } from '@s57/shared';

export type TieUnit = { id: string; path: string };

/**
 * Current owners (of the unit or a place above it), renters and residents of a unit; one
 * person may hold several ties. With `personId`, only that person's ties.
 */
export function unitTies(
  prisma: Pick<Prisma.TransactionClient, '$queryRaw'>,
  societyId: string,
  unit: TieUnit,
  personId: string | null,
): Promise<{ person_id: string; tie: UnitTie }[]> {
  return prisma.$queryRaw`
    select o.person_id, 'owner' as tie from ownerships o join locations l on l.id = o.location_id
      where o.society_id = ${societyId}::uuid and o.end_date is null and o.person_id is not null
        and starts_with(${unit.path}, l.path) and (${personId}::uuid is null or o.person_id = ${personId}::uuid)
    union
    select t.primary_person_id, 'renter' from tenancies t
      where t.society_id = ${societyId}::uuid and t.unit_id = ${unit.id}::uuid and t.status <> 'ended'
        and t.primary_person_id is not null and (${personId}::uuid is null or t.primary_person_id = ${personId}::uuid)
    union
    select oc.person_id, 'resident' from occupants oc
      where oc.society_id = ${societyId}::uuid and oc.unit_id = ${unit.id}::uuid and oc.end_date is null
        and (${personId}::uuid is null or oc.person_id = ${personId}::uuid)`;
}
