import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import type { Crumb, LocationNode, PermissionModule } from '@s57/shared';
import type { CallerAccess } from '../permissions/caller-access.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** The facts about one location that checks and writes need. */
export type LocationRow = {
  id: string;
  parentId: string | null;
  path: string;
  name: string;
  code: string | null;
  isActive: boolean;
  depth: number;
  isUnit: boolean;
};

type NodeRow = {
  id: string;
  parent_id: string | null;
  name: string;
  code: string | null;
  level_id: string;
  depth: number;
  name_bn: string;
  name_en: string | null;
  is_unit_level: boolean;
  is_active: boolean;
  child_count: number;
  unit_count: number;
};

export const locationNotFound = () => new NotFoundException({ code: 'location_not_found', message: 'Location not found' });
export const beyondPermissions = () =>
  new ForbiddenException({ code: 'beyond_your_permissions', message: 'This is outside what you may change' });
export const nameTaken = () =>
  new ConflictException({ code: 'location_name_taken', message: 'A location with this name already exists here' });
export const codeTaken = () =>
  new ConflictException({ code: 'location_code_taken', message: 'Another location already has this holding number' });

/** The ids in a `locations.path`, top first. */
export const pathIds = (path: string) => path.split('/').filter(Boolean);

/** Reads the location tree: single rows, children with their counts, breadcrumbs. Always within one society. */
@Injectable()
export class TreeService {
  constructor(private readonly prisma: PrismaService) {}

  async find(societyId: string, id: string): Promise<LocationRow | null> {
    const row = await this.prisma.locations.findFirst({
      where: { id, society_id: societyId },
      select: {
        id: true,
        parent_id: true,
        path: true,
        name: true,
        code: true,
        is_active: true,
        location_levels: { select: { depth: true, is_unit_level: true } },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      parentId: row.parent_id,
      path: row.path,
      name: row.name,
      code: row.code,
      isActive: row.is_active,
      depth: row.location_levels.depth,
      isUnit: row.location_levels.is_unit_level,
    };
  }

  /**
   * A location the caller may `view` on `module`, or 404 (missing, another society, or
   * outside the caller's area all look the same).
   */
  async visible(access: CallerAccess, societyId: string, module: PermissionModule, id: string): Promise<LocationRow> {
    const row = await this.find(societyId, id);
    if (!row || !access.can('view', module, { path: row.path })) throw locationNotFound();
    return row;
  }

  /** Nodes with their counts, in natural name order (the column's collation). */
  async nodes(societyId: string, where: Prisma.Sql): Promise<LocationNode[]> {
    const rows = await this.prisma.$queryRaw<NodeRow[]>`
      select l.id, l.parent_id, l.name, l.code, l.level_id, lv.depth, lv.name_bn, lv.name_en, lv.is_unit_level, l.is_active,
        (select count(*) from locations c where c.parent_id = l.id)::int as child_count,
        (select count(*) from units u join locations d on d.id = u.location_id
          where d.society_id = l.society_id and d.id <> l.id and starts_with(d.path, l.path))::int as unit_count
      from locations l
      join location_levels lv on lv.id = l.level_id
      where l.society_id = ${societyId}::uuid and ${where}
      order by lv.depth, l.name, l.id`;
    return rows.map((row) => ({
      id: row.id,
      parentId: row.parent_id,
      name: row.name,
      code: row.code,
      levelId: row.level_id,
      depth: row.depth,
      levelBn: row.name_bn,
      levelEn: row.name_en,
      isUnit: row.is_unit_level,
      isActive: row.is_active,
      childCount: row.child_count,
      unitCount: row.unit_count,
    }));
  }

  async node(societyId: string, id: string): Promise<LocationNode> {
    const [node] = await this.nodes(societyId, Prisma.sql`l.id = ${id}::uuid`);
    if (!node) throw locationNotFound();
    return node;
  }

  children(societyId: string, parentId: string): Promise<LocationNode[]> {
    return this.nodes(societyId, Prisma.sql`l.parent_id = ${parentId}::uuid`);
  }

  /**
   * The ancestors of a path, top first. `open` says whether the caller may view each
   * one on `module`; names above the caller's area are shown but not linked.
   */
  async breadcrumb(access: CallerAccess, societyId: string, path: string, module: PermissionModule): Promise<Crumb[]> {
    const ids = pathIds(path).slice(0, -1);
    if (ids.length === 0) return [];
    const rows = await this.prisma.locations.findMany({
      where: { id: { in: ids }, society_id: societyId },
      select: { id: true, name: true, path: true, location_levels: { select: { name_bn: true, name_en: true } } },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      if (!row) return [];
      return [
        {
          id,
          name: row.name,
          levelBn: row.location_levels.name_bn,
          levelEn: row.location_levels.name_en,
          open: access.can('view', module, { path: row.path }),
        },
      ];
    });
  }

  /**
   * The parent a new location or unit goes under, after the checks: the caller sees it
   * (else 404) and may `create` on `module` there (else 403); it is active and not a
   * unit. `null` (top level) needs `create` for the whole society.
   */
  async parentFor(access: CallerAccess, societyId: string, parentId: string | null, module: PermissionModule): Promise<LocationRow | null> {
    if (parentId === null) {
      if (access.paths('create', module) !== 'all') throw beyondPermissions();
      return null;
    }
    const parent = await this.find(societyId, parentId);
    const located = parent ? { path: parent.path } : null;
    if (!parent || !located || !(access.can('view', 'locations', located) || access.can('view', module, located))) {
      throw locationNotFound();
    }
    if (!access.can('create', module, located)) throw beyondPermissions();
    if (parent.isUnit) throw new BadRequestException({ code: 'invalid_level', message: 'Nothing can be added under a unit' });
    if (!parent.isActive) throw new ConflictException({ code: 'parent_inactive', message: 'The parent location is inactive' });
    return parent;
  }

  /** Names already used directly under `parentId` (top level when null). */
  async takenNames(societyId: string, parentId: string | null, names: string[]): Promise<string[]> {
    const rows = await this.prisma.locations.findMany({
      where: { society_id: societyId, parent_id: parentId, name: { in: names } },
      select: { name: true },
    });
    return rows.map((row) => row.name);
  }

  /** A holding code already used by another location of the society? */
  async codeInUse(societyId: string, code: string | null | undefined, exceptId?: string): Promise<boolean> {
    if (!code) return false;
    const row = await this.prisma.locations.findFirst({
      where: { society_id: societyId, code, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { id: true },
    });
    return row !== null;
  }
}
