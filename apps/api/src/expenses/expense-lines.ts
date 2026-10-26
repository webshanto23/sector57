import { Prisma } from '@s57/db';
import { budgetFigures, type ExpenseDetail, type ExpenseInput } from '@s57/shared';
import { fundClosed } from '../finance/funds.service.js';
import type { SettingsService } from '../finance/settings.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { bad } from './expense-rows.js';

type Tx = Prisma.TransactionClient;

/** Heads and vendors an expense already uses: they stay allowed after being archived. */
export type CurrentRefs = { headIds: string[]; vendorIds: string[] };

/**
 * Checks the heads, vendors and fund of a request; returns the fund to use (the default one
 * when none is given). An archived head or vendor is refused unless the expense already had it.
 */
export async function checkRefs(tx: Tx, settings: SettingsService, societyId: string, input: ExpenseInput, current?: CurrentRefs): Promise<{ fundId: string }> {
  const headIds = [...new Set(input.lines.map((line) => line.headId))];
  const vendorIds = [...new Set(input.lines.flatMap((line) => (line.vendorId ? [line.vendorId] : [])))];
  const [heads, vendors] = await Promise.all([
    tx.expense_heads.findMany({ where: { id: { in: headIds }, society_id: societyId }, select: { id: true, archived_at: true } }),
    vendorIds.length ? tx.vendors.findMany({ where: { id: { in: vendorIds }, society_id: societyId }, select: { id: true, archived_at: true } }) : [],
  ]);
  if (heads.length !== headIds.length) throw bad('invalid_head', 'Unknown expense head');
  if (heads.some((head) => head.archived_at && !current?.headIds.includes(head.id))) throw bad('head_archived', 'The expense head is archived');
  if (vendors.length !== vendorIds.length) throw bad('invalid_vendor', 'Unknown vendor');
  if (vendors.some((vendor) => vendor.archived_at && !current?.vendorIds.includes(vendor.id))) throw bad('vendor_archived', 'The vendor is archived');
  const fund = await tx.funds.findFirst({
    where: { society_id: societyId, ...(input.fundId ? { id: input.fundId } : { is_default: true }) },
    select: { id: true, is_default: true, closed_at: true },
  });
  if (!fund) throw bad('invalid_fund', 'Unknown fund');
  if (fund.closed_at) throw fundClosed();
  if (!fund.is_default && !(await settings.separateFunds(societyId, tx))) throw bad('invalid_fund', 'Only the default fund is in use');
  return { fundId: fund.id };
}

/** Writes an expense's lines in order, replacing any it had (the total is checked at commit). */
export async function writeLines(tx: Tx, societyId: string, expenseId: string, lines: ExpenseInput['lines']): Promise<void> {
  await tx.expense_lines.deleteMany({ where: { expense_id: expenseId } });
  await tx.expense_lines.createMany({
    data: lines.map((line, position) => ({
      society_id: societyId,
      expense_id: expenseId,
      position,
      expense_head_id: line.headId,
      vendor_id: line.vendorId ?? null,
      description: line.description,
      amount: new Prisma.Decimal(line.amount),
    })),
  });
}

/** The budget lines for these heads in a fiscal year, for heads that have one: approved and paid lines count. */
export async function budgetsFor(
  prisma: PrismaService,
  societyId: string,
  heads: ExpenseDetail['lines'][number]['head'][],
  year: { label: string; start: string; end: string },
): Promise<ExpenseDetail['budgets']> {
  const unique = [...new Map(heads.map((head) => [head.id, head])).values()];
  const budgets = await prisma.budgets.findMany({
    where: { society_id: societyId, fiscal_year: year.label, expense_head_id: { in: unique.map((head) => head.id) } },
    select: { expense_head_id: true, amount: true },
  });
  if (budgets.length === 0) return [];
  const used = await prisma.$queryRaw<{ head_id: string; approved: string; paid: string }[]>`
    SELECT l.expense_head_id AS head_id,
           coalesce(sum(l.amount) FILTER (WHERE e.status = 'approved'), 0)::numeric(16,2)::text AS approved,
           coalesce(sum(l.amount) FILTER (WHERE e.status = 'paid'), 0)::numeric(16,2)::text AS paid
    FROM expense_lines l JOIN expenses e ON e.id = l.expense_id
    WHERE e.society_id = ${societyId}::uuid AND l.expense_head_id IN (${Prisma.join(budgets.map((row) => Prisma.sql`${row.expense_head_id}::uuid`))})
      AND e.spent_on BETWEEN ${year.start}::date AND ${year.end}::date
    GROUP BY l.expense_head_id`;
  return unique.flatMap((head) => {
    const budget = budgets.find((row) => row.expense_head_id === head.id);
    if (!budget) return [];
    const row = used.find((item) => item.head_id === head.id);
    const amount = budget.amount.toFixed(2);
    const figures = budgetFigures(amount, row?.approved ?? '0.00', row?.paid ?? '0.00');
    return [{ head, year: year.label, amount, used: figures.used, remaining: figures.remaining, over: figures.over }];
  });
}
