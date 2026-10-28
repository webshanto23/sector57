import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  locationPath,
  type BulkResult,
  type LocationBulkInput,
  type LocationCreateInput,
  type LocationUpdateInput,
  type LocationView,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { isForeignKeyViolation, isUniqueViolation } from '../common/prisma-errors.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beyondPermissions, codeTaken, locationNotFound, nameTaken, TreeService, type LocationRow } from './tree.service.js';
import { UnitStoreysService } from './unit-storeys.service.js';

const invalidLevel = () =>
  new BadRequestException({ code: 'invalid_level', message: 'This level cannot be used here' });

const snapshot = (row: Pick<LocationRow, 'name' | 'code' | 'isActive'>) => ({ name: row.name, code: row.code, isActive: row.isActive });

/**
 * The location tree above the units: sectors, blocks, roads, plots, buildings, storeys.
 * Units (the deepest level) are read here as children but changed through `UnitsService`.
 * Every row is checked against the caller's area; rows outside it answer 404.
 */
@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tree: TreeService,
    private readonly storeys: UnitStoreysService,
  ) {}

  /** The top: every top-level location for a whole-society caller, else the caller's own areas. */
  async top(actor: Actor): Promise<LocationView> {
    const children = await this.tree.tops(actor.access, actor.societyId, 'locations');
    return {
      location: null,
      breadcrumb: [],
      alsoHere: [],
      children,
      can: { create: actor.access.paths('create', 'locations') === 'all', createUnit: false, edit: false, delete: false },
    };
  }

  async view(actor: Actor, id: string): Promise<LocationView> {
    const row = await this.visible(actor, id);
    const located = { path: row.path };
    const [location, breadcrumb, children, alsoHere] = await Promise.all([
      this.tree.node(actor.societyId, id),
      this.tree.breadcrumb(actor.access, actor.societyId, row.path, 'locations'),
      this.tree.children(actor.societyId, id),
      this.storeys.alsoHere(actor.societyId, id, (path) => actor.access.can('view', 'locations', { path })),
    ]);
    return {
      location,
      breadcrumb,
      children,
      alsoHere,
      can: {
        create: actor.access.can('create', 'locations', located),
        createUnit: actor.access.can('create', 'units', located),
        edit: actor.access.can('edit', 'locations', located),
        delete: actor.access.can('delete', 'locations', located),
      },
    };
  }

  async create(actor: Actor, input: LocationCreateInput): Promise<LocationView> {
    const parent = await this.tree.parentFor(actor.access, actor.societyId, input.parentId, 'locations');
    const level = await this.level(actor.societyId, input.levelId, parent);
    if (await this.tree.codeInUse(actor.societyId, input.code)) throw codeTaken();

    const id = randomUUID();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.locations.create({
          data: {
            id,
            society_id: actor.societyId,
            parent_id: parent?.id ?? null,
            level_id: level.id,
            name: input.name,
            code: input.code,
            path: locationPath(parent?.path ?? null, id),
          },
        });
        await this.audit.record(
          { ...auditOf(actor, 'create', id), after: { parentId: input.parentId, levelId: level.id, ...snapshot({ ...input, isActive: true }) } },
          tx,
        );
      });
    } catch (error) {
      throw isUniqueViolation(error) ? nameTaken() : error;
    }
    return this.view(actor, id);
  }

  /** Many locations of one level under one parent, all or none. */
  async bulk(actor: Actor, input: LocationBulkInput): Promise<BulkResult> {
    const parent = await this.tree.parentFor(actor.access, actor.societyId, input.parentId, 'locations');
    const level = await this.level(actor.societyId, input.levelId, parent);
    const taken = await this.tree.takenNames(actor.societyId, parent?.id ?? null, input.names);
    if (taken.length > 0) throw takenError(taken);

    const rows = input.names.map((name) => {
      const id = randomUUID();
      return {
        id,
        society_id: actor.societyId,
        parent_id: parent?.id ?? null,
        level_id: level.id,
        name,
        path: locationPath(parent?.path ?? null, id),
      };
    });
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.locations.createMany({ data: rows });
        await this.audit.record(
          { ...auditOf(actor, 'bulk_create', parent?.id ?? null), after: { levelId: level.id, names: input.names } },
          tx,
        );
      });
    } catch (error) {
      throw isUniqueViolation(error) ? nameTaken() : error;
    }
    return { created: rows.length };
  }

  async update(actor: Actor, id: string, input: LocationUpdateInput): Promise<LocationView> {
    const before = await this.visible(actor, id);
    if (!actor.access.can('edit', 'locations', { path: before.path })) throw beyondPermissions();
    if (input.code !== undefined && (await this.tree.codeInUse(actor.societyId, input.code, id))) throw codeTaken();

    const after = { ...before, ...definedOnly(input) };
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.locations.update({ where: { id }, data: { name: after.name, code: after.code, is_active: after.isActive } });
        await this.audit.record({ ...auditOf(actor, 'update', id), before: snapshot(before), after: snapshot(after) }, tx);
      });
    } catch (error) {
      throw isUniqueViolation(error) ? nameTaken() : error;
    }
    return this.view(actor, id);
  }

  /** Only an empty location that nothing refers to; otherwise deactivate it instead. */
  async remove(actor: Actor, id: string): Promise<void> {
    const before = await this.visible(actor, id);
    if (!actor.access.can('delete', 'locations', { path: before.path })) throw beyondPermissions();
    const children = await this.prisma.locations.count({ where: { parent_id: id } });
    if (children > 0) {
      throw new ConflictException({ code: 'location_has_children', message: 'Remove or move what is under this location first' });
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.locations.delete({ where: { id } });
        await this.audit.record({ ...auditOf(actor, 'delete', id), before: snapshot(before) }, tx);
      });
    } catch (error) {
      if (isForeignKeyViolation(error)) throw inUse();
      throw error;
    }
  }

  /** A location of the tree (not a unit) that the caller may view. */
  private async visible(actor: Actor, id: string): Promise<LocationRow> {
    const row = await this.tree.visible(actor.access, actor.societyId, 'locations', id);
    if (row.isUnit) throw locationNotFound();
    return row;
  }

  /** The level of a new location: in this society, not the unit level, deeper than its parent. */
  private async level(societyId: string, levelId: string, parent: LocationRow | null) {
    const level = await this.prisma.location_levels.findFirst({
      where: { id: levelId, society_id: societyId },
      select: { id: true, depth: true, is_unit_level: true },
    });
    if (!level || level.is_unit_level || (parent && level.depth <= parent.depth)) throw invalidLevel();
    return level;
  }
}

export const inUse = () =>
  new ConflictException({ code: 'location_in_use', message: 'Other records still refer to this location; deactivate it instead' });

export const takenError = (names: string[]) =>
  new ConflictException({ code: 'location_name_taken', message: 'Some names already exist here', details: { names } });

/** The fields of a PATCH body that were sent. */
export function definedOnly<T extends object>(input: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}

const auditOf = (actor: Actor, action: string, entityId: string | null) => ({
  societyId: actor.societyId,
  userId: actor.userId,
  action,
  entityType: 'location',
  entityId,
  ip: actor.ip,
});
