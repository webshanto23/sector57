import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { addMoney, isZeroMoney, storedMethod, type PayrollPayInput, type PayrollRun } from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { ExpensesService } from '../expenses/expenses.service.js';
import { lockFinanceSetup } from '../finance/numbering.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { auditOf, monthOf, payrollGrants } from './payroll-rows.js';
import { lockedRun, PayrollService } from './payroll.service.js';

/**
 * Pays an approved run and voids runs. Paying books one expense per fund through
 * `ExpensesService` (already approved by the run's approver, paid by the caller), so the ledger,
 * budgets and reports see salaries as expenses; voiding a paid run voids those expenses.
 */
@Injectable()
export class PayrollPayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly expenses: ExpensesService,
    private readonly payroll: PayrollService,
  ) {}

  /** `payroll.edit` and `expenses.create`. 409 `fund_insufficient` (nothing written) when a fund's account is short. */
  async pay(actor: Actor, id: string, input: PayrollPayInput): Promise<PayrollRun> {
    if (!payrollGrants(actor).expensesCreate) throw new ForbiddenException({ code: 'pay_needs_expenses', message: 'Paying salaries needs the right to create expenses' });
    const today = isoDate(todayDate());
    const paidBy = storedMethod(input);
    await this.prisma.$transaction(async (tx) => {
      await lockFinanceSetup(tx, actor.societyId);
      const run = await lockedRun(tx, actor, id);
      if (run.status !== 'approved' || !run.approved_by || !run.approved_at) {
        throw new ConflictException({ code: 'payroll_not_approved', message: 'Only an approved run can be paid' });
      }
      const head = await tx.expense_heads.findFirst({ where: { id: input.headId, society_id: actor.societyId }, select: { archived_at: true } });
      if (!head) throw new BadRequestException({ code: 'invalid_head', message: 'Unknown expense head' });
      if (head.archived_at) throw new BadRequestException({ code: 'head_archived', message: 'The expense head is archived' });
      const slips = await tx.payslips.findMany({ where: { run_id: id }, select: { fund_id: true, net: true } });
      const byFund = new Map<string, string>();
      for (const slip of slips) byFund.set(slip.fund_id, addMoney(byFund.get(slip.fund_id) ?? '0', slip.net.toFixed(2)));
      const month = monthOf(run.month);
      const booked: { fundId: string; expenseId: string; voucherNo: string; amount: string }[] = [];
      for (const [fundId, amount] of byFund) {
        if (isZeroMoney(amount)) continue;
        const expense = await this.expenses.bookPaidIn(tx, actor, {
          title: null,
          fundId,
          method: paidBy.method,
          methodRef: paidBy.ref,
          spentOn: today,
          lines: [{ headId: input.headId, vendorId: null, description: `বেতন ${month}`, amount }],
          paidBy,
          requestedBy: run.prepared_by,
          approvedBy: run.approved_by,
          approvedAt: run.approved_at,
        });
        await tx.payroll_run_expenses.create({ data: { run_id: id, expense_id: expense.id, fund_id: fundId } });
        booked.push({ fundId, expenseId: expense.id, voucherNo: expense.voucherNo, amount });
      }
      await tx.payroll_runs.update({
        where: { id },
        data: {
          status: 'paid',
          paid_by: actor.userId,
          paid_at: new Date(),
          paid_account: paidBy.account,
          paid_method: paidBy.method,
          paid_method_ref: paidBy.ref,
          expense_head_id: input.headId,
          updated_at: new Date(),
        },
      });
      await this.audit.record({ ...auditOf(actor, 'pay', id), before: { status: 'approved' }, after: { status: 'paid', account: paidBy.account, method: paidBy.method, methodRef: paidBy.ref, headId: input.headId, expenses: booked } }, tx);
    });
    return this.payroll.get(actor, id);
  }

  /** `payroll.approve`; a paid run also needs `expenses.approve`, and its expenses are voided with it. */
  async void(actor: Actor, id: string, reason: string): Promise<PayrollRun> {
    await this.prisma.$transaction(async (tx) => {
      const run = await lockedRun(tx, actor, id);
      if (run.status === 'void') throw new ConflictException({ code: 'payroll_void', message: 'The run is already void' });
      const links = await tx.payroll_run_expenses.findMany({ where: { run_id: id }, select: { expense_id: true } });
      if (run.status === 'paid') {
        if (!payrollGrants(actor).expensesApprove) throw new ForbiddenException({ code: 'void_needs_expenses', message: 'Voiding paid salaries needs the right to approve expenses' });
        for (const link of links) await this.expenses.voidBookedIn(tx, actor, link.expense_id, reason);
      }
      await tx.payroll_runs.update({ where: { id }, data: { status: 'void', voided_by: actor.userId, voided_at: new Date(), void_reason: reason, updated_at: new Date() } });
      await this.audit.record({ ...auditOf(actor, 'void', id), before: { status: run.status }, after: { status: 'void', reason, expenses: links.map((link) => link.expense_id) } }, tx);
    });
    return this.payroll.get(actor, id);
  }
}
