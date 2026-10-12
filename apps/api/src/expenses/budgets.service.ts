import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  addMoney,
  budgetFigures,
  fiscalYearOf,
  fiscalYearStarting,
  isZeroMoney,
  subtractMoney,
  type Budget,
  type BudgetInput,
  type BudgetLine,
  type BudgetQuery,
  type FiscalYear,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

const invalidYear = () => new BadRequestException({ code: 'invalid_year', message: 'Not a fiscal year of this society' });

/**
 * Budgets (`budgets.*`): one amount per expense head per fiscal year. The page shows, per
 * head, the budget, what is approved but unpaid, what is paid and what is left. Expenses count
 * in the fiscal year of the day they were spent. Going over budget warns, it never blocks.
 */
@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(actor: Actor, query: BudgetQuery): Promise<Budget> {
    const startMonth = await this.startMonth(actor.societyId);
    const current = fiscalYearOf(isoDate(todayDate()), startMonth);
    const year = query.year ? yearOf(query.year, startMonth) : current;
    const [heads, budgets, spent, budgetYears] = await Promise.all([
      this.prisma.expense_heads.findMany({
        where: { society_id: actor.societyId },
        select: { id: true, name_bn: true, name_en: true, archived_at: true },
        orderBy: [{ archived_at: { sort: 'desc', nulls: 'first' } }, { name_bn: 'asc' }],
      }),
      this.prisma.budgets.findMany({ where: { society_id: actor.societyId, fiscal_year: year.label }, select: { expense_head_id: true, amount: true } }),
      this.prisma.$queryRaw<{ head_id: string; approved: string; paid: string }[]>`
        SELECT expense_head_id AS head_id,
               coalesce(sum(amount) FILTER (WHERE status = 'approved'), 0)::numeric(16,2)::text AS approved,
               coalesce(sum(amount) FILTER (WHERE status = 'paid'), 0)::numeric(16,2)::text AS paid
        FROM expenses
        WHERE society_id = ${actor.societyId}::uuid AND status IN ('approved', 'paid')
          AND spent_on BETWEEN ${year.start}::date AND ${year.end}::date
        GROUP BY expense_head_id`,
      this.prisma.budgets.findMany({ where: { society_id: actor.societyId }, distinct: ['fiscal_year'], select: { fiscal_year: true } }),
    ]);
    const budgetBy = new Map(budgets.map((row) => [row.expense_head_id, row.amount.toFixed(2)]));
    const spentBy = new Map(spent.map((row) => [row.head_id, row]));
    const lines: BudgetLine[] = heads
      // An archived head shows only when it has a budget or spending this year.
      .filter((head) => !head.archived_at || budgetBy.has(head.id) || spentBy.has(head.id))
      .map((head) => {
        const budget = budgetBy.get(head.id) ?? null;
        const approved = spentBy.get(head.id)?.approved ?? '0.00';
        const paid = spentBy.get(head.id)?.paid ?? '0.00';
        const figures = budget === null ? null : budgetFigures(budget, approved, paid);
        return {
          head: { id: head.id, nameBn: head.name_bn, nameEn: head.name_en, archived: head.archived_at !== null },
          budget,
          approved,
          paid,
          remaining: figures?.remaining ?? null,
          percent: figures?.percent ?? null,
          over: figures?.over ?? false,
        };
      });
    const total = (pick: (line: BudgetLine) => string | null) => addMoney('0', ...lines.map((line) => pick(line) ?? '0'));
    const totals = { budget: total((line) => line.budget), approved: total((line) => line.approved), paid: total((line) => line.paid) };
    const next = fiscalYearStarting(current.startYear + 1, startMonth);
    const years = [...new Set([next.label, current.label, year.label, ...budgetYears.map((row) => row.fiscal_year)])].sort().reverse();
    return {
      year: year.label,
      start: year.start,
      end: year.end,
      years,
      lines,
      totals: { ...totals, remaining: subtractMoney(totals.budget, addMoney(totals.approved, totals.paid)) },
      can: { edit: actor.access.can('edit', 'budgets') },
    };
  }

  /** Sets the year's amounts for the heads given; zero clears a head's budget. */
  async set(actor: Actor, input: BudgetInput): Promise<Budget> {
    const startMonth = await this.startMonth(actor.societyId);
    const year = yearOf(input.year, startMonth);
    await this.prisma.$transaction(async (tx) => {
      const heads = await tx.expense_heads.findMany({
        where: { society_id: actor.societyId, id: { in: input.lines.map((line) => line.headId) } },
        select: { id: true },
      });
      if (heads.length !== input.lines.length) throw new BadRequestException({ code: 'invalid_head', message: 'Unknown expense head' });
      const before = await tx.budgets.findMany({
        where: { society_id: actor.societyId, fiscal_year: year.label, expense_head_id: { in: heads.map((head) => head.id) } },
        select: { expense_head_id: true, amount: true },
      });
      const changes: { headId: string; before: string | null; after: string | null }[] = [];
      for (const line of input.lines) {
        const was = before.find((row) => row.expense_head_id === line.headId)?.amount.toFixed(2) ?? null;
        const now = isZeroMoney(line.amount) ? null : line.amount;
        if (was === now) continue;
        const key = { society_id_fiscal_year_expense_head_id: { society_id: actor.societyId, fiscal_year: year.label, expense_head_id: line.headId } };
        if (now === null) await tx.budgets.delete({ where: key });
        else {
          await tx.budgets.upsert({
            where: key,
            create: { society_id: actor.societyId, fiscal_year: year.label, expense_head_id: line.headId, amount: new Prisma.Decimal(now), updated_by: actor.userId },
            update: { amount: new Prisma.Decimal(now), updated_by: actor.userId, updated_at: new Date() },
          });
        }
        changes.push({ headId: line.headId, before: was, after: now });
      }
      if (changes.length) {
        await this.audit.record(
          { societyId: actor.societyId, userId: actor.userId, action: 'update', entityType: 'budget', entityId: null, ip: actor.ip, after: { year: year.label, changes } },
          tx,
        );
      }
    });
    return this.get(actor, { year: year.label });
  }

  private async startMonth(societyId: string): Promise<number> {
    const society = await this.prisma.societies.findUniqueOrThrow({ where: { id: societyId }, select: { fiscal_year_start_month: true } });
    return society.fiscal_year_start_month;
  }
}

/** The fiscal year a label names, if it is written the way this society's years are. */
function yearOf(label: string, startMonth: number): FiscalYear {
  const year = fiscalYearStarting(Number(label.slice(0, 4)), startMonth);
  if (year.label !== label) throw invalidYear();
  return year;
}
