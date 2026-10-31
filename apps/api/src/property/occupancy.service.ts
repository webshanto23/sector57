import { Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import { RENTED_STATUSES } from '@s57/shared';
import { PrismaService } from '../prisma/prisma.service.js';

type Client = Pick<PrismaService, '$executeRaw'>;

/**
 * Keeps `units.occupancy` in step with the records: `rented` while a tenancy is active or
 * moving out; otherwise `owner_occupied` while someone of the owner's household (a resident
 * with no tenancy, such as an owner marked "Lives here") lives there or the unit is ticked
 * "Owner uses this" (`units.owner_uses`: an office with no resident); otherwise `vacant`, even
 * when owned (Anis, 2026-10-28; owning a plot no longer marks every flat below it). Called in
 * the same transaction as every change to units, ownerships, tenancies and residents.
 */
@Injectable()
export class OccupancyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Recomputes every unit at or below `path` (a location's `locations.path`). */
  async refresh(societyId: string, path: string, client: Client = this.prisma): Promise<void> {
    const rented = Prisma.join(RENTED_STATUSES.map((status) => Prisma.sql`${status}`));
    await client.$executeRaw`
      update units u set occupancy = case
        when exists (
          select 1 from tenancies t
          where t.unit_id = u.location_id and t.society_id = u.society_id and t.status in (${rented})
        ) then 'rented'
        when u.owner_uses then 'owner_occupied'
        when exists (
          select 1 from occupants oc
          where oc.unit_id = u.location_id and oc.society_id = u.society_id and oc.end_date is null and oc.tenancy_id is null
        ) then 'owner_occupied'
        else 'vacant'
      end
      from locations l
      where l.id = u.location_id and u.society_id = ${societyId}::uuid and starts_with(l.path, ${path})`;
  }
}
