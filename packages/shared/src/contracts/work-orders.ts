import { z } from 'zod';
import { isZeroMoney, optionalMoneySchema } from '../money.js';
import { asciiDigits, optionalText, pagination, text } from '../schemas.js';
import { cleanText } from '../text.js';
import { EXPENSE_STATUSES } from './expenses.js';
import { isoDay, placeSchema } from './members.js';

// ---------------------------------------------------------------------------
// Work orders (কাজের আদেশ)
// ---------------------------------------------------------------------------

export const WORK_ORDER_STATUSES = ['open', 'in_progress', 'done', 'cancelled'] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

/** Done or cancelled: nothing changes any more. */
export const isWorkOrderFinished = (status: WorkOrderStatus): boolean => status === 'done' || status === 'cancelled';

/** What a work order came from (derived from which source column is set). */
export const WORK_ORDER_SOURCES = ['ticket', 'asset', 'plan', 'none'] as const;
export type WorkOrderSource = (typeof WORK_ORDER_SOURCES)[number];

export function workOrderSourceOf(row: { ticketId: string | null; assetId: string | null; planId: string | null }): WorkOrderSource {
  if (row.planId !== null) return 'plan';
  if (row.ticketId !== null) return 'ticket';
  return row.assetId !== null ? 'asset' : 'none';
}

/**
 * The changes a work order may make, and the permission each needs: starting and finishing
 * with `work_orders.edit`, cancelling with `work_orders.approve`. Finished ones stay as they are.
 */
export function workOrderMoves(from: WorkOrderStatus): { to: WorkOrderStatus; needs: 'edit' | 'approve' }[] {
  if (isWorkOrderFinished(from)) return [];
  return [
    ...(from === 'open' ? [{ to: 'in_progress' as const, needs: 'edit' as const }] : []),
    { to: 'done', needs: 'edit' },
    { to: 'cancelled', needs: 'approve' },
  ];
}

/** Done by a staff member or an outside vendor, never both (or nobody yet). */
const assigneeFields = {
  staffId: z.uuid().nullable().default(null),
  vendorId: z.uuid().nullable().default(null),
};
const oneAssignee = (input: { staffId?: string | null; vendorId?: string | null }) => !(input.staffId && input.vendorId);
const oneAssigneeError = { message: 'one_assignee', path: ['vendorId'] };

/**
 * `POST /work-orders`. The source is a ticket, an asset, an asset's upkeep plan (its asset
 * comes with it), or nothing. The place comes from the ticket, else the asset; a job with
 * neither needs `locationId`. The number (`WO-26-0001`) is drawn when it is saved.
 */
export const workOrderCreateSchema = z
  .object({
    ticketId: z.uuid().nullable().default(null),
    assetId: z.uuid().nullable().default(null),
    planId: z.uuid().nullable().default(null),
    locationId: z.uuid().nullable().default(null),
    title: text(150),
    description: optionalText(2000),
    ...assigneeFields,
    estimatedCost: optionalMoneySchema,
  })
  .refine(oneAssignee, oneAssigneeError)
  .refine((input) => input.ticketId !== null || input.assetId !== null || input.planId !== null || input.locationId !== null, {
    message: 'place_required',
    path: ['locationId'],
  });
export type WorkOrderCreateInput = z.infer<typeof workOrderCreateSchema>;

/** `PATCH /work-orders/:id` (not once done or cancelled). */
export const workOrderUpdateSchema = z
  .object({
    title: text(150).optional(),
    description: optionalText(2000).optional(),
    staffId: z.uuid().nullable().optional(),
    vendorId: z.uuid().nullable().optional(),
    estimatedCost: optionalMoneySchema.optional(),
  })
  .refine(oneAssignee, oneAssigneeError);
export type WorkOrderUpdateInput = z.infer<typeof workOrderUpdateSchema>;

/**
 * `POST /work-orders/:id/done`. The day (not in the future) and what was done. A cost makes a
 * pending expense request under `headId` (needs `expenses.create` too); approving and paying
 * it go through Expenses as usual. A plan's work order moves the plan's next due day on.
 */
export const workOrderDoneSchema = z
  .object({
    completedOn: isoDay,
    note: text(1000),
    cost: optionalMoneySchema,
    headId: z.uuid().nullable().default(null),
  })
  .refine((input) => input.cost === null || isZeroMoney(input.cost) || input.headId !== null, {
    message: 'head_required',
    path: ['headId'],
  });
export type WorkOrderDoneInput = z.infer<typeof workOrderDoneSchema>;

/** `POST /work-orders/:id/cancel`. */
export const workOrderCancelSchema = z.object({ reason: text(300) });
export type WorkOrderCancelInput = z.infer<typeof workOrderCancelSchema>;

