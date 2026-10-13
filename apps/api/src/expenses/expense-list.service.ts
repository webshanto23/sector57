import { Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import { digitVariants, fiscalYearOf, TIME_ZONE, type ExpenseList, type ExpenseListQuery } from '@s57/shared';
import { isoDate, todayDate } from '../common/dates.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { rowSelect, toRow, VOUCHER_ENTITY } from './expense-rows.js';

/** `\`, `%` and `_` typed in a search mean themselves. */
const likeTerm = (term: string) => `%${term.replace(/[\\%_]/g, '\\$&')}%`;
const paidDay = Prisma.sql`(e.paid_at AT TIME ZONE ${TIME_ZONE})::date`;

/** The expenses list with its totals and stat cards. */
@Injectable()
export class ExpenseListService {
  constructor(private readonly prisma: PrismaService) {}


  async list(actor: Actor, query: ExpenseListQuery): Promise<ExpenseList> {
    const { page, pageSize } = query;
    const where = Prisma.join(this.filters(actor, query), ' AND ');
    const from = Prisma.sql`expenses e LEFT JOIN vendors v ON v.id = e.vendor_id`;
    const [ids, [figures], summary] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT e.id FROM ${from} WHERE ${where}
        ORDER BY e.spent_on DESC, e.created_at DESC, e.id
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      this.prisma.$queryRaw<{ total: number; count: number; amount: string }[]>`
        SELECT count(*)::int AS total,
               (count(*) FILTER (WHERE e.status NOT IN ('rejected', 'void')))::int AS count,
               coalesce(sum(e.amount) FILTER (WHERE e.status NOT IN ('rejected', 'void')), 0)::numeric(16,2)::text AS amount
        FROM ${from} WHERE ${where}`,
      this.summary(actor.societyId),
    ]);
    const idList = ids.map((row) => row.id);
    const [rows, vouchers] = await Promise.all([
      this.prisma.expenses.findMany({ where: { id: { in: idList } }, select: rowSelect }),
      idList.length
        ? this.prisma.documents.groupBy({
            by: ['entity_id'],
            where: { society_id: actor.societyId, entity_type: VOUCHER_ENTITY, entity_id: { in: idList } },
            _count: { _all: true },
          })
        : [],
    ]);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const counts = new Map(vouchers.map((row) => [row.entity_id, row._count._all]));
    return {
      items: idList.flatMap((id) => {
        const row = byId.get(id);
        return row ? [{ ...toRow(row), vouchers: counts.get(id) ?? 0 }] : [];
      }),
      total: figures!.total,
      page,
      pageSize,
      totals: { count: figures!.count, amount: figures!.amount },
      summary,
    };
  }


  /** The stat cards: waiting, approved and unpaid, paid this month and this fiscal year. */
  private async summary(societyId: string): Promise<ExpenseList['summary']> {
    const today = isoDate(todayDate());
    const society = await this.prisma.societies.findUniqueOrThrow({ where: { id: societyId }, select: { fiscal_year_start_month: true } });
    const year = fiscalYearOf(today, society.fiscal_year_start_month);
    const monthStart = `${today.slice(0, 7)}-01`;
    const [row] = await this.prisma.$queryRaw<
      { p_count: number; p_amount: string; a_count: number; a_amount: string; m_count: number; m_amount: string; y_count: number; y_amount: string }[]
    >`
      SELECT (count(*) FILTER (WHERE e.status = 'pending'))::int AS p_count,
             coalesce(sum(e.amount) FILTER (WHERE e.status = 'pending'), 0)::numeric(16,2)::text AS p_amount,
             (count(*) FILTER (WHERE e.status = 'approved'))::int AS a_count,
             coalesce(sum(e.amount) FILTER (WHERE e.status = 'approved'), 0)::numeric(16,2)::text AS a_amount,
             (count(*) FILTER (WHERE e.status = 'paid' AND ${paidDay} >= ${monthStart}::date))::int AS m_count,
             coalesce(sum(e.amount) FILTER (WHERE e.status = 'paid' AND ${paidDay} >= ${monthStart}::date), 0)::numeric(16,2)::text AS m_amount,
             (count(*) FILTER (WHERE e.status = 'paid' AND ${paidDay} BETWEEN ${year.start}::date AND ${year.end}::date))::int AS y_count,
             coalesce(sum(e.amount) FILTER (WHERE e.status = 'paid' AND ${paidDay} BETWEEN ${year.start}::date AND ${year.end}::date), 0)::numeric(16,2)::text AS y_amount
      FROM expenses e WHERE e.society_id = ${societyId}::uuid`;
    return {
      pending: { count: row!.p_count, amount: row!.p_amount },
      approved: { count: row!.a_count, amount: row!.a_amount },
      paidMonth: { count: row!.m_count, amount: row!.m_amount },
      paidYear: { count: row!.y_count, amount: row!.y_amount, label: year.label },
    };
  }

  private filters(actor: Actor, query: ExpenseListQuery): Prisma.Sql[] {
    const and = [Prisma.sql`e.society_id = ${actor.societyId}::uuid`];
    if (query.status) and.push(Prisma.sql`e.status = ${query.status}`);
    if (query.headId) and.push(Prisma.sql`e.expense_head_id = ${query.headId}::uuid`);
    if (query.fundId) and.push(Prisma.sql`e.fund_id = ${query.fundId}::uuid`);
    if (query.vendorId) and.push(Prisma.sql`e.vendor_id = ${query.vendorId}::uuid`);
    if (query.from) and.push(Prisma.sql`e.spent_on >= ${query.from}::date`);
    if (query.to) and.push(Prisma.sql`e.spent_on <= ${query.to}::date`);
    if (query.requestedBy === 'me') and.push(Prisma.sql`e.requested_by = ${actor.userId}::uuid`);
    if (query.q) {
      const terms = digitVariants(query.q).map((term) => {
        const like = likeTerm(term);
        return Prisma.sql`(e.description ILIKE ${like} OR e.voucher_no ILIKE ${like} OR v.name ILIKE ${like})`;
      });
      and.push(Prisma.sql`(${Prisma.join(terms, ' OR ')})`);
    }
    return and;
  }
}
