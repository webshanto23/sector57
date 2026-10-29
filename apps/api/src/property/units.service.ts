import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import {
  digitVariants,
  locationPath,
  OCCUPANCIES,
  toBillTo,
  toOccupancy,
  type BulkResult,
  type LocationNode,
  type UnitArea,
  type UnitAreas,
  type UnitBulkInput,
  type UnitCounts,
  type UnitCreateInput,
  type UnitDetail,
  type UnitList,
  type UnitListQuery,
  type UnitSummary,
  type UnitUpdateInput,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { isForeignKeyViolation, isUniqueViolation } from '../common/prisma-errors.js';
import { scopeWhere } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { definedOnly, inUse, takenError } from './locations.service.js';
import { OccupancyService } from './occupancy.service.js';
import { UnitPeopleService } from './unit-people.service.js';
import { UnitStoreysService } from './unit-storeys.service.js';
import { UnitTypesService } from './unit-types.service.js';
import { addressOf, beyondPermissions, codeTaken, locationNotFound, nameTaken, TreeService } from './tree.service.js';

const select = {
  location_id: true,
  unit_type: true,
  size_sqft: true,
  bill_to: true,
  occupancy: true,
  merged_on: true,
  merged: { select: { location_id: true, locations: { select: { name: true } } } },
  locations: { select: { name: true, code: true, path: true, parent_id: true, is_active: true } },
} satisfies Prisma.unitsSelect;

type UnitRow = Prisma.unitsGetPayload<{ select: typeof select }>;

const unitNotFound = () => new NotFoundException({ code: 'unit_not_found', message: 'Unit not found' });
/** A unit combined into another is history only. */
const unitMerged = () => new ConflictException({ code: 'unit_merged', message: 'This unit was combined into another one' });

/** What an audit row keeps of a unit. */
const snapshot = (unit: Omit<UnitSummary, 'id' | 'parentId' | 'address' | 'occupancy'>) => ({
  name: unit.name,
  code: unit.code,
  isActive: unit.isActive,
  unitType: unit.unitType,
  sizeSqft: unit.sizeSqft,
  billTo: unit.billTo,
});

/**
 * Units: flats, shops and offices, the deepest level of the tree. Each is a `locations`
 * row plus a `units` row, written together. Scoped by the `units` permission.
 */
@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tree: TreeService,
    private readonly occupancy: OccupancyService,
    private readonly unitTypes: UnitTypesService,
    private readonly people: UnitPeopleService,
    private readonly storeys: UnitStoreysService,
  ) {}

  async list(actor: Actor, query: UnitListQuery): Promise<UnitList> {
    const { page, pageSize, q, areaId, unitType, occupancy, billTo, status, missing, ownerLives } = query;
    const and: Prisma.unitsWhereInput[] = [
      { society_id: actor.societyId },
      scopeWhere(actor.access, 'view', 'units', (prefix) => ({ locations: { path: { startsWith: prefix } } })),
    ];
    if (areaId) {
      const area = await this.tree.find(actor.societyId, areaId);
      // An unknown area matches nothing rather than everything.
      and.push(area ? { locations: { path: { startsWith: area.path } } } : { location_id: { in: [] } });
    }
    if (q) {
      const people = await this.people.matching(actor, q);
      and.push({
        OR: [
          ...digitVariants(q).flatMap((term) => [
            { locations: { name: { contains: term, mode: 'insensitive' as const } } },
            { locations: { code: { contains: term, mode: 'insensitive' as const } } },
          ]),
          ...(people.length ? [{ location_id: { in: people } }] : []),
        ],
      });
    }
    if (unitType) and.push({ unit_type: unitType });
    if (billTo) and.push({ bill_to: billTo });
    if (status) and.push({ locations: { is_active: status === 'active' } });
    if (missing === 'size') and.push({ size_sqft: null });
    const chain = await this.people.conditions(actor, { missing, ownerLives });
    if (chain) and.push({ location_id: { in: chain } });
    // A unit combined into another is part of that one: it is not counted, nor found as vacant.
    const where = { AND: occupancy ? [...and, { occupancy, merged_into: null }] : and };

    const [total, rows, groups] = await this.prisma.$transaction([
      this.prisma.units.count({ where }),
      this.prisma.units.findMany({
        where,
        select: { ...select, merged_units: { select: { locations: { select: { name: true } } }, orderBy: { locations: { name: 'asc' } } } },
        // Grouped by what is above the unit (roughly building, plot, road), then natural name order.
        orderBy: [
          { locations: { locations: { locations: { name: 'asc' } } } },
          { locations: { locations: { name: 'asc' } } },
          { locations: { name: 'asc' } },
          { location_id: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.units.groupBy({ by: ['occupancy'], where: { AND: [...and, { merged_into: null }] }, _count: { _all: true }, orderBy: { occupancy: 'asc' } }),
    ]);

    const counts: UnitCounts = { total: 0, owner_occupied: 0, rented: 0, vacant: 0 };
    for (const group of groups) {
      const count = (group._count as { _all: number })._all;
      counts.total += count;
      if ((OCCUPANCIES as readonly string[]).includes(group.occupancy)) counts[toOccupancy(group.occupancy)] += count;
    }
    const [names, people] = await Promise.all([
      this.tree.addressNames(actor.societyId, rows.map((row) => row.locations.path)),
      this.people.forUnits(actor, rows.map((row) => ({ id: row.location_id, path: row.locations.path }))),
    ]);
    const items = rows.map((row) => ({
      ...toSummary(row, names),
      ...(people.get(row.location_id) ?? { owners: null, renters: null }),
      mergedInto: row.merged ? { id: row.merged.location_id, name: row.merged.locations.name } : null,
      includes: row.merged_units.map((part) => part.locations.name),
    }));
    return { items, total, page, pageSize, counts };
  }

  /** The area picker: the caller's top areas, or the areas (not units) under one they may see. */
  async areas(actor: Actor, parentId: string | undefined): Promise<UnitAreas> {
    if (!parentId) {
      const tops = await this.tree.tops(actor.access, actor.societyId, 'units');
      return { area: null, breadcrumb: [], children: tops.filter((node) => !node.isUnit).map(toArea) };
    }
    const row = await this.tree.visible(actor.access, actor.societyId, 'units', parentId);
    if (row.isUnit) throw locationNotFound();
    const [area, breadcrumb, children] = await Promise.all([
      this.tree.node(actor.societyId, parentId),
      this.tree.breadcrumb(actor.access, actor.societyId, row.path, 'units'),
      this.tree.children(actor.societyId, parentId),
    ]);
    return { area: toArea(area), breadcrumb, children: children.filter((node) => !node.isUnit).map(toArea) };
  }

  async get(actor: Actor, id: string): Promise<UnitDetail> {
    const row = await this.visibleRow(actor, id);
    const located = { path: row.locations.path };
    const edit = actor.access.can('edit', 'units', located) && row.merged === null;
    const [names, breadcrumb, covers] = await Promise.all([
      this.tree.addressNames(actor.societyId, [row.locations.path]),
      this.tree.breadcrumb(actor.access, actor.societyId, row.locations.path, 'locations'),
      this.storeys.covers(actor.societyId, id),
    ]);
    return {
      ...toSummary(row, names),
      breadcrumb,
      covers,
      mergedInto: row.merged ? { id: row.merged.location_id, name: row.merged.locations.name, on: row.merged_on!.toISOString().slice(0, 10) } : null,
      can: { edit, delete: actor.access.can('delete', 'units', located) && row.merged === null },
    };
  }

  async create(actor: Actor, input: UnitCreateInput): Promise<UnitDetail> {
    const parent = (await this.tree.parentFor(actor.access, actor.societyId, input.parentId, 'units'))!;
    const levelId = await this.unitLevel(actor.societyId);
    if (await this.tree.codeInUse(actor.societyId, input.code)) throw codeTaken();
    await this.unitTypes.assertCodes(actor.societyId, [input.unitType]);

    const id = randomUUID();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.locations.create({
          data: {
            id,
            society_id: actor.societyId,
            parent_id: parent.id,
            level_id: levelId,
            name: input.name,
            code: input.code,
            path: locationPath(parent.path, id),
          },
        });
        await tx.units.create({ data: { location_id: id, society_id: actor.societyId, ...unitData(input) } });
        // An owner of a location above already owns the new unit.
        await this.occupancy.refresh(actor.societyId, locationPath(parent.path, id), tx);
        await this.audit.record(
          { ...auditOf(actor, 'create', id), after: { parentId: parent.id, ...snapshot({ ...input, isActive: true }) } },
          tx,
        );
      });
    } catch (error) {
      throw isUniqueViolation(error) ? nameTaken() : error;
    }
    return this.get(actor, id);
  }

  /** Many units with the same facts under one parent, all or none. */
  async bulk(actor: Actor, input: UnitBulkInput): Promise<BulkResult> {
    const parent = (await this.tree.parentFor(actor.access, actor.societyId, input.parentId, 'units'))!;
    const levelId = await this.unitLevel(actor.societyId);
    const taken = await this.tree.takenNames(actor.societyId, parent.id, input.names);
    if (taken.length > 0) throw takenError(taken);
    await this.unitTypes.assertCodes(actor.societyId, [input.unitType]);

    const ids = input.names.map(() => randomUUID());
    const facts = unitData(input);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.locations.createMany({
          data: input.names.map((name, index) => ({
            id: ids[index]!,
            society_id: actor.societyId,
            parent_id: parent.id,
            level_id: levelId,
            name,
            path: locationPath(parent.path, ids[index]!),
          })),
        });
        await tx.units.createMany({ data: ids.map((id) => ({ location_id: id, society_id: actor.societyId, ...facts })) });
        await this.occupancy.refresh(actor.societyId, parent.path, tx);
        await this.audit.record(
          {
            ...auditOf(actor, 'bulk_create', parent.id),
            after: { names: input.names, unitType: input.unitType, sizeSqft: input.sizeSqft, billTo: input.billTo },
          },
          tx,
        );
      });
    } catch (error) {
      throw isUniqueViolation(error) ? nameTaken() : error;
    }
    return { created: ids.length };
  }

  async update(actor: Actor, id: string, input: UnitUpdateInput): Promise<UnitDetail> {
    const row = await this.visibleRow(actor, id);
    if (!actor.access.can('edit', 'units', { path: row.locations.path })) throw beyondPermissions();
    if (row.merged) throw unitMerged();
    if (input.code !== undefined && (await this.tree.codeInUse(actor.societyId, input.code, id))) throw codeTaken();
    if (input.unitType !== undefined) await this.unitTypes.assertCodes(actor.societyId, [input.unitType]);

    const before = toSummary(row, new Map());
    const after = { ...before, ...definedOnly(input) };
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.locations.update({ where: { id }, data: { name: after.name, code: after.code, is_active: after.isActive } });
        await tx.units.update({ where: { location_id: id }, data: unitData(after) });
        await this.audit.record({ ...auditOf(actor, 'update', id), before: snapshot(before), after: snapshot(after) }, tx);
      });
    } catch (error) {
      throw isUniqueViolation(error) ? nameTaken() : error;
    }
    return this.get(actor, id);
  }

  /** Only a unit nothing refers to (no tenancy, occupant or bill); otherwise deactivate it. */
  async remove(actor: Actor, id: string): Promise<void> {
    const row = await this.visibleRow(actor, id);
    if (!actor.access.can('delete', 'units', { path: row.locations.path })) throw beyondPermissions();
    if (row.merged) throw unitMerged();
    const before = toSummary(row, new Map());
    try {
      await this.prisma.$transaction(async (tx) => {
        // The `units` row goes with it (on delete cascade).
        await tx.locations.delete({ where: { id } });
        await this.audit.record({ ...auditOf(actor, 'delete', id), before: snapshot(before) }, tx);
      });
    } catch (error) {
      if (isForeignKeyViolation(error)) throw inUse();
      throw error;
    }
  }

  private async visibleRow(actor: Actor, id: string): Promise<UnitRow> {
    const row = await this.prisma.units.findFirst({ where: { location_id: id, society_id: actor.societyId }, select });
    if (!row || !actor.access.can('view', 'units', { path: row.locations.path })) throw unitNotFound();
    return row;
  }

  private async unitLevel(societyId: string): Promise<string> {
    const level = await this.prisma.location_levels.findFirst({ where: { society_id: societyId, is_unit_level: true }, select: { id: true } });
    if (!level) throw new BadRequestException({ code: 'invalid_level', message: 'The society has no unit level' });
    return level.id;
  }
}

function toSummary(row: UnitRow, names: Map<string, string>): UnitSummary {
  return {
    id: row.location_id,
    parentId: row.locations.parent_id!,
    name: row.locations.name,
    code: row.locations.code,
    address: addressOf(row.locations.path, names),
    unitType: row.unit_type,
    sizeSqft: row.size_sqft?.toString() ?? null,
    billTo: toBillTo(row.bill_to),
    occupancy: toOccupancy(row.occupancy),
    isActive: row.locations.is_active,
  };
}

/** The typed facts of a unit; `occupancy` is derived (`OccupancyService`). */
function unitData(input: Pick<UnitSummary, 'unitType' | 'sizeSqft' | 'billTo'>) {
  return { unit_type: input.unitType, size_sqft: input.sizeSqft, bill_to: input.billTo };
}

const auditOf = (actor: Actor, action: string, entityId: string) => ({
  societyId: actor.societyId,
  userId: actor.userId,
  action,
  entityType: 'unit',
  entityId,
  ip: actor.ip,
});

function toArea(node: LocationNode): UnitArea {
  return { id: node.id, name: node.name, levelBn: node.levelBn, levelEn: node.levelEn, unitCount: node.unitCount };
}
