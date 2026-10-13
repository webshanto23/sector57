import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  digitVariants,
  formatDocumentNo,
  isAssetGone,
  isTicketFinished,
  isWorkOrderFinished,
  toAssetStatus,
  workOrderMoves,
  workOrderNumberOf,
  type ExpenseStatus,
  type TicketStatus,
  type WorkOrderCreateInput,
  type WorkOrderDetail,
  type WorkOrderList,
  type WorkOrderListQuery,
  type WorkOrderOptions,
  type WorkOrderStatus,
  type WorkOrderUpdateInput,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { AssetsService, assetGone } from '../facilities/assets.service.js';
import { NumberingService } from '../finance/numbering.service.js';
import { HelpdeskService } from '../helpdesk/helpdesk.service.js';
import { userRefOf } from '../helpdesk/ticket-rows.js';
import { TicketsService, ticketFinished } from '../helpdesk/tickets.service.js';
import { MemberRowsService } from '../members/member-rows.service.js';
import { auditOf } from '../members/parties.service.js';
import { scopeWhere } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beyondPermissions, locationNotFound, TreeService } from '../property/tree.service.js';
import { workOrderDetailSelect, workOrderRowOf, workOrderSelect, workOrderSnapshot, type WorkOrderDetailRow } from './work-order-rows.js';

export const workOrderNotFound = () => new NotFoundException({ code: 'work_order_not_found', message: 'Work order not found' });
export const workOrderFinished = () => new ConflictException({ code: 'work_order_finished', message: 'This work order is done or cancelled' });
const planNotFound = () => new NotFoundException({ code: 'plan_not_found', message: 'Upkeep plan not found' });
const vendorNotFound = () => new NotFoundException({ code: 'vendor_not_found', message: 'Vendor not found' });

const ACTIVE = { status: { in: ['open', 'in_progress'] } } satisfies Prisma.work_ordersWhereInput;

/** What a new work order hangs on, resolved and checked. */
type Source = { ticket: { id: string; no: string } | null; asset: { id: string; no: string } | null; planId: string | null; locationId: string; path: string };

/**
 * Work orders (`work_orders` permission, area-scoped through where the work is). Numbered
 * `WO-YY-NNNN` by fiscal year; never deleted, only done or cancelled. Raising one on a ticket
 * or an asset also writes to its timeline. Starting, finishing and cancelling are in
 * `WorkOrderActionsService`.
 */
