import { Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  addMoney,
  budgetFigures,
  fiscalYearOf,
  fiscalYearStarting,
  subtractMoney,
  CHARGE_KINDS,
  type ChargeKind,
  type IncomeQuery,
  type IncomeReport,
} from '@s57/shared';
import { isoDate, todayDate } from '../common/dates.js';
import { yearOf } from '../expenses/budgets.service.js';
import { fundNotFound } from '../finance/funds.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const toChargeKind = (kind: string): ChargeKind => ((CHARGE_KINDS as readonly string[]).includes(kind) ? (kind as ChargeKind) : 'fee');

/**
 * Income and expenditure for a fiscal year (`ledger.view`), on a cash basis: built from the
 * ledger rows dated in the year, so it agrees with the fund statements. Bill receipts are split
 * by charge type by settling each bill's lines in their order (`position`): a payment first
 * fills what earlier, still valid payments left of the first line, then the next. A voided
 * receipt's reversing row takes back the same split. Transfers and opening balances are
 * neither income nor expenditure.
 */
@Injectable()
export class IncomeService {
  constructor(private readonly prisma: PrismaService) {}

  async build(societyId: string, query: IncomeQuery, canBudgets: boolean): Promise<IncomeReport> {
    const society = await this.prisma.societies.findUniqueOrThrow({ where: { id: societyId }, select: { fiscal_year_start_month: true } });
    const startMonth = society.fiscal_year_start_month;
    const current = fiscalYearOf(isoDate(todayDate()), startMonth);
    const year = query.year ? yearOf(query.year, startMonth) : current;
    const funds = await this.prisma.funds.findMany({
      where: { society_id: societyId },
      select: { id: true, name_bn: true, name_en: true, is_default: true },
      orderBy: [{ is_default: 'desc' }, { name_bn: 'asc' }],
    });
    if (query.fundId && !funds.some((fund) => fund.id === query.fundId)) throw fundNotFound();

    const inYear = Prisma.sql`le.society_id = ${societyId}::uuid AND le.entry_date BETWEEN ${year.start}::date AND ${year.end}::date
      ${query.fundId ? Prisma.sql`AND le.fund_id = ${query.fundId}::uuid` : Prisma.empty}`;
    const signedIn = Prisma.sql`CASE WHEN le.direction = 'in' THEN 1 ELSE -1 END`;

    // Run one after another: these are heavy and share the pool with the rest of the API.
    const collected = await this.prisma.$queryRaw<{ charge_type_id: string; collected: string }[]>`
      WITH alloc AS (
        SELECT pa.payment_id, pa.invoice_id, pa.amount,
               coalesce(sum(pa.amount) FILTER (WHERE p.voided_at IS NULL) OVER (
                 PARTITION BY pa.invoice_id ORDER BY p.received_at, p.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS before
        FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id
        WHERE p.society_id = ${societyId}::uuid
      ),
      lines AS (
        SELECT il.invoice_id, il.charge_type_id, il.amount,
               sum(il.amount) OVER (PARTITION BY il.invoice_id ORDER BY il.position, il.id) - il.amount AS start
        FROM invoice_lines il JOIN invoices i ON i.id = il.invoice_id
        WHERE i.society_id = ${societyId}::uuid
      ),
      split AS (
        SELECT a.payment_id, i.fund_id, l.charge_type_id,
               sum(greatest(0, least(l.start + l.amount, a.before + a.amount) - greatest(l.start, a.before))) AS amount
        FROM alloc a JOIN invoices i ON i.id = a.invoice_id JOIN lines l ON l.invoice_id = a.invoice_id
        GROUP BY a.payment_id, i.fund_id, l.charge_type_id
      )
      SELECT s.charge_type_id, sum(${signedIn} * s.amount)::numeric(16,2)::text AS collected
      FROM ledger_entries le JOIN split s ON s.payment_id = le.source_id AND s.fund_id = le.fund_id
      WHERE ${inYear} AND le.source_type = 'payment'
      GROUP BY s.charge_type_id`;
    const billed = await this.prisma.$queryRaw<{ charge_type_id: string; billed: string }[]>`
      SELECT il.charge_type_id, sum(il.amount)::numeric(16,2)::text AS billed
      FROM invoice_lines il JOIN invoices i ON i.id = il.invoice_id
      WHERE i.society_id = ${societyId}::uuid AND i.kind <> 'opening' AND i.status <> 'void'
        AND i.issue_date BETWEEN ${year.start}::date AND ${year.end}::date
        ${query.fundId ? Prisma.sql`AND i.fund_id = ${query.fundId}::uuid` : Prisma.empty}
      GROUP BY il.charge_type_id`;
    const [donations] = await this.prisma.$queryRaw<{ amount: string }[]>`
      SELECT coalesce(sum(${signedIn} * le.amount), 0)::numeric(16,2)::text AS amount
      FROM ledger_entries le WHERE ${inYear} AND le.source_type = 'donation'`;
    // An expense's `out` row spends; its void's `in` row takes that back. The row is for the
    // expense's total, so each line counts its own amount under its head.
    const spent = await this.prisma.$queryRaw<{ head_id: string; spent: string }[]>`
      SELECT l.expense_head_id AS head_id, sum(-${signedIn} * l.amount)::numeric(16,2)::text AS spent
      FROM ledger_entries le JOIN expense_lines l ON l.expense_id = le.source_id
      WHERE ${inYear} AND le.source_type = 'expense'
      GROUP BY l.expense_head_id`;
    // Budgets are per society, not per fund: shown only for the whole society.
    const showBudgets = canBudgets && !query.fundId;
    const budgets = showBudgets
      ? await this.prisma.budgets.findMany({ where: { society_id: societyId, fiscal_year: year.label }, select: { expense_head_id: true, amount: true } })
      : [];
    const [first] = await this.prisma.$queryRaw<{ first: Date | null }[]>`
      SELECT min(entry_date) AS first FROM ledger_entries WHERE society_id = ${societyId}::uuid`;

    const chargeIds = [...new Set([...collected.map((row) => row.charge_type_id), ...billed.map((row) => row.charge_type_id)])];
    const headIds = [...new Set([...spent.map((row) => row.head_id), ...budgets.map((row) => row.expense_head_id)])];
    const [charges, heads] = await Promise.all([
      this.prisma.charge_types.findMany({
        where: { id: { in: chargeIds } },
        select: { id: true, name_bn: true, name_en: true, kind: true },
        orderBy: [{ name_bn: 'asc' }],
      }),
      this.prisma.expense_heads.findMany({ where: { id: { in: headIds } }, select: { id: true, name_bn: true, name_en: true }, orderBy: [{ name_bn: 'asc' }] }),
    ]);

    const collectedBy = new Map(collected.map((row) => [row.charge_type_id, row.collected]));
    const billedBy = new Map(billed.map((row) => [row.charge_type_id, row.billed]));
    const spentBy = new Map(spent.map((row) => [row.head_id, row.spent]));
    const budgetBy = new Map(budgets.map((row) => [row.expense_head_id, row.amount.toFixed(2)]));

    const incomeLines = charges.map((charge) => ({
      chargeType: { id: charge.id, nameBn: charge.name_bn, nameEn: charge.name_en, kind: toChargeKind(charge.kind) },
      billed: billedBy.get(charge.id) ?? '0.00',
      collected: collectedBy.get(charge.id) ?? '0.00',
    }));
    const headLines = heads.map((head) => {
      const amount = spentBy.get(head.id) ?? '0.00';
      const budget = budgetBy.get(head.id) ?? null;
      const figures = budget === null ? null : budgetFigures(budget, '0', amount);
      return {
        head: { id: head.id, nameBn: head.name_bn, nameEn: head.name_en },
        budget,
        spent: amount,
        remaining: figures?.remaining ?? null,
        percent: figures?.percent ?? null,
        over: figures?.over ?? false,
      };
    });

    const incomeTotal = addMoney(donations!.amount, ...incomeLines.map((line) => line.collected));
    const expenditureTotal = addMoney('0', ...headLines.map((line) => line.spent));
    const firstYear = first?.first ? fiscalYearOf(isoDate(first.first), startMonth).startYear : current.startYear;
    const years: string[] = [];
    for (let start = Math.min(firstYear, current.startYear); start <= current.startYear; start++) years.push(fiscalYearStarting(start, startMonth).label);
    if (!years.includes(year.label)) years.push(year.label);

    return {
      year: year.label,
      start: year.start,
      end: year.end,
      years: years.sort().reverse(),
      fundId: query.fundId ?? null,
      funds: funds.map((fund) => ({ id: fund.id, nameBn: fund.name_bn, nameEn: fund.name_en, isDefault: fund.is_default })),
      income: {
        charges: incomeLines,
        donations: donations!.amount,
        billed: addMoney('0', ...incomeLines.map((line) => line.billed)),
        total: incomeTotal,
      },
      expenditure: {
        heads: headLines,
        budget: showBudgets ? addMoney('0', ...budgets.map((row) => row.amount.toFixed(2))) : null,
        total: expenditureTotal,
      },
      surplus: subtractMoney(incomeTotal, expenditureTotal),
    };
  }
}
