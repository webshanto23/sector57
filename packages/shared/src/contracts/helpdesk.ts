import { z } from 'zod';
import { asciiDigits, bdPhone, optionalText, pagination, text } from '../schemas.js';
import { cleanText } from '../text.js';
import { placeSchema } from './members.js';
import { WORK_ORDER_STATUSES } from './work-orders.js';

// ---------------------------------------------------------------------------
// Tickets (অভিযোগ)
// ---------------------------------------------------------------------------

/** `tickets.category`: fixed keys, labels in i18n (`Helpdesk.category.*`). */
export const TICKET_CATEGORIES = ['street_light', 'garbage', 'water', 'drainage', 'electricity', 'security', 'noise', 'repair', 'other'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_STATUSES = ['open', 'assigned', 'in_progress', 'resolved', 'closed', 'cancelled'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Still waiting for the work to be done: these count as overdue once `due_at` passes. */
export const ACTIVE_TICKET_STATUSES = ['open', 'assigned', 'in_progress'] as const satisfies readonly TicketStatus[];
export const isTicketActive = (status: TicketStatus): boolean => (ACTIVE_TICKET_STATUSES as readonly TicketStatus[]).includes(status);

/** Closed or cancelled: nothing changes any more. */
export const isTicketFinished = (status: TicketStatus): boolean => status === 'closed' || status === 'cancelled';

/** `ticket_events.kind`. */
export const TICKET_EVENT_KINDS = ['created', 'updated', 'assigned', 'status', 'comment', 'photo', 'work_order'] as const;
export type TicketEventKind = (typeof TICKET_EVENT_KINDS)[number];

/** At most this many photos on one ticket. */
export const TICKET_PHOTO_LIMIT = 5;

/**
 * The status changes a ticket may make by hand, and the permission each needs.
 * `assigned` is not here: it follows from giving the ticket to someone (`POST /tickets/:id/assign`).
 * Working on and resolving need `helpdesk.edit`; cancelling, closing after the office has
 * confirmed, and reopening a resolved ticket need `helpdesk.approve`.
 */
export function ticketStatusMoves(from: TicketStatus): { to: TicketStatus; needs: 'edit' | 'approve' }[] {
  switch (from) {
    case 'open':
    case 'assigned':
      return [
        { to: 'in_progress', needs: 'edit' },
        { to: 'resolved', needs: 'edit' },
        { to: 'cancelled', needs: 'approve' },
      ];
    case 'in_progress':
      return [
        { to: 'resolved', needs: 'edit' },
        { to: 'cancelled', needs: 'approve' },
      ];
    case 'resolved':
      return [
        { to: 'closed', needs: 'approve' },
        { to: 'in_progress', needs: 'approve' },
      ];
    default:
      return [];
  }
}

/**
 * The status after giving a ticket to someone (or taking it back): an open ticket becomes
 * assigned, an assigned one with nobody goes back to open, the rest keep theirs.
 */
export function statusAfterAssign(status: TicketStatus, staffId: string | null): TicketStatus {
  if (status === 'open' && staffId !== null) return 'assigned';
  if (status === 'assigned' && staffId === null) return 'open';
  return status;
}

// ---------------------------------------------------------------------------
// SLA: hours to fix, per category
// ---------------------------------------------------------------------------

/** The `society_settings` key holding the hours per category. */
export const HELPDESK_SLA_KEY = 'helpdesk_sla_hours';

/** Hours from opening to the due time until the office sets its own. */
export const DEFAULT_SLA_HOURS: Record<TicketCategory, number> = {
  street_light: 72,
  garbage: 24,
  water: 24,
  drainage: 48,
  electricity: 24,
  security: 4,
  noise: 12,
  repair: 72,
  other: 72,
};

/** One category's hours: at least one, at most 60 days. */
export const SLA_HOURS_MAX = 24 * 60;
const slaHours = z.number().int().min(1).max(SLA_HOURS_MAX);

/** `PUT /helpdesk/sla`: hours for every category. */
export const slaInputSchema = z.object(Object.fromEntries(TICKET_CATEGORIES.map((key) => [key, slaHours])) as Record<TicketCategory, typeof slaHours>).strict();
export type SlaHours = z.infer<typeof slaInputSchema>;

/** The saved setting over the defaults; anything missing or broken falls back to the default. */
export function slaHoursOf(value: unknown): SlaHours {
  const saved = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    TICKET_CATEGORIES.map((key) => {
      const hours = slaHours.safeParse(saved[key]);
      return [key, hours.success ? hours.data : DEFAULT_SLA_HOURS[key]];
    }),
  ) as SlaHours;
}

/** When a ticket opened at `openedAt` is due. */
export const ticketDueAt = (openedAt: Date, hours: number): Date => new Date(openedAt.getTime() + hours * 3_600_000);

/** Overdue is derived, never stored: still active and the due time has passed. */
export const isTicketOverdue = (status: TicketStatus, dueAt: Date, now: Date): boolean => isTicketActive(status) && dueAt.getTime() < now.getTime();

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * Who reported it: a person on record, a name (and phone) typed in for a phone-in or walk-in
 * complaint, or nobody (the office or a staff member noticed it).
 */
export const ticketReporterSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('person'), personId: z.uuid() }),
  z.object({
    kind: z.literal('typed'),
    name: text(100),
    phone: z
      .string()
      .nullish()
      .transform((value) => (value == null || value.trim() === '' ? null : value))
      .pipe(bdPhone.nullable()),
  }),
  z.object({ kind: z.literal('none') }),
]);
export type TicketReporterInput = z.infer<typeof ticketReporterSchema>;

