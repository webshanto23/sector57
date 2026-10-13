import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  ACTIVE_TICKET_STATUSES,
  asciiDigits,
  digitVariants,
  formatDocumentNo,
  isTicketFinished,
  ticketDueAt,
  ticketNumberOf,
  ticketStatusMoves,
  TICKET_PHOTO_LIMIT,
  type TicketCreateInput,
  type TicketDetail,
  type TicketEventDetail,
  type TicketEventKind,
  type TicketList,
  type TicketListQuery,
  type TicketStatus,
  type TicketUpdateInput,
  type WorkOrderStatus,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { endOfToday, isoDate, todayDate } from '../common/dates.js';
import { mediaUrl, thumbKey } from '../common/media.js';
import { ENV, type Env } from '../config/env.js';
import { NumberingService } from '../finance/numbering.service.js';
import { MemberRowsService } from '../members/member-rows.service.js';
import { auditOf } from '../members/parties.service.js';
import { scopeWhere } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beyondPermissions, locationNotFound, TreeService, type LocationRow } from '../property/tree.service.js';
import { HelpdeskService } from './helpdesk.service.js';
import { ticketDetailSelect, ticketRowOf, ticketSelect, ticketSnapshot, userName, userRefOf, type TicketDetailRow } from './ticket-rows.js';

type Tx = Prisma.TransactionClient;

export const ticketNotFound = () => new NotFoundException({ code: 'ticket_not_found', message: 'Ticket not found' });
export const ticketFinished = () => new ConflictException({ code: 'ticket_finished', message: 'This ticket is closed or cancelled' });

/** Most timeline events a detail shows. */
const EVENT_LIMIT = 200;
const WEEK_MS = 7 * 86_400_000;
const ACTIVE = { status: { in: [...ACTIVE_TICKET_STATUSES] } } satisfies Prisma.ticketsWhereInput;

/**
 * Tickets (`helpdesk` permission, area-scoped through where the problem is). Numbered `T-NNNN`
 * when saved, due after the category's SLA hours; never deleted, only closed or cancelled.
 * Every change is audited and written to the ticket's timeline (`ticket_events`).
 * Assigning and status changes are in `TicketActionsService`.
 */
