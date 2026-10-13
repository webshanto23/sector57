import { OVERVIEW_ITEMS, type Overview } from '@s57/shared';
import type { Actor } from '../permissions/permissions.decorators.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { monthOf, payrollGrants } from './payroll-rows.js';

/**
 * The overview's payroll approvals: drafts someone else prepared (for `payroll.approve`) and
 * approved runs not yet paid (for `payroll.edit` with `expenses.create`); null when neither applies.
 */
export async function payrollWaiting(prisma: Pick<PrismaService, 'payroll_runs' | 'payslips'>, actor: Actor): Promise<NonNullable<Overview['approvals']>['payroll']> {
  const grants = payrollGrants(actor);
  const approve = grants.approve;
  const pay = grants.edit && grants.expensesCreate;
  if (!approve && !pay) return null;
  const where = {
    society_id: actor.societyId,
    OR: [
      ...(approve ? [{ status: 'draft', OR: [{ prepared_by: null }, { prepared_by: { not: actor.userId } }] }] : []),
      ...(pay ? [{ status: 'approved' }] : []),
    ],
  };
  const [count, rows] = await Promise.all([
    prisma.payroll_runs.count({ where }),
    prisma.payroll_runs.findMany({ where, select: { id: true, month: true, status: true }, orderBy: { month: 'desc' }, take: OVERVIEW_ITEMS }),
  ]);
  const nets = rows.length
    ? await prisma.payslips.groupBy({ by: ['run_id'], where: { run_id: { in: rows.map((row) => row.id) } }, _sum: { net: true } })
    : [];
  return {
    count,
    items: rows.map((row) => ({
      id: row.id,
      month: monthOf(row.month),
      status: row.status as 'draft' | 'approved',
      net: nets.find((net) => net.run_id === row.id)?._sum.net?.toFixed(2) ?? '0.00',
    })),
  };
}
