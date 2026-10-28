import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import type { LocationNode, StoreyRef, UnitStoreysInput } from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beyondPermissions, TreeService } from './tree.service.js';

const invalidStorey = () => new BadRequestException({ code: 'invalid_storey', message: 'A unit can only cover storeys beside its own' });

/**
 * The other storeys a unit covers (`unit_storeys`, Step 37): a duplex, an office over three
 * floors. The unit lives at its own (lowest) storey; owners, renters and bills stay on it.
 * Coverable storeys are the places beside the unit's own storey: same parent, not units.
 */
@Injectable()
export class UnitStoreysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tree: TreeService,
  ) {}

  /** The storeys a unit covers besides its own, in name order. */
  async covers(societyId: string, unitId: string): Promise<StoreyRef[]> {
    const rows = await this.prisma.$queryRaw<StoreyRef[]>`
      select l.id, l.name from unit_storeys us join locations l on l.id = us.storey_id
      where us.society_id = ${societyId}::uuid and us.unit_id = ${unitId}::uuid
      order by l.name, l.id`;
    return rows;
  }

  /** Places beside the unit's own storey that it could cover, with their paths (for the area check). */
  async options(societyId: string, homeId: string): Promise<(StoreyRef & { path: string })[]> {
    return this.prisma.$queryRaw<(StoreyRef & { path: string })[]>`
      select l.id, l.name, l.path from locations l
      join location_levels lv on lv.id = l.level_id
      join locations home on home.id = ${homeId}::uuid
      where l.society_id = ${societyId}::uuid and not lv.is_unit_level and l.id <> home.id
        and l.parent_id is not distinct from home.parent_id
      order by l.name, l.id`;
  }

  /**
   * Replaces the list. Each storey must be an option; one being added or removed must also be
   * inside the caller's `units` area (a link outside it can be kept, not changed).
   */
  async replace(actor: Actor, unit: { id: string; parentId: string; path: string }, input: UnitStoreysInput): Promise<void> {
    if (!actor.access.can('edit', 'units', { path: unit.path })) throw beyondPermissions();
    const options = new Map((await this.options(actor.societyId, unit.parentId)).map((option) => [option.id, option]));
    if (input.storeyIds.some((id) => !options.has(id))) throw invalidStorey();
    const before = await this.covers(actor.societyId, unit.id);
    const was = new Set(before.map((storey) => storey.id));
    const now = new Set(input.storeyIds);
    const changed = [...input.storeyIds.filter((id) => !was.has(id)), ...[...was].filter((id) => !now.has(id))];
    // A storey no longer beside the unit can only be dropped, so its path is not needed.
    if (changed.some((id) => options.has(id) && !actor.access.can('view', 'units', { path: options.get(id)!.path }))) {
      throw beyondPermissions();
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.unit_storeys.deleteMany({ where: { unit_id: unit.id, society_id: actor.societyId } });
      await tx.unit_storeys.createMany({
        data: input.storeyIds.map((storeyId) => ({ unit_id: unit.id, storey_id: storeyId, society_id: actor.societyId })),
      });
      await this.audit.record(
        {
          societyId: actor.societyId,
          userId: actor.userId,
          action: 'update',
          entityType: 'unit',
          entityId: unit.id,
          before: { covers: before.map((storey) => storey.id) },
          after: { covers: input.storeyIds },
          ip: actor.ip,
        },
        tx,
      );
    });
  }

  /** Units that live beside a storey and cover it too, each with its own storey's name; only those `visible` by path. */
  async alsoHere(
    societyId: string,
    storeyId: string,
    visible: (path: string) => boolean,
  ): Promise<(LocationNode & { homeName: string })[]> {
    const nodes = await this.tree.nodes(
      societyId,
      Prisma.sql`l.id in (select us.unit_id from unit_storeys us where us.society_id = ${societyId}::uuid and us.storey_id = ${storeyId}::uuid)`,
    );
    if (nodes.length === 0) return [];
    const ids = [...nodes.map((node) => node.id), ...nodes.flatMap((node) => (node.parentId ? [node.parentId] : []))];
    const rows = await this.prisma.locations.findMany({ where: { society_id: societyId, id: { in: ids } }, select: { id: true, name: true, path: true } });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return nodes
      .filter((node) => visible(byId.get(node.id)!.path))
      .map((node) => ({ ...node, homeName: (node.parentId && byId.get(node.parentId)?.name) ?? '' }));
  }
}
