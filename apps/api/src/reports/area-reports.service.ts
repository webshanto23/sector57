import { Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  addMoney,
  ARREARS_LIMIT,
  billToSnapshotSchema,
  percentOf,
  subtractMoney,
  type ArrearsQuery,
  type ArrearsReport,
  type ArrearsRow,
  type CollectionQuery,
  type CollectionReport,
} from '@s57/shared';
import { isoDate, todayDate } from '../common/dates.js';
import { rangeOf } from '../ledger/ledger.service.js';
import type { CallerAccess } from '../permissions/caller-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addressOf, locationNotFound, pathIds, TreeService } from '../property/tree.service.js';

type Place = { id: string; name: string; path: string; isUnit: boolean };
type Crumb = { id: string; name: string; open: boolean };

/** Bills of units in the caller's `billing.view` area, as SQL on `l` (the unit's location). */
function inScope(access: CallerAccess): Prisma.Sql {
  const scope = access.paths('view', 'billing');
  if (scope === 'all') return Prisma.sql`TRUE`;
  if (scope.length === 0) return Prisma.sql`FALSE`;
  return Prisma.sql`(${Prisma.join(
    scope.map((path) => Prisma.sql`starts_with(l.path, ${path})`),
    ' OR ',
  )})`;
}

/** The caller sees figures at or under `path`: they hold `billing.view` there, or their area lies under it. */
function reaches(access: CallerAccess, path: string): boolean {
  const scope = access.paths('view', 'billing');
  return scope === 'all' || scope.some((own) => own.startsWith(path) || path.startsWith(own));
}

/**
 * The area reports (`billing.view`, limited to the caller's area): collection by area
 * (billed against paid, per place under a parent) and arrears (units with overdue bills,
 * aged). Both are read-only sums over `invoices`.
 */