const ticketFields = {
  /** Where the problem is; inside the caller's `helpdesk.create` area. */
  locationId: z.uuid(),
  category: z.enum(TICKET_CATEGORIES),
  title: text(150),
  description: optionalText(2000),
  priority: z.enum(TICKET_PRIORITIES).default('normal'),
};

/**
 * `POST /tickets`. The number (`T-0001`) is drawn and the due time set from the category's
 * SLA when it is saved. `assignedStaffId` (a current staff member) makes it assigned at once.
 */
export const ticketCreateSchema = z.object({
  ...ticketFields,
  reporter: ticketReporterSchema.default({ kind: 'none' }),
  assignedStaffId: z.uuid().nullable().default(null),
});
export type TicketCreateInput = z.infer<typeof ticketCreateSchema>;

/**
 * `PATCH /tickets/:id` (not once closed or cancelled). A new category moves the due time to
 * that category's SLA from when the ticket was opened.
 */
export const ticketUpdateSchema = z.object({
  locationId: ticketFields.locationId.optional(),
  category: ticketFields.category.optional(),
  title: ticketFields.title.optional(),
  description: ticketFields.description.optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  reporter: ticketReporterSchema.optional(),
});
export type TicketUpdateInput = z.infer<typeof ticketUpdateSchema>;

/** `POST /tickets/:id/assign`: a current staff member, or null to take it back. */
export const ticketAssignSchema = z.object({ staffId: z.uuid().nullable(), note: optionalText(500) });
export type TicketAssignInput = z.infer<typeof ticketAssignSchema>;

/**
 * `POST /tickets/:id/status`. Resolving says what was done and cancelling says why (`note`);
 * see `ticketStatusMoves` for who may make each change. 409 `ticket_status_changed` when
 * someone else changed it first.
 */
export const ticketStatusSchema = z
  .object({ status: z.enum(TICKET_STATUSES), note: optionalText(1000) })
  .refine((input) => !(input.status === 'resolved' || input.status === 'cancelled') || input.note !== null, {
    message: 'note_required',
    path: ['note'],
  });
export type TicketStatusInput = z.infer<typeof ticketStatusSchema>;

/** `POST /tickets/:id/comments`. */
export const ticketCommentSchema = z.object({ note: text(1000) });
export type TicketCommentInput = z.infer<typeof ticketCommentSchema>;

/** Which tickets a list shows: still active (the default), overdue, resolved, closed or cancelled, or all. */
export const TICKET_VIEWS = ['active', 'overdue', 'resolved', 'finished', 'all'] as const;
export type TicketView = (typeof TICKET_VIEWS)[number];

const search = z.string().transform(cleanText).pipe(z.string().max(100)).optional();

/** `GET /tickets`: in the caller's `helpdesk.view` area. */
export const ticketListQuery = pagination.extend({
  /** Title, reporter's name or phone, or the number (`T-0012` or `12`, either digit form). */
  q: search,
  view: z.enum(TICKET_VIEWS).default('active'),
  category: z.enum(TICKET_CATEGORIES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  locationId: z.uuid().optional(),
  staffId: z.uuid().optional(),
});
export type TicketListQuery = z.infer<typeof ticketListQuery>;

/** The digits of a ticket number typed as `T-0012`, `t12` or `12` (either digit form); null when it isn't one. */
export function ticketNumberOf(term: string): number | null {
  const match = /^(?:t[\s-]*)?0*(\d{1,9})$/i.exec(asciiDigits(term.trim()));
  return match ? Number(match[1]) : null;
}

/** Most urgent first: priority, then the soonest due. */
export function compareTicketUrgency(
  a: { priority: TicketPriority; dueAt: Date },
  b: { priority: TicketPriority; dueAt: Date },
): number {
  const rank = TICKET_PRIORITIES.indexOf(b.priority) - TICKET_PRIORITIES.indexOf(a.priority);
  return rank !== 0 ? rank : a.dueAt.getTime() - b.dueAt.getTime();
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

const bilingual = z.object({ bn: z.string(), en: z.string().nullable() });
const staffRef = z.object({ id: z.uuid(), staffNo: z.number().int(), name: z.string(), nameEn: z.string().nullable() });
const userRef = z.object({ id: z.uuid(), name: z.string() });
const instant = z.iso.datetime({ offset: true });

/** Who reported it, as shown: a person on record (name only), a typed name and phone, or nobody. */
export const ticketReporterViewSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('person'), personId: z.uuid(), name: z.string() }),
  z.object({ kind: z.literal('typed'), name: z.string(), phone: z.string().nullable() }),
  z.object({ kind: z.literal('none') }),
]);
export type TicketReporterView = z.infer<typeof ticketReporterViewSchema>;

