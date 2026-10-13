import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import { monthBounds, stintInMonth, type PayrollMonth, type PayrollRun, type PayrollStatus, type PayslipSheet } from '@s57/shared';
import { isoDate } from '../common/dates.js';
import { toFundOption } from '../finance/funds.service.js';
import { SettingsService } from '../finance/settings.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { monthDate, monthOf, payrollGrants, payslipSelect, runSelect, toPayslip, toRun } from './payroll-rows.js';

type Tx = Prisma.TransactionClient;

export const runNotFound = () => new NotFoundException({ code: 'payroll_not_found', message: 'Payroll run not found' });
export const notDraft = () => new ConflictException({ code: 'payroll_not_draft', message: 'Only a draft run can be changed' });

/**
 * Payroll (`payroll.*`, society-wide): one run per month, prepared as a draft from staff pay
 * and attendance, approved by someone other than the preparer, then paid through expenses.
 * This service reads; `PayrollDraftService` prepares and approves, `PayrollPayService` pays and voids.
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** The month's live run (or null), earlier voided ones, and the funds and heads the page offers. */
  async month(actor: Actor, month: string): Promise<PayrollMonth> {
    const societyId = actor.societyId;
    const runs = await this.prisma.payroll_runs.findMany({
      where: { society_id: societyId, month: monthDate(month) },
      select: runSelect,
      orderBy: { prepared_at: 'desc' },
    });
    const live = runs.find((run) => run.status !== 'void') ?? null;
    const grants = payrollGrants(actor);
    const [funds, separateFunds, heads] = await Promise.all([
      this.prisma.funds.findMany({
        where: { society_id: societyId, closed_at: null },
        select: { id: true, name_bn: true, name_en: true, is_default: true },
        orderBy: [{ is_default: 'desc' }, { name_bn: 'asc' }],
      }),
      this.settings.separateFunds(societyId),
      grants.edit && grants.expensesCreate ? this.heads(societyId) : Promise.resolve([]),
    ]);
    return {
      month,
      run: live ? toRun(live, actor) : null,
      voided: runs
        .filter((run) => run.status === 'void')
        .map((run) => ({
          id: run.id,
          voidedAt: run.voided_at!.toISOString(),
          voidReason: run.void_reason!,
          net: toRun(run, actor).totals.net,
        })),
      funds: funds.filter((fund) => separateFunds || fund.is_default).map(toFundOption),
      heads,
      can: { create: live === null && actor.access.can('create', 'payroll') },
    };
  }

  async get(actor: Actor, id: string, client: Tx | PrismaService = this.prisma): Promise<PayrollRun> {
    const row = await client.payroll_runs.findFirst({ where: { id, society_id: actor.societyId }, select: runSelect });
    if (!row) throw runNotFound();
    return toRun(row, actor);
  }

  /** One payslip as an A5 sheet (`payroll.view`). */
  async sheet(actor: Actor, id: string, payslipId: string): Promise<PayslipSheet> {
    const run = await this.prisma.payroll_runs.findFirst({ where: { id, society_id: actor.societyId }, select: { month: true, status: true, paid_at: true } });
    if (!run) throw runNotFound();
    const slip = await this.prisma.payslips.findFirst({ where: { id: payslipId, run_id: id }, select: payslipSelect });
    if (!slip) throw new NotFoundException({ code: 'payslip_not_found', message: 'Payslip not found in this run' });
    const month = monthOf(run.month);
    const period = stintInMonth(month, isoDate(slip.staff.joined_on), slip.staff.left_on ? isoDate(slip.staff.left_on) : null);
    return {
      header: await this.settings.receiptHeader(actor.societyId),
      month,
      status: run.status as PayrollStatus,
      paidAt: run.paid_at?.toISOString() ?? null,
      payslip: toPayslip(slip),
      // The stint's days; the whole month if its dates were corrected since.
      period: period ? { from: period.from, to: period.to } : { from: monthBounds(month).first, to: monthBounds(month).last },
    };
  }

  /** Expense heads in use, the one the last paid run used first. */
  private async heads(societyId: string): Promise<PayrollMonth['heads']> {
    const [rows, last] = await Promise.all([
      this.prisma.expense_heads.findMany({ where: { society_id: societyId, archived_at: null }, select: { id: true, name_bn: true, name_en: true }, orderBy: { name_bn: 'asc' } }),
      this.prisma.payroll_runs.findFirst({ where: { society_id: societyId, expense_head_id: { not: null } }, select: { expense_head_id: true }, orderBy: { paid_at: 'desc' } }),
    ]);
    const lastId = last?.expense_head_id;
    return rows
      .sort((a, b) => Number(b.id === lastId) - Number(a.id === lastId))
      .map((row) => ({ id: row.id, nameBn: row.name_bn, nameEn: row.name_en }));
  }
}

/** The run, locked for the rest of the transaction; 404 outside the caller's society. */
export async function lockedRun(tx: Tx, actor: Actor, id: string): Promise<{ id: string; month: Date; status: PayrollStatus; prepared_by: string | null; approved_by: string | null; approved_at: Date | null }> {
  await tx.$queryRaw`SELECT id FROM payroll_runs WHERE id = ${id}::uuid AND society_id = ${actor.societyId}::uuid FOR UPDATE`;
  const row = await tx.payroll_runs.findFirst({
    where: { id, society_id: actor.societyId },
    select: { id: true, month: true, status: true, prepared_by: true, approved_by: true, approved_at: true },
  });
  if (!row) throw runNotFound();
  return { ...row, status: row.status as PayrollStatus };
}