@Injectable()
export class AreaReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tree: TreeService,
  ) {}

  async collection(access: CallerAccess, societyId: string, query: CollectionQuery): Promise<CollectionReport> {
    const { from, to } = rangeOf(query);
    const parent = await this.parent(access, societyId, query.parentId);
    const prefix = parent?.path ?? '/';
    const [children, sums] = await Promise.all([
      this.children(access, societyId, parent),
      this.prisma.$queryRaw<{ area_id: string; bills: number; billed: string; collected: string }[]>`
        SELECT split_part(substr(l.path, ${prefix.length + 1}), '/', 1) AS area_id,
               count(*)::int AS bills,
               sum(i.total)::numeric(16,2)::text AS billed,
               sum(i.paid)::numeric(16,2)::text AS collected
        FROM invoices i JOIN locations l ON l.id = i.unit_id
        WHERE i.society_id = ${societyId}::uuid AND i.kind = 'regular' AND i.status <> 'void'
          AND i.issue_date BETWEEN ${from}::date AND ${to}::date
          AND starts_with(l.path, ${prefix}) AND l.path <> ${prefix} AND ${inScope(access)}
        GROUP BY 1`,
    ]);
    const byArea = new Map(sums.map((row) => [row.area_id, row]));
    const figures = (bills: number, billed: string, collected: string) => ({
      bills,
      billed,
      collected,
      outstanding: subtractMoney(billed, collected),
      percent: percentOf(collected, billed),
    });
    const areas = children.map((child) => {
      const sum = byArea.get(child.id);
      return { id: child.id, name: child.name, isUnit: child.isUnit, ...figures(sum?.bills ?? 0, sum?.billed ?? '0.00', sum?.collected ?? '0.00') };
    });
    const billed = addMoney('0', ...sums.map((row) => row.billed));
    const collected = addMoney('0', ...sums.map((row) => row.collected));
    return {
      from,
      to,
      parent: parent ? { id: parent.id, name: parent.name } : null,
      crumbs: await this.crumbs(access, societyId, parent),
      areas,
      totals: figures(
        sums.reduce((count, row) => count + row.bills, 0),
        billed,
        collected,
      ),
    };
  }

  async arrears(access: CallerAccess, societyId: string, query: ArrearsQuery): Promise<ArrearsReport> {
    const today = isoDate(todayDate());
    const location = await this.parent(access, societyId, query.locationId);
    const prefix = location?.path ?? '/';
    const where = Prisma.sql`i.society_id = ${societyId}::uuid AND i.unit_id IS NOT NULL AND i.status IN ('unpaid', 'partial')
      AND i.due_date < ${today}::date AND starts_with(l.path, ${prefix}) AND ${inScope(access)}`;
    // Overdue 1–30 days: due on or after today − 30; 31–90: from today − 90; more: before that.
    const buckets = Prisma.sql`
      coalesce(sum(i.total - i.paid) FILTER (WHERE i.due_date >= ${today}::date - 30), 0)::numeric(16,2)::text AS d30,
      coalesce(sum(i.total - i.paid) FILTER (WHERE i.due_date < ${today}::date - 30 AND i.due_date >= ${today}::date - 90), 0)::numeric(16,2)::text AS d90,
      coalesce(sum(i.total - i.paid) FILTER (WHERE i.due_date < ${today}::date - 90), 0)::numeric(16,2)::text AS older`;

    const [children, rows, [totals]] = await Promise.all([
      this.children(access, societyId, location),
      this.prisma.$queryRaw<
        { unit_id: string; name: string; code: string | null; path: string; bills: number; oldest: Date; owed: string; d30: string; d90: string; older: string; bill_to: unknown }[]
      >`
        SELECT i.unit_id, l.name, l.code, l.path, count(*)::int AS bills, min(i.due_date) AS oldest,
               sum(i.total - i.paid)::numeric(16,2)::text AS owed, ${buckets},
               (array_agg(i.bill_to_snapshot ORDER BY i.due_date DESC, i.issue_date DESC, i.id))[1] AS bill_to
        FROM invoices i
        JOIN locations l ON l.id = i.unit_id
        LEFT JOIN locations pl ON pl.id = l.parent_id
        WHERE ${where}
        GROUP BY i.unit_id, l.name, l.code, l.path, pl.name, l.id
        ORDER BY pl.name, l.name, l.id
        LIMIT ${ARREARS_LIMIT + 1}`,
      this.prisma.$queryRaw<{ units: number; bills: number; owed: string; d30: string; d90: string; older: string }[]>`
        SELECT count(DISTINCT i.unit_id)::int AS units, count(*)::int AS bills,
               coalesce(sum(i.total - i.paid), 0)::numeric(16,2)::text AS owed, ${buckets}
        FROM invoices i JOIN locations l ON l.id = i.unit_id
        WHERE ${where}`,
    ]);

    const listed = rows.slice(0, ARREARS_LIMIT);
    const names = await this.tree.addressNames(societyId, listed.map((row) => row.path));
    const items = listed.map((row): ArrearsRow => {
      const billTo = billToSnapshotSchema.pick({ name: true, phone: true }).safeParse(row.bill_to);
      return {
        unitId: row.unit_id,
        unit: row.name,
        code: row.code,
        address: addressOf(row.path, names),
        billTo: billTo.success ? { name: billTo.data.name, phone: billTo.data.phone } : null,
        bills: row.bills,
        oldestDue: isoDate(row.oldest),
        owed: row.owed,
        buckets: { d30: row.d30, d90: row.d90, older: row.older },
      };
    });
    return {
      asOf: today,
      location: location ? { id: location.id, name: location.name } : null,
      crumbs: await this.crumbs(access, societyId, location),
      children: children.filter((child) => !child.isUnit).map((child) => ({ id: child.id, name: child.name })),
      rows: items,
      totals: totals!,
      truncated: rows.length > ARREARS_LIMIT,
    };
  }

  /**
   * The place a report looks under. Asked for: one the caller reaches (else 404). Not asked
   * for: the society's one top-level place, or the top itself (null) when there are several.
   */
  private async parent(access: CallerAccess, societyId: string, id: string | undefined): Promise<Place | null> {
    if (id) {
      const row = await this.tree.find(societyId, id);
      if (!row || !reaches(access, row.path)) throw locationNotFound();
      return { id: row.id, name: row.name, path: row.path, isUnit: row.isUnit };
    }
    const roots = await this.prisma.locations.findMany({ where: { society_id: societyId, parent_id: null }, select: { id: true }, take: 2 });
    if (roots.length !== 1) return null;
    const root = await this.tree.find(societyId, roots[0]!.id);
    return root && reaches(access, root.path) ? { id: root.id, name: root.name, path: root.path, isUnit: root.isUnit } : null;
  }

  /** The places directly under `parent` (or at the top) that the caller reaches, in natural name order. */
  private async children(access: CallerAccess, societyId: string, parent: Place | null): Promise<Place[]> {
    const rows = await this.prisma.$queryRaw<{ id: string; name: string; path: string; is_unit: boolean }[]>`
      SELECT l.id, l.name, l.path, lv.is_unit_level AS is_unit
      FROM locations l JOIN location_levels lv ON lv.id = l.level_id
      WHERE l.society_id = ${societyId}::uuid AND ${parent ? Prisma.sql`l.parent_id = ${parent.id}::uuid` : Prisma.sql`l.parent_id IS NULL`}
      ORDER BY l.name, l.id`;
    return rows.filter((row) => reaches(access, row.path)).map((row) => ({ id: row.id, name: row.name, path: row.path, isUnit: row.is_unit }));
  }

  /** The way down to `place`, itself included; `open` when the caller may look there. */
  private async crumbs(access: CallerAccess, societyId: string, place: Place | null): Promise<Crumb[]> {
    if (!place) return [];
    const ids = pathIds(place.path);
    const rows = await this.prisma.locations.findMany({ where: { id: { in: ids }, society_id: societyId }, select: { id: true, name: true, path: true } });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [{ id, name: row.name, open: reaches(access, row.path) }] : [];
    });
  }
}