export const ticketRowSchema = z.object({
  id: z.uuid(),
  ticketNo: z.string(),
  title: z.string(),
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES),
  status: z.enum(TICKET_STATUSES),
  place: placeSchema,
  reporter: ticketReporterViewSchema,
  assignee: staffRef.nullable(),
  dueAt: instant,
  /** Derived: still active and past its due time. */
  overdue: z.boolean(),
  createdAt: instant,
});
export type TicketRow = z.infer<typeof ticketRowSchema>;

export const ticketListSchema = z.object({
  items: z.array(ticketRowSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  /** In the caller's area, filters ignored: still active, overdue, due later today, resolved in the last 7 days. */
  counts: z.object({
    active: z.number().int().min(0),
    overdue: z.number().int().min(0),
    dueToday: z.number().int().min(0),
    resolvedWeek: z.number().int().min(0),
  }),
  can: z.object({ create: z.boolean() }),
});
export type TicketList = z.infer<typeof ticketListSchema>;

/** What an event recorded, as it was then (names, not ids). */
export const ticketEventDetailSchema = z.object({
  /** For `status`: from and to. */
  from: z.enum(TICKET_STATUSES).optional(),
  to: z.enum(TICKET_STATUSES).optional(),
  /** For `assigned` (and `created` when given at once): the staff member's name; null when taken back. */
  staff: z.string().nullable().optional(),
  /** For `updated`: the fields changed. */
  fields: z.array(z.string()).optional(),
  /** For `work_order`: its number, and what became of it (raised, done or cancelled). */
  workOrderNo: z.string().optional(),
  workOrderStatus: z.enum(WORK_ORDER_STATUSES).optional(),
});
export type TicketEventDetail = z.infer<typeof ticketEventDetailSchema>;

export const ticketEventSchema = z.object({
  id: z.uuid(),
  kind: z.enum(TICKET_EVENT_KINDS),
  detail: ticketEventDetailSchema,
  note: z.string().nullable(),
  /** For `photo`: the image and its thumbnail. */
  photoUrl: z.string().nullable(),
  thumbUrl: z.string().nullable(),
  by: userRef.nullable(),
  at: instant,
});
export type TicketEvent = z.infer<typeof ticketEventSchema>;

/** `GET /tickets/:id`. */
export const ticketDetailSchema = ticketRowSchema.extend({
  description: z.string().nullable(),
  resolvedAt: instant.nullable(),
  resolutionNote: z.string().nullable(),
  closedAt: instant.nullable(),
  reportedBy: userRef.nullable(),
  /** Oldest first. */
  events: z.array(ticketEventSchema),
  /** Work orders raised on it, shown with `work_orders.view` where it is. */
  workOrders: z.array(z.object({ id: z.uuid(), woNo: z.string(), title: z.string(), status: z.enum(WORK_ORDER_STATUSES) })),
  can: z.object({
    /** Change details, assign, comment and add photos (not once closed or cancelled). */
    edit: z.boolean(),
    /** Room for another photo. */
    photo: z.boolean(),
    /** Raise a work order on it (`work_orders.create` where it is, not once closed or cancelled). */
    workOrder: z.boolean(),
    /** The status changes the caller may make now. */
    statuses: z.array(z.enum(TICKET_STATUSES)),
  }),
});
export type TicketDetail = z.infer<typeof ticketDetailSchema>;

/** `GET /tickets/staff?q=`: current staff a ticket may be given to (posted inside the caller's area or above it). */
export const ticketStaffQuery = z.object({ q: search });
export type TicketStaffQuery = z.infer<typeof ticketStaffQuery>;
export const ticketStaffListSchema = z.object({ items: z.array(staffRef.extend({ designation: bilingual })) });
export type TicketStaffList = z.infer<typeof ticketStaffListSchema>;

/** `GET /helpdesk/sla`: hours per category in force; `edit` when the caller may change them. */
export const slaViewSchema = z.object({ hours: slaInputSchema, can: z.object({ edit: z.boolean() }) });
export type SlaView = z.infer<typeof slaViewSchema>;
