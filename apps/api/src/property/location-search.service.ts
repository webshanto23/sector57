import { Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import { digitVariants, LOCATION_SEARCH_PAGE_SIZE, type LevelCounts, type LocationSearch, type LocationSearchQuery } from '@s57/shared';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addressOf, scopeSql, TreeService } from './tree.service.js';

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

/**
 * The property map's level picker and search: places (never units) inside one place or
 * the caller's whole tree, in their `locations` area.
 */
@Injectable()
export class LocationSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tree: TreeService,
  ) {}

  async search(actor: Actor, query: LocationSearchQuery): Promise<LocationSearch> {
    const pageSize = LOCATION_SEARCH_PAGE_SIZE;
    const where = await this.where(actor, query.under);
    if (!where) return { items: [], total: 0, page: query.page, pageSize };
    const and = [where];
    if (query.levelId) and.push(Prisma.sql`l.level_id = ${query.levelId}::uuid`);
    if (query.q) {
      const terms = Prisma.sql`array[${Prisma.join(digitVariants(query.q).map((term) => `%${escapeLike(term)}%`))}]::text[]`;
      and.push(Prisma.sql`(l.name ilike any(${terms}) or coalesce(l.code, '') ilike any(${terms}))`);
    }
    const filter = Prisma.join(and, ' and ');

    const [rows, counted] = await Promise.all([
      this.prisma.$queryRaw<{ id: string; path: string }[]>`
        select l.id, l.path from locations l join location_levels lv on lv.id = l.level_id
        where ${filter}
        order by lv.depth, l.name, l.id
        limit ${pageSize} offset ${(query.page - 1) * pageSize}`,
      this.prisma.$queryRaw<{ total: number }[]>`
        select count(*)::int as total from locations l join location_levels lv on lv.id = l.level_id where ${filter}`,
    ]);
    if (rows.length === 0) return { items: [], total: counted[0]?.total ?? 0, page: query.page, pageSize };

    const ids = Prisma.join(rows.map((row) => Prisma.sql`${row.id}::uuid`));
    const [nodes, names] = await Promise.all([
      this.tree.nodes(actor.societyId, Prisma.sql`l.id in (${ids})`),
      this.tree.addressNames(
        actor.societyId,
        rows.map((row) => row.path),
      ),
    ]);
    const paths = new Map(rows.map((row) => [row.id, row.path]));
    const items = nodes.map((node) => ({ ...node, address: addressOf(paths.get(node.id)!, names) }));
    return { items, total: counted[0]?.total ?? 0, page: query.page, pageSize };
  }

  /** Places per level below `under` (or in the caller's whole tree), unit level left out. */
  async levelCounts(actor: Actor, under: string | undefined): Promise<LevelCounts> {
    const where = await this.where(actor, under);
    if (!where) return { items: [] };
    const rows = await this.prisma.$queryRaw<{ level_id: string; count: number }[]>`
      select l.level_id, count(*)::int as count from locations l join location_levels lv on lv.id = l.level_id
      where ${where} group by l.level_id`;
    return { items: rows.map((row) => ({ levelId: row.level_id, count: row.count })) };
  }

  /** Places in the society and the caller's area, below `under` when given (404 outside the area), never units. */
  private async where(actor: Actor, under: string | undefined): Promise<Prisma.Sql | null> {
    const scope = scopeSql(actor.access, 'locations');
    if (!scope) return null;
    const and = [Prisma.sql`l.society_id = ${actor.societyId}::uuid`, Prisma.sql`not lv.is_unit_level`, scope];
    if (under) {
      const place = await this.tree.visible(actor.access, actor.societyId, 'locations', under);
      and.push(Prisma.sql`starts_with(l.path, ${place.path}) and l.id <> ${place.id}::uuid`);
    }
    return Prisma.join(and, ' and ');
  }
}
