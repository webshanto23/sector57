import { ConflictException, Injectable } from '@nestjs/common';
import {
  statusAfterAssign,
  ticketStatusMoves,
  TICKET_PHOTO_LIMIT,
  type TicketAssignInput,
  type TicketCommentInput,
  type TicketDetail,
  type TicketStatus,
  type TicketStatusInput,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { auditOf } from '../members/parties.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beyondPermissions } from '../property/tree.service.js';
import { MediaService } from '../storage/media.service.js';
import { HelpdeskService } from './helpdesk.service.js';
import { TicketsService } from './tickets.service.js';

const statusChanged = () => new ConflictException({ code: 'ticket_status_changed', message: 'Someone changed this ticket just now; reload' });

/**
 * What happens to a ticket after it is opened: giving it to someone, moving its status
 * (`ticketStatusMoves` in shared says who may), comments and photos. Each writes a timeline
 * event and an audit row in one transaction; status changes are conditional on the old status.
 */
@Injectable()
export class TicketActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tickets: TicketsService,
    private readonly helpdesk: HelpdeskService,
    private readonly media: MediaService,
  ) {}

  /** Give the ticket to a current staff member, or take it back (`staffId: null`). 409 `ticket_assignee_same`. */
  async assign(actor: Actor, id: string, input: TicketAssignInput): Promise<TicketDetail> {
    const row = await this.tickets.editable(actor, id);
    const was = row.staff?.id ?? null;
    if (input.staffId === was) throw new ConflictException({ code: 'ticket_assignee_same', message: 'The ticket is already with them' });
    const staff = input.staffId ? await this.helpdesk.pickStaff(actor, input.staffId) : null;
    const from = row.status as TicketStatus;
    const to = statusAfterAssign(from, staff?.id ?? null);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.tickets.updateMany({ where: { id, status: from, assigned_staff_id: was }, data: { assigned_staff_id: staff?.id ?? null, status: to } });
      if (count === 0) throw statusChanged();
      await this.tickets.event(tx, actor, id, 'assigned', { staff: staff?.name ?? null, ...(to !== from ? { from, to } : {}) }, input.note);
      await this.audit.record(
        { ...auditOf(actor, 'ticket', 'assign', id), before: { assignedStaffId: was, status: from }, after: { assignedStaffId: staff?.id ?? null, status: to } },
        tx,
      );
    });
    return this.tickets.get(actor, id);
  }

  /**
   * 409 `ticket_status_same`, `ticket_status_invalid`, `ticket_status_changed`; 403 without the
   * permission the move needs. Resolving keeps the note as what was done; reopening clears it.
   */
  async setStatus(actor: Actor, id: string, input: TicketStatusInput): Promise<TicketDetail> {
    const row = await this.tickets.visible(actor, id);
    const from = row.status as TicketStatus;
    if (input.status === from) throw new ConflictException({ code: 'ticket_status_same', message: 'The ticket already has this status' });
    const move = ticketStatusMoves(from).find((candidate) => candidate.to === input.status);
    if (!move) throw new ConflictException({ code: 'ticket_status_invalid', message: 'The ticket cannot move to this status from here' });
    if (!actor.access.can(move.needs, 'helpdesk', { path: row.locations.path })) throw beyondPermissions();

    const now = new Date();
    const to = input.status;
    const data =
      to === 'resolved'
        ? { resolved_at: now, resolution_note: input.note }
        : to === 'closed' || to === 'cancelled'
          ? { closed_at: now }
          : from === 'resolved'
            ? { resolved_at: null, resolution_note: null }
            : {};
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.tickets.updateMany({ where: { id, status: from }, data: { status: to, ...data } });
      if (count === 0) throw statusChanged();
      await this.tickets.event(tx, actor, id, 'status', { from, to }, input.note);
      await this.audit.record({ ...auditOf(actor, 'ticket', 'status', id), before: { status: from }, after: { status: to, note: input.note } }, tx);
    });
    return this.tickets.get(actor, id);
  }

  async comment(actor: Actor, id: string, input: TicketCommentInput): Promise<TicketDetail> {
    await this.tickets.editable(actor, id);
    await this.prisma.$transaction(async (tx) => {
      await this.tickets.event(tx, actor, id, 'comment', {}, input.note);
      await this.audit.record({ ...auditOf(actor, 'ticket', 'comment', id) }, tx);
    });
    return this.tickets.get(actor, id);
  }

  /** At most `TICKET_PHOTO_LIMIT` photos (409 `ticket_photo_limit`); photos stay on the timeline. */
  async addPhoto(actor: Actor, id: string, upload: Buffer): Promise<TicketDetail> {
    await this.tickets.editable(actor, id);
    if ((await this.photoCount(id)) >= TICKET_PHOTO_LIMIT) throw photoLimit();
    const key = await this.media.saveImage(actor.societyId, 'tickets', upload);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM tickets WHERE id = ${id}::uuid FOR UPDATE`;
        if ((await this.photoCount(id, tx)) >= TICKET_PHOTO_LIMIT) throw photoLimit();
        await this.tickets.event(tx, actor, id, 'photo', {}, null, key);
        await this.audit.record({ ...auditOf(actor, 'ticket', 'photo', id) }, tx);
      });
    } catch (error) {
      await this.media.removeQuietly(actor.societyId, [key]);
      throw error;
    }
    return this.tickets.get(actor, id);
  }

  private photoCount(id: string, client: Pick<PrismaService, 'ticket_events'> = this.prisma): Promise<number> {
    return client.ticket_events.count({ where: { ticket_id: id, kind: 'photo' } });
  }
}

const photoLimit = () => new ConflictException({ code: 'ticket_photo_limit', message: `At most ${TICKET_PHOTO_LIMIT} photos on one ticket` });
