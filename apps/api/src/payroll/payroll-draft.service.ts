import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import { lineTotals, payslipNet, type PayrollRun, type PayslipEditInput, type PayslipLineKind } from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { fundClosed } from '../finance/funds.service.js';
import { SettingsService } from '../finance/settings.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { writePayslips, type KeptPayslip } from './payroll-draft.js';
import { auditOf, monthDate, monthOf } from './payroll-rows.js';
import { lockedRun, notDraft, PayrollService } from './payroll.service.js';

type Tx = Prisma.TransactionClient;

const bad = (code: string, message: string) => new BadRequestException({ code, message });

/** Prepares a month's draft, refreshes it, edits its payslips and approves it. */
@Injectable()
export class PayrollDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly payroll: PayrollService,
  ) {}

  /** A new draft for the month (`payroll.create`): 409 `payroll_exists` while a live run has it. */
  async prepare(actor: Actor, month: string): Promise<PayrollRun> {
    if (month > isoDate(todayDate()).slice(0, 7)) throw bad('future_month', 'The month has not started yet');
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const run = await tx.payroll_runs.create({ data: { society_id: actor.societyId, month: monthDate(month), prepared_by: actor.userId }, select: { id: true } });
        const count = await writePayslips(tx, actor.societyId, run.id, month, await this.defaultFund(tx, actor.societyId), new Map());
        if (count === 0) throw new ConflictException({ code: 'payroll_no_staff', message: 'Nobody worked in that month' });
        await this.audit.record({ ...auditOf(actor, 'create', run.id), after: { month, payslips: count } }, tx);
        return run.id;
      });
      return this.payroll.get(actor, id);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException({ code: 'payroll_exists', message: 'The month already has a payroll run' });
      throw error;
    }
  }

  /** Recalculates a draft from current pay and attendance, keeping each payslip's fund, note and lines. */
  async refresh(actor: Actor, id: string): Promise<PayrollRun> {
    await this.prisma.$transaction(async (tx) => {
      const run = await lockedRun(tx, actor, id);
      if (run.status !== 'draft') throw notDraft();
      const before = await tx.payslips.findMany({
        where: { run_id: id },
        select: {
          staff_id: true,
          fund_id: true,
          note: true,
          net: true,
          payslip_lines: { select: { kind: true, label_bn: true, label_en: true, amount: true }, orderBy: { position: 'asc' } },
        },
      });
      const kept = new Map<string, KeptPayslip>(
        before.map((slip) => [
          slip.staff_id,
          {
            fundId: slip.fund_id,
            note: slip.note,
            lines: slip.payslip_lines.map((line) => ({ kind: line.kind as PayslipLineKind, labelBn: line.label_bn, labelEn: line.label_en, amount: line.amount.toFixed(2) })),
          },
        ]),
      );
      await tx.payslips.deleteMany({ where: { run_id: id } });
      const month = monthOf(run.month);
      const count = await writePayslips(tx, actor.societyId, id, month, await this.defaultFund(tx, actor.societyId), kept);
      if (count === 0) throw new ConflictException({ code: 'payroll_no_staff', message: 'Nobody worked in that month' });
      await tx.payroll_runs.update({ where: { id }, data: { updated_at: new Date() } });
      await this.audit.record({ ...auditOf(actor, 'refresh', id), before: { payslips: before.length }, after: { month, payslips: count } }, tx);
    });
    return this.payroll.get(actor, id);
  }

  /** Replaces a draft payslip's lines, fund and note; 400 `negative_net` when deductions exceed the pay. */
  async editPayslip(actor: Actor, id: string, payslipId: string, input: PayslipEditInput): Promise<PayrollRun> {
    await this.prisma.$transaction(async (tx) => {
      const run = await lockedRun(tx, actor, id);
      if (run.status !== 'draft') throw notDraft();
      const slip = await tx.payslips.findFirst({
        where: { id: payslipId, run_id: id },
        select: { fund_id: true, note: true, base: true, attendance_deduction: true, allowances: true, deductions: true, net: true },
      });
      if (!slip) throw new NotFoundException({ code: 'payslip_not_found', message: 'Payslip not found in this run' });
      if (input.fundId !== slip.fund_id) await this.checkFund(tx, actor.societyId, input.fundId);
      const totals = lineTotals(input.lines);
      const net = payslipNet(slip.base.toFixed(2), slip.attendance_deduction.toFixed(2), totals.allowances, totals.deductions);
      if (net === null) throw bad('negative_net', 'Deductions would take the payslip below zero');
      await tx.payslip_lines.deleteMany({ where: { payslip_id: payslipId } });
      await tx.payslips.update({
        where: { id: payslipId },
        data: {
          fund_id: input.fundId,
          note: input.note,
          allowances: new Prisma.Decimal(totals.allowances),
          deductions: new Prisma.Decimal(totals.deductions),
          net: new Prisma.Decimal(net),
          updated_at: new Date(),
          payslip_lines: {
            create: input.lines.map((line, position) => ({ kind: line.kind, label_bn: line.labelBn, label_en: line.labelEn, amount: new Prisma.Decimal(line.amount), position })),
          },
        },
      });
      await this.audit.record(
        {
          ...auditOf(actor, 'update', id),
          before: { payslipId, fundId: slip.fund_id, note: slip.note, allowances: slip.allowances.toFixed(2), deductions: slip.deductions.toFixed(2), net: slip.net.toFixed(2) },
          after: { payslipId, fundId: input.fundId, note: input.note, lines: input.lines, net },
        },
        tx,
      );
    });
    return this.payroll.get(actor, id);
  }

  /** Approves a draft (`payroll.approve`); 403 `cannot_approve_own` for the one who prepared it. */
  async approve(actor: Actor, id: string): Promise<PayrollRun> {
    await this.prisma.$transaction(async (tx) => {
      const run = await lockedRun(tx, actor, id);
      if (run.status !== 'draft') throw notDraft();
      if (run.prepared_by === actor.userId) throw new ForbiddenException({ code: 'cannot_approve_own', message: 'Someone else must approve the run you prepared' });
      await tx.payroll_runs.update({ where: { id }, data: { status: 'approved', approved_by: actor.userId, approved_at: new Date(), updated_at: new Date() } });
      await this.audit.record({ ...auditOf(actor, 'approve', id), before: { status: 'draft' }, after: { status: 'approved' } }, tx);
    });
    return this.payroll.get(actor, id);
  }

  private async defaultFund(tx: Tx, societyId: string): Promise<string> {
    const fund = await tx.funds.findFirst({ where: { society_id: societyId, is_default: true }, select: { id: true } });
    if (!fund) throw new ConflictException({ code: 'no_default_fund', message: 'The society has no default fund' });
    return fund.id;
  }

  /** A fund a payslip may be charged to: the society's, open, and the default one unless separate funds is on. */
  private async checkFund(tx: Tx, societyId: string, fundId: string): Promise<void> {
    const fund = await tx.funds.findFirst({ where: { id: fundId, society_id: societyId }, select: { is_default: true, closed_at: true } });
    if (!fund) throw bad('invalid_fund', 'Unknown fund');
    if (fund.closed_at) throw fundClosed();
    if (!fund.is_default && !(await this.settings.separateFunds(societyId, tx))) throw bad('invalid_fund', 'Only the default fund is in use');
  }
}
