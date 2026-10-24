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
import { addressOf, TreeService } from '../property/tree.service.js';
import { AreaTree, inScope } from './area-tree.js';

/**
 * The area reports (`billing.view`, limited to the caller's area): collection by area
 * (billed against paid, per place under a parent) and arrears (units with overdue bills,
 * aged). Both are read-only sums over `invoices`.
 */
@Injectable()
export class AreaReportsService {
  private readonly areas: AreaTree;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tree: TreeService,
  ) {
    this.areas = new AreaTree(prisma, tree, 'billing');
  }

  async collection(access: CallerAccess, societyId: string, query: CollectionQuery): Promise<CollectionReport> {
    const { from, to } = rangeOf(query);
    const parent = await this.areas.parent(access, societyId, query.parentId);
    const prefix = parent?.path ?? '/';
    const [children, sums] = await Promise.all([
      this.areas.children(access, societyId, parent),
      this.prisma.$queryRaw<{ area_id: string; bills: number; billed: string; collected: string }[]>`
        SELECT split_part(substr(l.path, ${prefix.length + 1}), '/', 1) AS area_id,
               count(*)::int AS bills,
               sum(i.total)::numeric(16,2)::text AS billed,
               sum(i.paid)::numeric(16,2)::text AS collected
        FROM invoices i JOIN locations l ON l.id = i.unit_id
        WHERE i.society_id = ${societyId}::uuid AND i.kind = 'regular' AND i.status <> 'void'
          AND i.issue_date BETWEEN ${from}::date AND ${to}::date
          AND starts_with(l.path, ${prefix}) AND l.path <> ${prefix} AND ${inScope(access, 'billing')}
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
      crumbs: await this.areas.crumbs(access, societyId, parent),
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
    const location = await this.areas.parent(access, societyId, query.locationId);
    const prefix = location?.path ?? '/';
    const where = Prisma.sql`i.society_id = ${societyId}::uuid AND i.unit_id IS NOT NULL AND i.status IN ('unpaid', 'partial')
      AND i.due_date < ${today}::date AND starts_with(l.path, ${prefix}) AND ${inScope(access, 'billing')}`;
    // Overdue 1–30 days: due on or after today − 30; 31–90: from today − 90; more: before that.
    const buckets = Prisma.sql`
      coalesce(sum(i.total - i.paid) FILTER (WHERE i.due_date >= ${today}::date - 30), 0)::numeric(16,2)::text AS d30,
      coalesce(sum(i.total - i.paid) FILTER (WHERE i.due_date < ${today}::date - 30 AND i.due_date >= ${today}::date - 90), 0)::numeric(16,2)::text AS d90,
      coalesce(sum(i.total - i.paid) FILTER (WHERE i.due_date < ${today}::date - 90), 0)::numeric(16,2)::text AS older`;

    const [children, rows, [totals]] = await Promise.all([
      this.areas.children(access, societyId, location),
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
      crumbs: await this.areas.crumbs(access, societyId, location),
      children: children.filter((child) => !child.isUnit).map((child) => ({ id: child.id, name: child.name })),
      rows: items,
      totals: totals!,
      truncated: rows.length > ARREARS_LIMIT,
    };
  }
}
