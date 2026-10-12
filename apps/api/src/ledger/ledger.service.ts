import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  addMoney,
  monthOfDay,
  monthStart,
  subtractMoney,
  type LedgerAccount,
  type LedgerLink,
  type LedgerQuery,
  type LedgerRow,
  type LedgerSource,
  type LedgerStatement,
} from '@s57/shared';
import { isoDate, todayDate } from '../common/dates.js';
import { fundNotFound } from '../finance/funds.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

type EntryRow = {
  id: string;
  entry_date: Date;
  fund_id: string;
  account: string;
  direction: string;
  amount: string;
  source_type: string;
  source_id: string;
  memo: string | null;
  reversal: boolean;
  reversed: boolean;
  balance: string;
  created_by: string | null;
};

/** The record behind a row, by the row's source. Adjustments have no page of their own. */
const LINKS: Partial<Record<LedgerSource, LedgerLink>> = {
  payment: 'receipt',
  donation: 'donation',
  expense: 'expense',
  transfer: 'transfer',
  opening: 'fund',
};

export const badRange = () => new BadRequestException({ code: 'invalid_range', message: 'The start date is after the end date' });

/** A range from the query: up to today, from the first of the end's month, by default. */
export function rangeOf(query: { from?: string | undefined; to?: string | undefined }): { from: string; to: string } {
  const to = query.to ?? isoDate(todayDate());
  const from = query.from ?? monthStart(monthOfDay(to));
  if (from > to) throw badRange();
  return { from, to };
}

/**
 * The fund ledger, read-only (`ledger.view`, society-wide): a statement of one fund (or all)
 * and one account (or both) for a range of days, with the balance before it, the running
 * balance after each row, and where each row came from.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async statement(societyId: string, query: LedgerQuery): Promise<LedgerStatement> {
    const { from, to } = rangeOf(query);
    const { page, pageSize } = query;
    const funds = await this.prisma.funds.findMany({
      where: { society_id: societyId },
      select: { id: true, name_bn: true, name_en: true, is_default: true, closed_at: true },
      orderBy: [{ is_default: 'desc' }, { closed_at: { sort: 'desc', nulls: 'first' } }, { name_bn: 'asc' }],
    });
    if (query.fundId && !funds.some((fund) => fund.id === query.fundId)) throw fundNotFound();

    const and = [Prisma.sql`le.society_id = ${societyId}::uuid`];
    if (query.fundId) and.push(Prisma.sql`le.fund_id = ${query.fundId}::uuid`);
    if (query.account) and.push(Prisma.sql`le.account = ${query.account}`);
    const where = Prisma.join(and, ' AND ');
    const signed = Prisma.sql`CASE WHEN le.direction = 'in' THEN le.amount ELSE -le.amount END`;

    const [figures] = await this.prisma.$queryRaw<{ opening: string; total_in: string; total_out: string; count: number }[]>`
      SELECT coalesce(sum(${signed}) FILTER (WHERE le.entry_date < ${from}::date), 0)::numeric(16,2)::text AS opening,
             coalesce(sum(le.amount) FILTER (WHERE le.direction = 'in' AND le.entry_date BETWEEN ${from}::date AND ${to}::date), 0)::numeric(16,2)::text AS total_in,
             coalesce(sum(le.amount) FILTER (WHERE le.direction = 'out' AND le.entry_date BETWEEN ${from}::date AND ${to}::date), 0)::numeric(16,2)::text AS total_out,
             (count(*) FILTER (WHERE le.entry_date BETWEEN ${from}::date AND ${to}::date))::int AS count
      FROM ledger_entries le WHERE ${where} AND le.entry_date <= ${to}::date`;
    const opening = figures!.opening;

    // The running balance is taken over the whole range before the page is cut.
    const rows = await this.prisma.$queryRaw<EntryRow[]>`
      SELECT le.id::text AS id, le.entry_date, le.fund_id, le.account, le.direction, le.amount::text AS amount,
             le.source_type, le.source_id, le.memo, le.created_by,
             le.reverses_id IS NOT NULL AS reversal,
             EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_id = le.id) AS reversed,
             (${opening}::numeric + sum(${signed}) OVER (ORDER BY le.entry_date, le.id))::numeric(16,2)::text AS balance
      FROM ledger_entries le
      WHERE ${where} AND le.entry_date BETWEEN ${from}::date AND ${to}::date
      ORDER BY le.entry_date, le.id
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;

    const userIds = [...new Set(rows.flatMap((row) => (row.created_by ? [row.created_by] : [])))];
    const users = userIds.length
      ? await this.prisma.users.findMany({ where: { id: { in: userIds } }, select: { id: true, phone: true, persons: { select: { full_name: true } } } })
      : [];
    const names = new Map(users.map((user) => [user.id, user.persons?.full_name ?? user.phone]));
    const fundById = new Map(funds.map((fund) => [fund.id, fund]));

    const items = rows.map((row): LedgerRow => {
      const fund = fundById.get(row.fund_id)!;
      const kind = LINKS[row.source_type as LedgerSource];
      return {
        id: row.id,
        date: isoDate(row.entry_date),
        fund: { id: fund.id, nameBn: fund.name_bn, nameEn: fund.name_en },
        account: row.account as LedgerAccount,
        direction: row.direction === 'in' ? 'in' : 'out',
        amount: row.amount,
        source: row.source_type as LedgerSource,
        link: kind ? { kind, id: kind === 'fund' ? row.fund_id : row.source_id } : null,
        reference: row.memo,
        reversal: row.reversal,
        reversed: row.reversed,
        balance: row.balance,
        by: row.created_by ? (names.get(row.created_by) ?? null) : null,
      };
    });

    const totalIn = figures!.total_in;
    const totalOut = figures!.total_out;
    return {
      from,
      to,
      fundId: query.fundId ?? null,
      account: query.account ?? null,
      opening,
      totalIn,
      totalOut,
      closing: subtractMoney(addMoney(opening, totalIn), totalOut),
      items,
      total: figures!.count,
      page,
      pageSize,
      funds: funds.map((fund) => ({ id: fund.id, nameBn: fund.name_bn, nameEn: fund.name_en, isDefault: fund.is_default, closed: fund.closed_at !== null })),
    };
  }
}
