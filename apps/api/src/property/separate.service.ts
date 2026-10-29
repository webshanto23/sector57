import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { todayDate } from '../common/dates.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { coversAfterSeparate, separatedSize } from './combine.policy.js';
import { OccupancyService } from './occupancy.service.js';
import { beyondPermissions } from './tree.service.js';

const unitNotFound = () => new NotFoundException({ code: 'unit_not_found', message: 'Unit not found' });

const select = {
  location_id: true,
  size_sqft: true,
  merged_into: true,
  locations: { select: { name: true, path: true, parent_id: true, locations: { select: { path: true } } } },
} as const;

/**
 * Separating a joined unit (the reverse of `CombineService`, one part at a time): the part is
 * active again and gets its own copy of the kept unit's current owners from today, so either can
 * be sold or rented on its own after. The kept unit gives back the part's size and floor. Bills,
 * renters and residents from the joined time stay where they are; billing runs bill each unit
 * on its own from now on.
 */
@Injectable()
export class SeparateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly occupancy: OccupancyService,
  ) {}

  async separate(actor: Actor, partId: string): Promise<{ keptId: string; separatedId: string }> {
    const societyId = actor.societyId;
    const part = await this.prisma.units.findFirst({ where: { society_id: societyId, location_id: partId }, select });
    if (!part || !actor.access.can('view', 'units', { path: part.locations.path })) throw unitNotFound();
    if (!part.merged_into) throw new ConflictException({ code: 'unit_not_joined', message: 'This unit is not part of a joined unit' });
    const keep = await this.prisma.units.findFirstOrThrow({
      where: { society_id: societyId, location_id: part.merged_into },
      select: {
        ...select,
        unit_storeys: { select: { storey_id: true } },
        merged_units: { select: { location_id: true, locations: { select: { parent_id: true } } } },
      },
    });
    for (const row of [part, keep]) {
      if (!actor.access.can('edit', 'units', { path: row.locations.path })) throw beyondPermissions();
    }

    const before = { sizeSqft: keep.size_sqft?.toFixed(2) ?? null, covers: keep.unit_storeys.map((link) => link.storey_id) };
    const covers = coversAfterSeparate(
      before.covers,
      part.locations.parent_id!,
      keep.merged_units.filter((other) => other.location_id !== partId).map((other) => other.locations.parent_id!),
    );
    const size = separatedSize(before.sizeSqft, part.size_sqft?.toFixed(2) ?? null);
    const owners = await this.prisma.ownerships.findMany({
      where: { society_id: societyId, location_id: keep.location_id, end_date: null },
      select: { person_id: true, organisation_id: true, share_percent: true },
    });
    const today = todayDate();

    await this.prisma.$transaction(async (tx) => {
      await tx.units.update({ where: { location_id: partId }, data: { merged_into: null, merged_on: null } });
      await tx.locations.update({ where: { id: partId }, data: { is_active: true } });
      await tx.ownerships.createMany({ data: owners.map((owner) => ({ ...owner, society_id: societyId, location_id: partId, start_date: today })) });
      await tx.unit_storeys.deleteMany({ where: { society_id: societyId, unit_id: keep.location_id, storey_id: { notIn: covers } } });
      await tx.units.update({ where: { location_id: keep.location_id }, data: { size_sqft: size } });
      // Both sit in one building (or under one place), so one refresh covers them.
      await this.occupancy.refresh(societyId, keep.locations.locations?.path ?? keep.locations.path, tx);
      const record = (entityId: string, beforeData: object, after: object) =>
        this.audit.record({ societyId, userId: actor.userId, action: 'separate', entityType: 'unit', entityId, before: beforeData, after, ip: actor.ip }, tx);
      await record(keep.location_id, before, { sizeSqft: size, covers, separated: partId });
      await record(partId, { isActive: false, mergedInto: keep.location_id }, { isActive: true, owners: owners.length });
    });
    return { keptId: keep.location_id, separatedId: partId };
  }
}
