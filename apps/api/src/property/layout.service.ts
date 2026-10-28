import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  expandLayout,
  locationPath,
  toOccupancy,
  type BuildingGrid,
  type BuildingLayoutInput,
  type BuildingLayoutResult,
  type UnitTypeBulkInput,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OccupancyService } from './occupancy.service.js';
import { beyondPermissions, locationNotFound, nameTaken, TreeService } from './tree.service.js';
import { UnitTypesService } from './unit-types.service.js';

/**
 * "Set up floors and units" (Step 37): a new building's floors (the level right below it)
 * and the units on each (the unit level), all or none. Only on a place with nothing inside.
 * Then the grid of floors and units, and one type for many units at once.
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

  /** A building's floors (its non-unit children) in name order, each with its own units. */
  async grid(actor: Actor, buildingId: string): Promise<BuildingGrid> {
    const building = await this.tree.visible(actor.access, actor.societyId, 'locations', buildingId);
    if (building.isUnit) throw locationNotFound();
    const floors = (await this.tree.children(actor.societyId, building.id)).filter((child) => !child.isUnit);
    const units = floors.length
      ? await this.tree.nodes(actor.societyId, Prisma.sql`l.parent_id in (${Prisma.join(floors.map((floor) => Prisma.sql`${floor.id}::uuid`))}) and lv.is_unit_level`)
      : [];
    const facts = await this.prisma.units.findMany({
      where: { society_id: actor.societyId, location_id: { in: units.map((unit) => unit.id) } },
      select: { location_id: true, unit_type: true, occupancy: true },
    });
    const byId = new Map(facts.map((row) => [row.location_id, row]));
    return {
      floors: floors.map((floor) => ({
        id: floor.id,
        name: floor.name,
        units: units
          .filter((unit) => unit.parentId === floor.id)
          .map((unit) => ({
            id: unit.id,
            name: unit.name,
            unitType: byId.get(unit.id)!.unit_type,
            occupancy: toOccupancy(byId.get(unit.id)!.occupancy),
            isActive: unit.isActive,
            alsoOn: unit.alsoOn,
          })),
      })),
      canEdit: actor.access.can('edit', 'units', { path: building.path }),
    };
  }

  /** One type for many units, all or none; each must be a unit the caller may edit. */
  async setTypes(actor: Actor, input: UnitTypeBulkInput): Promise<{ updated: number }> {
    const rows = await this.prisma.units.findMany({
      where: { society_id: actor.societyId, location_id: { in: input.unitIds } },
      select: { location_id: true, unit_type: true, locations: { select: { path: true } } },
    });
    if (rows.length !== input.unitIds.length || rows.some((row) => !actor.access.can('view', 'units', { path: row.locations.path }))) {
      throw new NotFoundException({ code: 'unit_not_found', message: 'Unit not found' });
    }
    if (rows.some((row) => !actor.access.can('edit', 'units', { path: row.locations.path }))) throw beyondPermissions();
    await this.unitTypes.assertCodes(actor.societyId, [input.unitType]);
    const changed = rows.filter((row) => row.unit_type !== input.unitType);
    await this.prisma.$transaction(async (tx) => {
      await tx.units.updateMany({ where: { society_id: actor.societyId, location_id: { in: changed.map((row) => row.location_id) } }, data: { unit_type: input.unitType } });
      for (const row of changed) {
        await this.audit.record(
          {
            societyId: actor.societyId,
            userId: actor.userId,
            action: 'update',
            entityType: 'unit',
            entityId: row.location_id,
            before: { unitType: row.unit_type },
            after: { unitType: input.unitType },
            ip: actor.ip,
          },
          tx,
        );
      }
    });
    return { updated: changed.length };
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