/** Which work orders a list shows: not finished (the default), done, cancelled, or all. */
export const WORK_ORDER_VIEWS = ['active', 'done', 'cancelled', 'all'] as const;
export type WorkOrderView = (typeof WORK_ORDER_VIEWS)[number];

/** `GET /work-orders`: in the caller's `work_orders.view` area. */
export const workOrderListQuery = pagination.extend({
  /** Title, or the number (`WO-26-0012`, `26-12`, or just `12` for any year; either digit form). */
  q: z.string().transform(cleanText).pipe(z.string().max(100)).optional(),
  view: z.enum(WORK_ORDER_VIEWS).default('active'),
  source: z.enum(WORK_ORDER_SOURCES).optional(),
  locationId: z.uuid().optional(),
  staffId: z.uuid().optional(),
  vendorId: z.uuid().optional(),
  ticketId: z.uuid().optional(),
  assetId: z.uuid().optional(),
});
export type WorkOrderListQuery = z.infer<typeof workOrderListQuery>;

/**
 * A work order number typed as `WO-26-0012`, `wo 26-12`, `26-12` or just `12`: the year's
 * period (null when not typed) and the number; null when it isn't one.
 */
export function workOrderNumberOf(term: string): { period: string | null; no: number } | null {
  const match = /^(?:wo[\s-]*)?(?:(\d{2})[\s-]+)?0*(\d{1,9})$/i.exec(asciiDigits(term.trim()));
  return match ? { period: match[1] ?? null, no: Number(match[2]) } : null;
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

const bilingual = z.object({ bn: z.string(), en: z.string().nullable() });
const staffRef = z.object({ id: z.uuid(), staffNo: z.number().int(), name: z.string(), nameEn: z.string().nullable() });
const userRef = z.object({ id: z.uuid(), name: z.string() });
const instant = z.iso.datetime({ offset: true });

export const workOrderRowSchema = z.object({
  id: z.uuid(),
  woNo: z.string(),
  title: z.string(),
  status: z.enum(WORK_ORDER_STATUSES),
  source: z.enum(WORK_ORDER_SOURCES),
  place: placeSchema,
  staff: staffRef.nullable(),
  vendor: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  estimatedCost: z.string().nullable(),
  ticket: z.object({ id: z.uuid(), ticketNo: z.string() }).nullable(),
  asset: z.object({ id: z.uuid(), assetNo: z.string(), name: bilingual }).nullable(),
  completedOn: isoDay.nullable(),
  createdAt: instant,
});
export type WorkOrderRow = z.infer<typeof workOrderRowSchema>;

export const workOrderListSchema = z.object({
  items: z.array(workOrderRowSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  /** In the caller's area, filters ignored. */
  counts: z.object({ open: z.number().int().min(0), inProgress: z.number().int().min(0) }),
  can: z.object({ create: z.boolean() }),
});
export type WorkOrderList = z.infer<typeof workOrderListSchema>;

/** `GET /work-orders/:id`. `open` on a link: the caller may open it (the ticket, the asset, the expense). */
export const workOrderDetailSchema = workOrderRowSchema.extend({
  description: z.string().nullable(),
  ticket: z.object({ id: z.uuid(), ticketNo: z.string(), title: z.string(), open: z.boolean() }).nullable(),
  asset: z.object({ id: z.uuid(), assetNo: z.string(), name: bilingual, open: z.boolean() }).nullable(),
  plan: z.object({ id: z.uuid(), task: bilingual }).nullable(),
  completionNote: z.string().nullable(),
  cancelledAt: instant.nullable(),
  cancelReason: z.string().nullable(),
  /** The expense request made when it was finished with a cost. */
  expense: z.object({ id: z.uuid(), voucherNo: z.string().nullable(), amount: z.string(), status: z.enum(EXPENSE_STATUSES), open: z.boolean() }).nullable(),
  createdBy: userRef.nullable(),
  can: z.object({
    /** Change details and the assignee (not once done or cancelled). */
    edit: z.boolean(),
    /** The status changes the caller may make now. */
    statuses: z.array(z.enum(WORK_ORDER_STATUSES)),
    /** May finish it with a cost (`expenses.create`). */
    cost: z.boolean(),
  }),
});
export type WorkOrderDetail = z.infer<typeof workOrderDetailSchema>;

/** `GET /work-orders/options`: vendors a job may go to. */
export const workOrderOptionsSchema = z.object({ vendors: z.array(z.object({ id: z.uuid(), name: z.string() })) });
export type WorkOrderOptions = z.infer<typeof workOrderOptionsSchema>;
