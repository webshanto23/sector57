import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { expandLayout, locationPath, type BuildingLayoutInput, type BuildingLayoutResult } from '@s57/shared';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OccupancyService } from './occupancy.service.js';
import { beyondPermissions, nameTaken, TreeService } from './tree.service.js';
import { UnitTypesService } from './unit-types.service.js';

/**
 * "Set up floors and units" (Step 37): a new building's floors (the level right below it)
 * and the units on each (the unit level), all or none. Only on a place with nothing inside.
 */
@Injectable()
export class LayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tree: TreeService,
    private readonly occupancy: OccupancyService,
    private readonly unitTypes: UnitTypesService,
  ) {}

  async apply(actor: Actor, buildingId: string, input: BuildingLayoutInput): Promise<BuildingLayoutResult> {
    const building = (await this.tree.parentFor(actor.access, actor.societyId, buildingId, 'locations'))!;
    if (!actor.access.can('create', 'units', { path: building.path })) throw beyondPermissions();
    if ((await this.prisma.locations.count({ where: { society_id: actor.societyId, parent_id: building.id } })) > 0) {
      throw new ConflictException({ code: 'layout_not_empty', message: 'Floors can only be set up in an empty place' });
    }
    const levels = await this.levels(actor.societyId, building.depth);
    await this.unitTypes.assertCodes(actor.societyId, [input.unitType]);

    const floors = expandLayout(input).map((floor) => ({ ...floor, id: randomUUID() }));
    const units = floors.flatMap((floor) => floor.units.map((name) => ({ id: randomUUID(), floor, name })));
    const facts = { unit_type: input.unitType, size_sqft: input.sizeSqft, bill_to: input.billTo };
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.locations.createMany({
          data: floors.map((floor) => ({
            id: floor.id,
            society_id: actor.societyId,
            parent_id: building.id,
            level_id: levels.floor,
            name: floor.name,
            path: locationPath(building.path, floor.id),
          })),
        });
        await tx.locations.createMany({
          data: units.map((unit) => ({
            id: unit.id,
            society_id: actor.societyId,
            parent_id: unit.floor.id,
            level_id: levels.unit,
            name: unit.name,
            path: locationPath(locationPath(building.path, unit.floor.id), unit.id),
          })),
        });
        await tx.units.createMany({ data: units.map((unit) => ({ location_id: unit.id, society_id: actor.societyId, ...facts })) });
        // An owner of the building or above already owns the new units.
        await this.occupancy.refresh(actor.societyId, building.path, tx);
        await this.audit.record(
          {
            societyId: actor.societyId,
            userId: actor.userId,
            action: 'bulk_create',
            entityType: 'location',
            entityId: building.id,
            after: { layout: input, floors: floors.length, units: units.length },
            ip: actor.ip,
          },
          tx,
        );
      });
    } catch (error) {
      throw isUniqueViolation(error) ? nameTaken() : error;
    }
    return { floors: floors.length, units: units.length };
  }

  /** The floor level (right below the building) and the unit level, which must come straight after it. */
  private async levels(societyId: string, depth: number): Promise<{ floor: string; unit: string }> {
    const rows = await this.prisma.location_levels.findMany({
      where: { society_id: societyId, depth: { gt: depth } },
      select: { id: true, is_unit_level: true },
      orderBy: { depth: 'asc' },
    });
    const [floor, unit] = rows;
    if (!floor || floor.is_unit_level || !unit?.is_unit_level) {
      throw new BadRequestException({ code: 'invalid_level', message: 'There is no floor level between this place and the units' });
    }
    return { floor: floor.id, unit: unit.id };
  }
}