@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly helpdesk: HelpdeskService,
    private readonly tree: TreeService,
    private readonly rows: MemberRowsService,
    private readonly numbering: NumberingService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async list(actor: Actor, query: TicketListQuery): Promise<TicketList> {
    const { page, pageSize } = query;
    const now = new Date();
    const scope = this.scope(actor);
    const where: Prisma.ticketsWhereInput = { AND: [scope, ...this.filters(query, now)] };
    const soonest = query.view === 'active' || query.view === 'overdue';
    const [rows, total, active, overdue, dueToday, resolvedWeek] = await Promise.all([
      this.prisma.tickets.findMany({
        where,
        select: ticketSelect,
        orderBy: soonest ? [{ due_at: 'asc' }, { id: 'asc' }] : [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.tickets.count({ where }),
      this.prisma.tickets.count({ where: { AND: [scope, ACTIVE] } }),
      this.prisma.tickets.count({ where: { AND: [scope, ACTIVE, { due_at: { lt: now } }] } }),
      this.prisma.tickets.count({ where: { AND: [scope, ACTIVE, { due_at: { gte: now, lt: endOfToday(now) } }] } }),
      this.prisma.tickets.count({ where: { AND: [scope, { resolved_at: { gte: new Date(now.getTime() - WEEK_MS) } }] } }),
    ]);
    const place = await this.rows.places(actor.societyId, rows.map((row) => row.locations));
    return {
      items: rows.map((row) => ticketRowOf(row, place(row.locations), now)),
      total,
      page,
      pageSize,
      counts: { active, overdue, dueToday, resolvedWeek },
      can: { create: actor.access.can('create', 'helpdesk') },
    };
  }

  async get(actor: Actor, id: string): Promise<TicketDetail> {
    const row = await this.visible(actor, id);
    const { access } = actor;
    const at = { path: row.locations.path };
    const status = row.status as TicketStatus;
    const [events, workOrders] = await Promise.all([
      this.prisma.ticket_events.findMany({
        where: { ticket_id: id },
        select: { id: true, kind: true, detail: true, note: true, photo_url: true, created_at: true, users: userName },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        take: EVENT_LIMIT,
      }),
      access.can('view', 'work_orders', at)
        ? this.prisma.work_orders.findMany({ where: { ticket_id: id }, select: { id: true, wo_no: true, title: true, status: true }, orderBy: [{ created_at: 'asc' }] })
        : [],
    ]);
    const place = await this.rows.places(actor.societyId, [row.locations]);
    const edit = access.can('edit', 'helpdesk', at) && !isTicketFinished(status);
    const photos = events.filter((event) => event.kind === 'photo').length;
    return {
      ...ticketRowOf(row, place(row.locations), new Date()),
      description: row.description,
      resolvedAt: row.resolved_at?.toISOString() ?? null,
      resolutionNote: row.resolution_note,
      closedAt: row.closed_at?.toISOString() ?? null,
      reportedBy: userRefOf(row.users),
      events: events.map((event) => ({
        id: event.id,
        kind: event.kind as TicketEventKind,
        detail: (event.detail ?? {}) as TicketEventDetail,
        note: event.note,
        photoUrl: mediaUrl(event.photo_url, this.env.MEDIA_BASE_URL),
        thumbUrl: mediaUrl(thumbKey(event.photo_url), this.env.MEDIA_BASE_URL),
        by: userRefOf(event.users),
        at: event.created_at.toISOString(),
      })),
      workOrders: workOrders.map((order) => ({ id: order.id, woNo: order.wo_no, title: order.title, status: order.status as WorkOrderStatus })),
      can: {
        edit,
        photo: edit && photos < TICKET_PHOTO_LIMIT,
        workOrder: access.can('create', 'work_orders', at) && !isTicketFinished(status),
        statuses: ticketStatusMoves(status)
          .filter((move) => access.can(move.needs, 'helpdesk', at))
          .map((move) => move.to),
      },
    };
  }

  /** 404 `location_not_found`, `staff_not_found`, `person_not_found`. */
  async create(actor: Actor, input: TicketCreateInput): Promise<TicketDetail> {
    const place = await this.placeAt(actor, input.locationId, 'create');
    const staff = input.assignedStaffId ? await this.helpdesk.pickStaff(actor, input.assignedStaffId) : null;
    const reporter = await this.helpdesk.reporter(actor.societyId, input.reporter);
    const id = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const hours = (await this.helpdesk.slaHours(actor.societyId, tx))[input.category];
      const number = await this.numbering.next(tx, actor.societyId, 'ticket', isoDate(todayDate(now)));
      const made = await tx.tickets.create({
        data: {
          society_id: actor.societyId,
          ticket_no: number.formatted,
          location_id: place.id,
          category: input.category,
          title: input.title,
          description: input.description,
          priority: input.priority,
          status: staff ? 'assigned' : 'open',
          ...reporter,
          reported_by: actor.userId,
          assigned_staff_id: staff?.id ?? null,
          due_at: ticketDueAt(now, hours),
          created_at: now,
        },
        select: ticketDetailSelect,
      });
      await this.event(tx, actor, made.id, 'created', staff ? { staff: staff.name } : {});
      await this.audit.record({ ...auditOf(actor, 'ticket', 'create', made.id), after: ticketSnapshot(made) }, tx);
      return made.id;
    });
    return this.get(actor, id);
  }

  /**
   * Not once closed or cancelled (409 `ticket_finished`). A new place needs `helpdesk.edit`
   * there too; a new category moves the due time to its SLA from when the ticket was opened.
   */
  async update(actor: Actor, id: string, input: TicketUpdateInput): Promise<TicketDetail> {
    const before = await this.editable(actor, id);
    const place = input.locationId && input.locationId !== before.locations.id ? await this.placeAt(actor, input.locationId, 'edit') : null;
    const reporter = input.reporter ? await this.helpdesk.reporter(actor.societyId, input.reporter) : undefined;
    await this.prisma.$transaction(async (tx) => {
      const category = input.category && input.category !== before.category ? input.category : null;
      const dueAt = category ? ticketDueAt(before.created_at, (await this.helpdesk.slaHours(actor.societyId, tx))[category]) : undefined;
      const { count } = await tx.tickets.updateMany({
        where: { id, status: { notIn: ['closed', 'cancelled'] } },
        data: {
          location_id: place?.id,
          category: input.category,
          title: input.title,
          description: input.description,
          priority: input.priority,
          ...reporter,
          due_at: dueAt,
        },
      });
      if (count === 0) throw ticketFinished();
      const after = await tx.tickets.findUniqueOrThrow({ where: { id }, select: ticketDetailSelect });
      const was = ticketSnapshot(before);
      const now = ticketSnapshot(after);
      const fields = (Object.keys(now) as (keyof typeof now)[]).filter((key) => key !== 'dueAt' && now[key] !== was[key]);
      if (fields.length === 0) return;
      await this.event(tx, actor, id, 'updated', { fields });
      await this.audit.record({ ...auditOf(actor, 'ticket', 'update', id), before: was, after: now }, tx);
    });
    return this.get(actor, id);
  }

  /** A ticket the caller may see where the problem is, or 404. */
  async visible(actor: Actor, id: string): Promise<TicketDetailRow> {
    const row = await this.prisma.tickets.findFirst({ where: { id, society_id: actor.societyId }, select: ticketDetailSelect });
    if (!row || !actor.access.can('view', 'helpdesk', { path: row.locations.path })) throw ticketNotFound();
    return row;
  }

  /** A ticket the caller may change: seen (404), `helpdesk.edit` there (403), not closed or cancelled (409 `ticket_finished`). */
  async editable(actor: Actor, id: string): Promise<TicketDetailRow> {
    const row = await this.visible(actor, id);
    if (!actor.access.can('edit', 'helpdesk', { path: row.locations.path })) throw beyondPermissions();
    if (isTicketFinished(row.status as TicketStatus)) throw ticketFinished();
    return row;
  }

  /** Ticket rows in the caller's `helpdesk.view` area. */
  scope(actor: Actor): Prisma.ticketsWhereInput {
    return { society_id: actor.societyId, locations: scopeWhere(actor.access, 'view', 'helpdesk', (prefix) => ({ path: { startsWith: prefix } })) };
  }

  /** Writes one timeline event (inside the change's transaction). */
  async event(tx: Tx, actor: Actor, ticketId: string, kind: TicketEventKind, detail: TicketEventDetail, note: string | null = null, photoUrl: string | null = null): Promise<void> {
    await tx.ticket_events.create({ data: { society_id: actor.societyId, ticket_id: ticketId, kind, detail, note, photo_url: photoUrl, created_by: actor.userId } });
  }

  /** A place a ticket goes on: one the caller sees (404) and may `action` tickets at (403). */
  private async placeAt(actor: Actor, locationId: string, action: 'create' | 'edit'): Promise<LocationRow> {
    const place = await this.tree.find(actor.societyId, locationId);
    if (!place || !(actor.access.can('view', 'helpdesk', { path: place.path }) || actor.access.can('view', 'locations', { path: place.path }))) {
      throw locationNotFound();
    }
    if (!actor.access.can(action, 'helpdesk', { path: place.path })) throw beyondPermissions();
    return place;
  }

  private filters(query: TicketListQuery, now: Date): Prisma.ticketsWhereInput[] {
    const filters: Prisma.ticketsWhereInput[] = [];
    if (query.view === 'active') filters.push(ACTIVE);
    if (query.view === 'overdue') filters.push(ACTIVE, { due_at: { lt: now } });
    if (query.view === 'resolved') filters.push({ status: 'resolved' });
    if (query.view === 'finished') filters.push({ status: { in: ['closed', 'cancelled'] } });
    if (query.category) filters.push({ category: query.category });
    if (query.priority) filters.push({ priority: query.priority });
    if (query.staffId) filters.push({ assigned_staff_id: query.staffId });
    if (query.locationId) filters.push({ locations: { path: { contains: `/${query.locationId}/` } } });
    if (query.q) {
      const number = ticketNumberOf(query.q);
      const phone = asciiDigits(query.q).replace(/[\s-]/g, '');
      filters.push({
        OR: [
          ...digitVariants(query.q).flatMap((term) => [
            { title: { contains: term, mode: 'insensitive' as const } },
            { reporter_name: { contains: term, mode: 'insensitive' as const } },
            { persons: { full_name: { contains: term, mode: 'insensitive' as const } } },
          ]),
          ...(/^\d{4,}$/.test(phone) ? [{ reporter_phone: { contains: phone } }] : []),
          ...(number !== null ? [{ ticket_no: formatDocumentNo('ticket', '', number) }] : []),
        ],
      });
    }
    return filters;
  }
}