@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tree: TreeService,
    private readonly rows: MemberRowsService,
    private readonly numbering: NumberingService,
    private readonly helpdesk: HelpdeskService,
    private readonly tickets: TicketsService,
    private readonly assets: AssetsService,
  ) {}

  async list(actor: Actor, query: WorkOrderListQuery): Promise<WorkOrderList> {
    const { page, pageSize } = query;
    const scope = this.scope(actor);
    const where: Prisma.work_ordersWhereInput = { AND: [scope, ...this.filters(query)] };
    const [rows, total, open, inProgress] = await Promise.all([
      this.prisma.work_orders.findMany({
        where,
        select: workOrderSelect,
        orderBy: query.view === 'active' ? [{ created_at: 'asc' }, { id: 'asc' }] : [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.work_orders.count({ where }),
      this.prisma.work_orders.count({ where: { AND: [scope, { status: 'open' }] } }),
      this.prisma.work_orders.count({ where: { AND: [scope, { status: 'in_progress' }] } }),
    ]);
    const place = await this.rows.places(actor.societyId, rows.map((row) => row.locations));
    return {
      items: rows.map((row) => workOrderRowOf(row, place(row.locations))),
      total,
      page,
      pageSize,
      counts: { open, inProgress },
      can: { create: actor.access.can('create', 'work_orders') },
    };
  }

  async get(actor: Actor, id: string): Promise<WorkOrderDetail> {
    const row = await this.visible(actor, id);
    const { access } = actor;
    const at = { path: row.locations.path };
    const status = row.status as WorkOrderStatus;
    const place = await this.rows.places(actor.societyId, [row.locations]);
    const { tickets: ticket, assets: asset, plans: plan, expenses: expense } = row;
    return {
      ...workOrderRowOf(row, place(row.locations)),
      description: row.description,
      ticket: ticket
        ? { id: ticket.id, ticketNo: ticket.ticket_no, title: ticket.title, open: access.can('view', 'helpdesk', { path: ticket.locations.path }) }
        : null,
      asset: asset
        ? {
            id: asset.id,
            assetNo: asset.asset_no,
            name: { bn: asset.name_bn, en: asset.name_en },
            open: access.can('view', 'facilities', { path: asset.locations.path }),
          }
        : null,
      plan: plan ? { id: plan.id, task: { bn: plan.task_bn, en: plan.task_en } } : null,
      completionNote: row.completion_note,
      cancelledAt: row.cancelled_at?.toISOString() ?? null,
      cancelReason: row.cancel_reason,
      expense: expense
        ? { id: expense.id, voucherNo: expense.voucher_no, amount: expense.amount.toFixed(2), status: expense.status as ExpenseStatus, open: access.can('view', 'expenses') }
        : null,
      createdBy: userRefOf(row.users),
      can: {
        edit: access.can('edit', 'work_orders', at) && !isWorkOrderFinished(status),
        statuses: workOrderMoves(status)
          .filter((move) => access.can(move.needs, 'work_orders', at))
          .map((move) => move.to),
        cost: access.can('create', 'expenses'),
      },
    };
  }

  /**
   * 404 `ticket_not_found`, `asset_not_found`, `plan_not_found`, `location_not_found`,
   * `staff_not_found`, `vendor_not_found`; 409 `ticket_finished`, `asset_gone`; 400 `plan_asset_mismatch`.
   */
  async create(actor: Actor, input: WorkOrderCreateInput): Promise<WorkOrderDetail> {
    const source = await this.source(actor, input);
    if (!actor.access.can('create', 'work_orders', { path: source.path })) throw beyondPermissions();
    const staff = input.staffId ? await this.helpdesk.pickStaff(actor, input.staffId, 'work_orders') : null;
    if (input.vendorId) await this.checkVendor(actor.societyId, input.vendorId);
    const id = await this.prisma.$transaction(async (tx) => {
      const number = await this.numbering.next(tx, actor.societyId, 'work_order', isoDate(todayDate()));
      const made = await tx.work_orders.create({
        data: {
          society_id: actor.societyId,
          wo_no: number.formatted,
          ticket_id: source.ticket?.id ?? null,
          asset_id: source.asset?.id ?? null,
          plan_id: source.planId,
          location_id: source.locationId,
          title: input.title,
          description: input.description,
          assigned_staff_id: staff?.id ?? null,
          vendor_id: input.vendorId,
          estimated_cost: input.estimatedCost === null ? null : new Prisma.Decimal(input.estimatedCost),
          created_by: actor.userId,
        },
        select: workOrderDetailSelect,
      });
      if (source.ticket) await this.tickets.event(tx, actor, source.ticket.id, 'work_order', { workOrderNo: made.wo_no, workOrderStatus: 'open' });
      if (source.asset) await this.assets.event(tx, actor, source.asset.id, 'work_order', { workOrderNo: made.wo_no });
      await this.audit.record({ ...auditOf(actor, 'work_order', 'create', made.id), after: workOrderSnapshot(made) }, tx);
      return made.id;
    });
    return this.get(actor, id);
  }

  /** Not once done or cancelled (409 `work_order_finished`). Giving it to staff takes it from the vendor, and the other way round. */
  async update(actor: Actor, id: string, input: WorkOrderUpdateInput): Promise<WorkOrderDetail> {
    const before = await this.editable(actor, id);
    const staff = input.staffId ? await this.helpdesk.pickStaff(actor, input.staffId, 'work_orders') : null;
    if (input.vendorId && input.vendorId !== before.vendors?.id) await this.checkVendor(actor.societyId, input.vendorId);
    const staffId = input.staffId === undefined ? (input.vendorId ? null : undefined) : (staff?.id ?? null);
    const vendorId = input.vendorId === undefined ? (input.staffId ? null : undefined) : input.vendorId;
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.work_orders.updateMany({
        where: { id, status: { in: ['open', 'in_progress'] } },
        data: {
          title: input.title,
          description: input.description,
          assigned_staff_id: staffId,
          vendor_id: vendorId,
          estimated_cost: input.estimatedCost === undefined ? undefined : input.estimatedCost === null ? null : new Prisma.Decimal(input.estimatedCost),
        },
      });
      if (count === 0) throw workOrderFinished();
      const after = await tx.work_orders.findUniqueOrThrow({ where: { id }, select: workOrderDetailSelect });
      await this.audit.record({ ...auditOf(actor, 'work_order', 'update', id), before: workOrderSnapshot(before), after: workOrderSnapshot(after) }, tx);
    });
    return this.get(actor, id);
  }

  /** Vendors a job may go to. */
  async options(actor: Actor): Promise<WorkOrderOptions> {
    const vendors = await this.prisma.vendors.findMany({ where: { society_id: actor.societyId, archived_at: null }, select: { id: true, name: true }, orderBy: [{ name: 'asc' }] });
    return { vendors };
  }

  /** A work order the caller may see where the work is, or 404. */
  async visible(actor: Actor, id: string): Promise<WorkOrderDetailRow> {
    const row = await this.prisma.work_orders.findFirst({ where: { id, society_id: actor.societyId }, select: workOrderDetailSelect });
    if (!row || !actor.access.can('view', 'work_orders', { path: row.locations.path })) throw workOrderNotFound();
    return row;
  }

  /** One the caller may change: seen (404), `work_orders.edit` there (403), not done or cancelled (409). */
  async editable(actor: Actor, id: string): Promise<WorkOrderDetailRow> {
    const row = await this.visible(actor, id);
    if (!actor.access.can('edit', 'work_orders', { path: row.locations.path })) throw beyondPermissions();
    if (isWorkOrderFinished(row.status as WorkOrderStatus)) throw workOrderFinished();
    return row;
  }

  /** Work order rows in the caller's `work_orders.view` area. */
  scope(actor: Actor): Prisma.work_ordersWhereInput {
    return { society_id: actor.societyId, locations: scopeWhere(actor.access, 'view', 'work_orders', (prefix) => ({ path: { startsWith: prefix } })) };
  }

  /** The ticket, asset or plan it comes from (each seen by the caller), and the place: the ticket's, else the asset's, else the one given. */
  private async source(actor: Actor, input: WorkOrderCreateInput): Promise<Source> {
    let assetId = input.assetId;
    if (input.planId) {
      const plan = await this.prisma.asset_maintenance_plans.findFirst({ where: { id: input.planId, society_id: actor.societyId, archived_at: null }, select: { asset_id: true } });
      if (!plan) throw planNotFound();
      if (assetId && assetId !== plan.asset_id) throw new BadRequestException({ code: 'plan_asset_mismatch', message: 'The upkeep plan belongs to another asset' });
      assetId = plan.asset_id;
    }
    const asset = assetId ? await this.assets.visible(actor, assetId) : null;
    if (asset && isAssetGone(toAssetStatus(asset.status))) throw assetGone();
    const ticket = input.ticketId ? await this.tickets.visible(actor, input.ticketId) : null;
    if (ticket && isTicketFinished(ticket.status as TicketStatus)) throw ticketFinished();
    const refs = { ticket: ticket && { id: ticket.id, no: ticket.ticket_no }, asset: asset && { id: asset.id, no: asset.asset_no }, planId: input.planId };
    const from = ticket ?? asset;
    if (from) return { ...refs, locationId: from.locations.id, path: from.locations.path };
    const place = await this.tree.find(actor.societyId, input.locationId!);
    if (!place || !(actor.access.can('view', 'work_orders', { path: place.path }) || actor.access.can('view', 'locations', { path: place.path }))) {
      throw locationNotFound();
    }
    return { ...refs, locationId: place.id, path: place.path };
  }

  private async checkVendor(societyId: string, vendorId: string): Promise<void> {
    const vendor = await this.prisma.vendors.findFirst({ where: { id: vendorId, society_id: societyId, archived_at: null }, select: { id: true } });
    if (!vendor) throw vendorNotFound();
  }

  private filters(query: WorkOrderListQuery): Prisma.work_ordersWhereInput[] {
    const filters: Prisma.work_ordersWhereInput[] = [];
    if (query.view === 'active') filters.push(ACTIVE);
    if (query.view === 'done' || query.view === 'cancelled') filters.push({ status: query.view });
    if (query.source === 'plan') filters.push({ plan_id: { not: null } });
    if (query.source === 'ticket') filters.push({ plan_id: null, ticket_id: { not: null } });
    if (query.source === 'asset') filters.push({ plan_id: null, ticket_id: null, asset_id: { not: null } });
    if (query.source === 'none') filters.push({ plan_id: null, ticket_id: null, asset_id: null });
    if (query.locationId) filters.push({ locations: { path: { contains: `/${query.locationId}/` } } });
    if (query.staffId) filters.push({ assigned_staff_id: query.staffId });
    if (query.vendorId) filters.push({ vendor_id: query.vendorId });
    if (query.ticketId) filters.push({ ticket_id: query.ticketId });
    if (query.assetId) filters.push({ asset_id: query.assetId });
    if (query.q) {
      const number = workOrderNumberOf(query.q);
      filters.push({
        OR: [
          ...digitVariants(query.q).map((term) => ({ title: { contains: term, mode: 'insensitive' as const } })),
          ...(number === null
            ? []
            : number.period !== null
              ? [{ wo_no: formatDocumentNo('work_order', number.period, number.no) }]
              : [{ wo_no: { endsWith: `-${String(number.no).padStart(4, '0')}` } }]),
        ],
      });
    }
    return filters;
  }
}
