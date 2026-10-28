import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OPEN_INVOICE_STATUSES, OPEN_TENANCY_STATUSES, type UnitCombineInput } from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { todayDate } from '../common/dates.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { combinedSize, combineProblem, coveredAfter, type CombineFacts } from './combine.policy.js';
import { OccupancyService } from './occupancy.service.js';
import { beyondPermissions } from './tree.service.js';

const unitNotFound = () => new NotFoundException({ code: 'unit_not_found', message: 'Unit not found' });

/**
 * Combining units (Step 37): the kept unit carries on and covers the others' floors; each
 * retired unit becomes inactive, "merged into" the kept one, with its ownerships ended and its
 * history (bills, receipts, documents) left in place. The rules are in `combine.policy.ts`.
 */
@Injectable()
export class CombineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly occupancy: OccupancyService,
  ) {}

  async combine(actor: Actor, input: UnitCombineInput): Promise<{ keptId: string; merged: number }> {
    const societyId = actor.societyId;
    const ids = [input.keepId, ...input.mergeIds];
    const rows = await this.prisma.units.findMany({
      where: { society_id: societyId, location_id: { in: ids } },
      select: {
        location_id: true,
        size_sqft: true,
        merged_into: true,
        locations: { select: { name: true, path: true, parent_id: true, is_active: true, locations: { select: { parent_id: true, path: true } } } },
        unit_storeys: { select: { storey_id: true } },
      },
    });
    if (rows.length !== ids.length || rows.some((row) => !actor.access.can('view', 'units', { path: row.locations.path }))) throw unitNotFound();
    if (rows.some((row) => !actor.access.can('edit', 'units', { path: row.locations.path }))) throw beyondPermissions();

    const mergeIds = input.mergeIds;
    const [owners, bills, tenancies, occupants, vehicles, slots] = await Promise.all([
      this.prisma.ownerships.findMany({
        where: { society_id: societyId, location_id: { in: ids }, end_date: null },
        select: { location_id: true, person_id: true, organisation_id: true, share_percent: true },
      }),
      this.prisma.invoices.groupBy({ by: ['unit_id'], where: { society_id: societyId, unit_id: { in: mergeIds }, status: { in: [...OPEN_INVOICE_STATUSES] } }, _count: true }),
      this.prisma.tenancies.findMany({ where: { society_id: societyId, unit_id: { in: mergeIds }, status: { in: [...OPEN_TENANCY_STATUSES] } }, select: { unit_id: true } }),
      this.prisma.occupants.groupBy({ by: ['unit_id'], where: { society_id: societyId, unit_id: { in: mergeIds }, end_date: null }, _count: true }),
      this.prisma.vehicles.groupBy({ by: ['unit_id'], where: { society_id: societyId, unit_id: { in: mergeIds }, removed_at: null }, _count: true }),
      this.prisma.parking_slots.groupBy({ by: ['unit_id'], where: { society_id: societyId, unit_id: { in: mergeIds }, removed_at: null }, _count: true }),
    ]);
    const count = (list: { unit_id: string | null; _count: number }[], id: string) => list.find((row) => row.unit_id === id)?._count ?? 0;
    const facts = new Map(
      rows.map((row): [string, CombineFacts] => {
        const id = row.location_id;
        return [
          id,
          {
            id,
            parentId: row.locations.parent_id!,
            grandparentId: row.locations.locations?.parent_id ?? null,
            active: row.locations.is_active && row.merged_into === null,
            owners: owners
              .filter((owner) => owner.location_id === id)
              .map((owner) => (owner.person_id ? `person:${owner.person_id}` : `organisation:${owner.organisation_id}`) + `:${owner.share_percent.toFixed(2)}`),
            openBills: count(bills, id),
            openTenancy: tenancies.some((tenancy) => tenancy.unit_id === id),
            occupants: count(occupants, id),
            vehicles: count(vehicles, id) + count(slots, id),
          },
        ];
      }),
    );
    const problem = combineProblem(
      facts.get(input.keepId)!,
      mergeIds.map((id) => facts.get(id)!),
    );
    if (problem) throw new ConflictException({ code: `combine_${problem}`, message: 'These units cannot be combined yet' });

    const byId = new Map(rows.map((row) => [row.location_id, row]));
    const keep = byId.get(input.keepId)!;
    const merged = mergeIds.map((id) => byId.get(id)!);
    const covers = coveredAfter(
      { parentId: keep.locations.parent_id!, covers: keep.unit_storeys.map((link) => link.storey_id) },
      merged.map((row) => ({ parentId: row.locations.parent_id!, covers: row.unit_storeys.map((link) => link.storey_id) })),
    );
    const size = combinedSize(
      keep.size_sqft?.toFixed(2) ?? null,
      merged.map((row) => row.size_sqft?.toFixed(2) ?? null),
    );
    const today = todayDate();

    await this.prisma.$transaction(async (tx) => {
      await tx.units.updateMany({ where: { society_id: societyId, location_id: { in: mergeIds } }, data: { merged_into: input.keepId, merged_on: today } });
      await tx.locations.updateMany({ where: { society_id: societyId, id: { in: mergeIds } }, data: { is_active: false } });
      await tx.ownerships.updateMany({ where: { society_id: societyId, location_id: { in: mergeIds }, end_date: null }, data: { end_date: today } });
      await tx.unit_storeys.deleteMany({ where: { society_id: societyId, unit_id: { in: ids } } });
      await tx.unit_storeys.createMany({ data: covers.map((storeyId) => ({ unit_id: input.keepId, storey_id: storeyId, society_id: societyId })) });
      await tx.units.update({ where: { location_id: input.keepId }, data: { size_sqft: size } });
      await this.occupancy.refresh(societyId, keep.locations.locations?.path ?? keep.locations.path, tx);
      const record = (entityId: string, before: object, after: object) =>
        this.audit.record({ societyId, userId: actor.userId, action: 'combine', entityType: 'unit', entityId, before, after, ip: actor.ip }, tx);
      await record(input.keepId, { sizeSqft: keep.size_sqft?.toFixed(2) ?? null, covers: keep.unit_storeys.map((link) => link.storey_id) }, { sizeSqft: size, covers, merged: mergeIds });
      for (const row of merged) await record(row.location_id, { isActive: true }, { isActive: false, mergedInto: input.keepId });
    });
    return { keptId: input.keepId, merged: mergeIds.length };
  }
}
