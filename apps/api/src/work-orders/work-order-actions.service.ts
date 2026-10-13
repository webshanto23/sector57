import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  monthsAfter,
  workOrderMoves,
  type WorkOrderCancelInput,
  type WorkOrderDetail,
  type WorkOrderDoneInput,
  type WorkOrderStatus,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { ExpensesService } from '../expenses/expenses.service.js';
import { AssetsService, futureDate } from '../facilities/assets.service.js';
import { SettingsService } from '../finance/settings.service.js';
import { TicketsService } from '../helpdesk/tickets.service.js';
import { auditOf, dayOf } from '../members/parties.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beyondPermissions } from '../property/tree.service.js';
import type { WorkOrderDetailRow } from './work-order-rows.js';
import { WorkOrdersService } from './work-orders.service.js';

type Tx = Prisma.TransactionClient;

const statusChanged = () => new ConflictException({ code: 'work_order_status_changed', message: 'Someone changed this work order just now; reload' });

/**
 * Starting, finishing and cancelling a work order (`workOrderMoves` in shared says who may),
 * each a conditional update on the old status with an audit row. Finishing with a cost raises
 * a pending expense request through `ExpensesService` (never the ledger); finishing an upkeep
 * job moves its plan on. A ticket's timeline hears of both.
 */
@Injectable()
export class WorkOrderActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orders: WorkOrdersService,
    private readonly tickets: TicketsService,
    private readonly assets: AssetsService,
    private readonly expenses: ExpensesService,
    private readonly settings: SettingsService,
  ) {}

  async start(actor: Actor, id: string): Promise<WorkOrderDetail> {
    const row = await this.movable(actor, id, 'in_progress');
    await this.prisma.$transaction(async (tx) => {
      await this.move(tx, id, row, { status: 'in_progress' });
      await this.audit.record({ ...auditOf(actor, 'work_order', 'start', id), before: { status: row.status }, after: { status: 'in_progress' } }, tx);
    });
    return this.orders.get(actor, id);
  }

  /**
   * Done on a day (not in the future, 400 `future_date`) with what was done. A cost needs
   * `expenses.create` (403) and becomes a pending request under `headId`, dated that day, from
   * the asset's facility fund while separate funds are on, else the default fund.
   */
  async done(actor: Actor, id: string, input: WorkOrderDoneInput): Promise<WorkOrderDetail> {
    const row = await this.movable(actor, id, 'done');
    if (input.completedOn > isoDate(todayDate())) throw futureDate();
    const cost = input.cost;
    if (cost && !actor.access.can('create', 'expenses')) throw beyondPermissions();

    await this.prisma.$transaction(async (tx) => {
      await this.move(tx, id, row, { status: 'done', completed_on: dayOf(input.completedOn), completion_note: input.note });
      const expenseId = cost
        ? await this.expenses.createIn(tx, actor, {
            headId: input.headId!,
            fundId: await this.fundFor(tx, actor.societyId, row),
            vendorId: row.vendors?.id ?? null,
            description: `${row.wo_no}: ${row.title}`,
            amount: cost,
            spentOn: input.completedOn,
          })
        : null;
      if (expenseId) await tx.work_orders.update({ where: { id }, data: { expense_id: expenseId } });
      await this.planDone(tx, actor, row, input);
      if (row.tickets) await this.tickets.event(tx, actor, row.tickets.id, 'work_order', { workOrderNo: row.wo_no, workOrderStatus: 'done' }, input.note);
      await this.audit.record(
        { ...auditOf(actor, 'work_order', 'done', id), before: { status: row.status }, after: { status: 'done', completedOn: input.completedOn, note: input.note, cost, expenseId } },
        tx,
      );
    });
    return this.orders.get(actor, id);
  }

  async cancel(actor: Actor, id: string, input: WorkOrderCancelInput): Promise<WorkOrderDetail> {
    const row = await this.movable(actor, id, 'cancelled');
    await this.prisma.$transaction(async (tx) => {
      await this.move(tx, id, row, { status: 'cancelled', cancelled_at: new Date(), cancel_reason: input.reason });
      if (row.tickets) await this.tickets.event(tx, actor, row.tickets.id, 'work_order', { workOrderNo: row.wo_no, workOrderStatus: 'cancelled' }, input.reason);
      await this.audit.record({ ...auditOf(actor, 'work_order', 'cancel', id), before: { status: row.status }, after: { status: 'cancelled', reason: input.reason } }, tx);
    });
    return this.orders.get(actor, id);
  }

  /** Seen (404), the move allowed from here (409 `work_order_status_invalid`), and the permission it needs there (403). */
  private async movable(actor: Actor, id: string, to: WorkOrderStatus): Promise<WorkOrderDetailRow> {
    const row = await this.orders.visible(actor, id);
    const move = workOrderMoves(row.status as WorkOrderStatus).find((candidate) => candidate.to === to);
    if (!move) throw new ConflictException({ code: 'work_order_status_invalid', message: 'The work order cannot move to this status from here' });
    if (!actor.access.can(move.needs, 'work_orders', { path: row.locations.path })) throw beyondPermissions();
    return row;
  }

  private async move(tx: Tx, id: string, row: WorkOrderDetailRow, data: Prisma.work_ordersUpdateManyMutationInput): Promise<void> {
    const { count } = await tx.work_orders.updateMany({ where: { id, status: row.status }, data });
    if (count === 0) throw statusChanged();
  }

  /** The asset's facility fund while separate funds are on and it is open; otherwise the default (null). */
  private async fundFor(tx: Tx, societyId: string, row: WorkOrderDetailRow): Promise<string | null> {
    const fundId = row.assets?.facilities?.fund_id;
    if (!fundId || !(await this.settings.separateFunds(societyId, tx))) return null;
    const fund = await tx.funds.findFirst({ where: { id: fundId, society_id: societyId, closed_at: null }, select: { id: true } });
    return fund?.id ?? null;
  }

  /**
   * An upkeep job done moves its plan on (`everyMonths` after the day) and writes the asset's
   * history, unless the plan was stopped or was already done later than that.
   */
  private async planDone(tx: Tx, actor: Actor, row: WorkOrderDetailRow, input: WorkOrderDoneInput): Promise<void> {
    const plan = row.plans;
    if (!plan || plan.archived_at || (plan.last_done_on && input.completedOn < isoDate(plan.last_done_on))) return;
    const next = monthsAfter(input.completedOn, plan.every_months);
    const { count } = await tx.asset_maintenance_plans.updateMany({
      where: { id: plan.id, archived_at: null, next_due_on: plan.next_due_on },
      data: { last_done_on: dayOf(input.completedOn), next_due_on: dayOf(next) },
    });
    if (count === 0) throw new ConflictException({ code: 'plan_changed', message: 'Someone changed this plan just now; reload' });
    await this.assets.event(tx, actor, row.assets!.id, 'maintenance', { task: plan.task_bn, doneOn: input.completedOn }, input.note);
    await this.audit.record({ ...auditOf(actor, 'asset_plan', 'done', plan.id), after: { doneOn: input.completedOn, nextDueOn: next, workOrderId: row.id } }, tx);
  }
}
