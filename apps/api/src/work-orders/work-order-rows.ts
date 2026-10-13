import { Prisma } from '@s57/db';
import { workOrderSourceOf, type Place, type WorkOrderRow, type WorkOrderStatus } from '@s57/shared';
import { isoDate } from '../common/dates.js';
import { placeSelect } from '../members/member-rows.service.js';
import { staffName, staffRefOf, userName } from '../helpdesk/ticket-rows.js';

export const workOrderSelect = {
  id: true,
  wo_no: true,
  title: true,
  status: true,
  ticket_id: true,
  asset_id: true,
  plan_id: true,
  estimated_cost: true,
  completed_on: true,
  created_at: true,
  locations: { select: placeSelect },
  staff: staffName,
  vendors: { select: { id: true, name: true } },
  tickets: { select: { id: true, ticket_no: true } },
  assets: { select: { id: true, asset_no: true, name_bn: true, name_en: true } },
} satisfies Prisma.work_ordersSelect;
export type WorkOrderSelected = Prisma.work_ordersGetPayload<{ select: typeof workOrderSelect }>;

export const workOrderDetailSelect = {
  ...workOrderSelect,
  description: true,
  completion_note: true,
  cancelled_at: true,
  cancel_reason: true,
  tickets: { select: { id: true, ticket_no: true, title: true, status: true, locations: { select: { path: true } } } },
  assets: { select: { id: true, asset_no: true, name_bn: true, name_en: true, status: true, locations: { select: { path: true } }, facilities: { select: { fund_id: true } } } },
  plans: { select: { id: true, task_bn: true, task_en: true, every_months: true, next_due_on: true, last_done_on: true, archived_at: true } },
  expenses: { select: { id: true, voucher_no: true, amount: true, status: true } },
  users: userName,
} satisfies Prisma.work_ordersSelect;
export type WorkOrderDetailRow = Prisma.work_ordersGetPayload<{ select: typeof workOrderDetailSelect }>;

/** One work order as a list shows it; `place` comes from `MemberRowsService.places`. */
export function workOrderRowOf(row: WorkOrderSelected, place: Place): WorkOrderRow {
  return {
    id: row.id,
    woNo: row.wo_no,
    title: row.title,
    status: row.status as WorkOrderStatus,
    source: workOrderSourceOf({ ticketId: row.ticket_id, assetId: row.asset_id, planId: row.plan_id }),
    place,
    staff: staffRefOf(row.staff),
    vendor: row.vendors,
    estimatedCost: row.estimated_cost?.toFixed(2) ?? null,
    ticket: row.tickets ? { id: row.tickets.id, ticketNo: row.tickets.ticket_no } : null,
    asset: row.assets ? { id: row.assets.id, assetNo: row.assets.asset_no, name: { bn: row.assets.name_bn, en: row.assets.name_en } } : null,
    completedOn: row.completed_on ? isoDate(row.completed_on) : null,
    createdAt: row.created_at.toISOString(),
  };
}

/** What an audit row keeps of a work order. */
export const workOrderSnapshot = (row: WorkOrderDetailRow) => ({
  woNo: row.wo_no,
  ticketId: row.ticket_id,
  assetId: row.asset_id,
  planId: row.plan_id,
  locationId: row.locations.id,
  title: row.title,
  description: row.description,
  staffId: row.staff?.id ?? null,
  vendorId: row.vendors?.id ?? null,
  estimatedCost: row.estimated_cost?.toFixed(2) ?? null,
  status: row.status,
});
