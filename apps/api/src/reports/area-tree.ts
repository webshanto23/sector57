import { Prisma } from '@s57/db';
import type { PermissionAction, PermissionModule } from '@s57/shared';
import type { CallerAccess } from '../permissions/caller-access.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { locationNotFound, pathIds, type TreeService } from '../property/tree.service.js';

export type AreaPlace = { id: string; name: string; path: string; isUnit: boolean };
export type AreaCrumb = { id: string; name: string; open: boolean };

/** Rows whose place `l` lies in the caller's area for `module` (as SQL on `l.path`). */
export function inScope(access: CallerAccess, module: PermissionModule, action: PermissionAction = 'view'): Prisma.Sql {
  const scope = access.paths(action, module);
  if (scope === 'all') return Prisma.sql`TRUE`;
  if (scope.length === 0) return Prisma.sql`FALSE`;
  return Prisma.sql`(${Prisma.join(
    scope.map((path) => Prisma.sql`starts_with(l.path, ${path})`),
    ' OR ',
  )})`;
}

/** The caller sees figures at or under `path`: they hold the grant there, or their area lies under it. */
export function reaches(access: CallerAccess, path: string, module: PermissionModule, action: PermissionAction = 'view'): boolean {
  const scope = access.paths(action, module);
  return scope === 'all' || scope.some((own) => own.startsWith(path) || path.startsWith(own));
}

/**
 * Walking the place tree for an area report: the place it looks under, the places directly
 * below, and the breadcrumbs, each limited to what the caller reaches on `module`.
 */
export class AreaTree {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tree: TreeService,
    private readonly module: PermissionModule,
    private readonly action: PermissionAction = 'view',
  ) {}

  /**
   * The place a report looks under. Asked for: one the caller reaches (else 404). Not asked
   * for: the society's one top-level place, or the top itself (null) when there are several.
   */
  async parent(access: CallerAccess, societyId: string, id: string | undefined): Promise<AreaPlace | null> {
    if (id) {
      const row = await this.tree.find(societyId, id);
      if (!row || !reaches(access, row.path, this.module, this.action)) throw locationNotFound();
      return { id: row.id, name: row.name, path: row.path, isUnit: row.isUnit };
    }
    const roots = await this.prisma.locations.findMany({ where: { society_id: societyId, parent_id: null }, select: { id: true }, take: 2 });
    if (roots.length !== 1) return null;
    const root = await this.tree.find(societyId, roots[0]!.id);
    return root && reaches(access, root.path, this.module, this.action) ? { id: root.id, name: root.name, path: root.path, isUnit: root.isUnit } : null;
  }

  /** The places directly under `parent` (or at the top) that the caller reaches, in natural name order. */
  async children(access: CallerAccess, societyId: string, parent: AreaPlace | null): Promise<AreaPlace[]> {
    const rows = await this.prisma.$queryRaw<{ id: string; name: string; path: string; is_unit: boolean }[]>`
      SELECT l.id, l.name, l.path, lv.is_unit_level AS is_unit
      FROM locations l JOIN location_levels lv ON lv.id = l.level_id
      WHERE l.society_id = ${societyId}::uuid AND ${parent ? Prisma.sql`l.parent_id = ${parent.id}::uuid` : Prisma.sql`l.parent_id IS NULL`}
      ORDER BY l.name, l.id`;
    return rows.filter((row) => reaches(access, row.path, this.module, this.action)).map((row) => ({ id: row.id, name: row.name, path: row.path, isUnit: row.is_unit }));
  }

  /** The way down to `place`, itself included; `open` when the caller may look there. */
  async crumbs(access: CallerAccess, societyId: string, place: AreaPlace | null): Promise<AreaCrumb[]> {
    if (!place) return [];
    const ids = pathIds(place.path);
    const rows = await this.prisma.locations.findMany({ where: { id: { in: ids }, society_id: societyId }, select: { id: true, name: true, path: true } });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [{ id, name: row.name, open: reaches(access, row.path, this.module, this.action) }] : [];
    });
  }
}
