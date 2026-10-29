import { Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import type { LocationNode, StoreyRef } from '@s57/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { TreeService } from './tree.service.js';

/**
 * The other storeys a unit covers (`unit_storeys`, Step 37): a duplex. Only combining units
 * (`CombineService`) writes these links; the unit lives at its own storey and owners,
 * renters and bills stay on it.
 */
@Injectable()
export class UnitStoreysService {
  constructor(
    private readonly prisma: PrismaService,
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
