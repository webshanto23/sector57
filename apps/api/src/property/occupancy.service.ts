import { Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import { RENTED_STATUSES } from '@s57/shared';
import { PrismaService } from '../prisma/prisma.service.js';

type Client = Pick<PrismaService, '$executeRaw'>;

/**
 * Keeps `units.occupancy` in step with the records (Anis, 2026-10-11): `rented` while a
 * tenancy is active or moving out; otherwise `owner_occupied` when the unit, or a location
 * above it, has a current owner; otherwise `vacant`. Called in the same transaction as
 * every change to units, ownerships and tenancies.
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
        when exists (
          select 1 from ownerships o join locations ol on ol.id = o.location_id
          where o.society_id = u.society_id and o.end_date is null and starts_with(l.path, ol.path)
        ) then 'owner_occupied'
        else 'vacant'
      end
      from locations l
      where l.id = u.location_id and u.society_id = ${societyId}::uuid and starts_with(l.path, ${path})`;
  }
}
