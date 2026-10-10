import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import type {
  CommitteeSeat,
  CommitteeSeatCreateInput,
  CommitteeSeatList,
  CommitteeSeatUpdateInput,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate } from '../common/dates.js';
import { mediaUrl } from '../common/media.js';
import { ENV, type Env } from '../config/env.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MediaService } from '../storage/media.service.js';

const select = {
  id: true,
  person_id: true,
  position: true,
  sort_order: true,
  term_start: true,
  term_end: true,
  persons: { select: { full_name: true, full_name_en: true, phone: true, photo_url: true } },
} satisfies Prisma.committee_membersSelect;

type SeatRow = Prisma.committee_membersGetPayload<{ select: typeof select }>;

const notFound = () => new NotFoundException({ code: 'seat_not_found', message: 'Committee member not found' });

/** What an audit row keeps of a seat. */
const snapshot = (seat: { nameBn: string; nameEn: string | null; position: string; sortOrder: number; termStart: string; termEnd: string | null }) => ({
  nameBn: seat.nameBn,
  nameEn: seat.nameEn,
  position: seat.position,
  sortOrder: seat.sortOrder,
  termStart: seat.termStart,
  termEnd: seat.termEnd,
});

/**
 * Committee seats in the dashboard. A seat links a person (from `persons`) to a
 * position for a term; the portrait is the person's photo.
 */
@Injectable()
export class CommitteeAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private toSeat(row: SeatRow): CommitteeSeat {
    return {
      id: row.id,
      personId: row.person_id,
      nameBn: row.persons.full_name,
      nameEn: row.persons.full_name_en,
      phone: row.persons.phone,
      position: row.position,
      sortOrder: row.sort_order,
      termStart: isoDate(row.term_start),
      termEnd: row.term_end ? isoDate(row.term_end) : null,
      photoUrl: mediaUrl(row.persons.photo_url, this.env.MEDIA_BASE_URL),
    };
  }

  /** The foreign key doesn't stop linking another society's person, so both sides are checked. */
  private ownWhere(societyId: string) {
    return { society_id: societyId, persons: { society_id: societyId } };
  }

  async list(societyId: string): Promise<CommitteeSeatList> {
    const rows = await this.prisma.committee_members.findMany({
      where: this.ownWhere(societyId),
      select,
      orderBy: [{ term_start: 'desc' }, { sort_order: 'asc' }, { id: 'asc' }],
    });
    return { items: rows.map((row) => this.toSeat(row)) };
  }

  async get(societyId: string, id: string): Promise<CommitteeSeat> {
    const row = await this.prisma.committee_members.findFirst({ where: { id, ...this.ownWhere(societyId) }, select });
    if (!row) throw notFound();
    return this.toSeat(row);
  }

  /** Reuses the society's person with this phone (keeping their stored names); otherwise creates one. */
  async create(actor: Actor, input: CommitteeSeatCreateInput): Promise<CommitteeSeat> {
    const id = await this.prisma.$transaction(async (tx) => {
      const existing = input.phone
        ? await tx.persons.findUnique({
            where: { society_id_phone: { society_id: actor.societyId, phone: input.phone } },
            select: { id: true },
          })
        : null;
      const person =
        existing ??
        (await tx.persons.create({
          data: { society_id: actor.societyId, full_name: input.nameBn, full_name_en: input.nameEn, phone: input.phone },
          select: { id: true },
        }));
      const seat = await tx.committee_members.create({
        data: { society_id: actor.societyId, person_id: person.id, ...seatData(input) },
        select: { id: true },
      });
      await this.audit.record(
        { ...auditOf(actor, 'create', seat.id), after: { ...snapshot(input), personId: person.id, reusedPerson: !!existing } },
        tx,
      );
      return seat.id;
    });
    return this.get(actor.societyId, id);
  }

  /** Changes the seat and the linked person's names (they are the person's names everywhere). */
  async update(actor: Actor, id: string, input: CommitteeSeatUpdateInput): Promise<CommitteeSeat> {
    const before = await this.get(actor.societyId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.committee_members.update({ where: { id }, data: seatData(input) });
      await tx.persons.update({
        where: { id: before.personId },
        data: { full_name: input.nameBn, full_name_en: input.nameEn },
      });
      await this.audit.record({ ...auditOf(actor, 'update', id), before: snapshot(before), after: snapshot(input) }, tx);
    });
    return this.get(actor.societyId, id);
  }

  /** Removes the seat only; the person and their photo stay. */
  async remove(actor: Actor, id: string): Promise<void> {
    const before = await this.get(actor.societyId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.committee_members.delete({ where: { id } });
      await this.audit.record({ ...auditOf(actor, 'delete', id), before: snapshot(before) }, tx);
    });
  }

  /** Stores a new portrait on the seat's person and deletes the old file. */
  async setPhoto(actor: Actor, id: string, upload: Buffer): Promise<CommitteeSeat> {
    const seat = await this.get(actor.societyId, id);
    const key = await this.media.saveImage(actor.societyId, 'people', upload);
    let old: string | null;
    try {
      old = await this.replacePhoto(actor, id, seat.personId, key);
    } catch (error) {
      await this.media.removeQuietly(actor.societyId, [key]);
      throw error;
    }
    await this.media.removeQuietly(actor.societyId, [old]);
    return this.get(actor.societyId, id);
  }

  async removePhoto(actor: Actor, id: string): Promise<CommitteeSeat> {
    const seat = await this.get(actor.societyId, id);
    const old = await this.replacePhoto(actor, id, seat.personId, null);
    await this.media.removeQuietly(actor.societyId, [old]);
    return this.get(actor.societyId, id);
  }

  /** Sets the person's photo key; returns the previous one. */
  private async replacePhoto(actor: Actor, seatId: string, personId: string, key: string | null): Promise<string | null> {
    return this.prisma.$transaction(async (tx) => {
      const person = await tx.persons.findUniqueOrThrow({ where: { id: personId }, select: { photo_url: true } });
      await tx.persons.update({ where: { id: personId }, data: { photo_url: key } });
      await this.audit.record(
        { ...auditOf(actor, key ? 'photo_set' : 'photo_remove', seatId), before: { photo: person.photo_url }, after: { photo: key } },
        tx,
      );
      return person.photo_url;
    });
  }
}

function seatData(input: CommitteeSeatUpdateInput) {
  return {
    position: input.position,
    sort_order: input.sortOrder,
    term_start: new Date(`${input.termStart}T00:00:00.000Z`),
    term_end: input.termEnd ? new Date(`${input.termEnd}T00:00:00.000Z`) : null,
  };
}

const auditOf = (actor: Actor, action: string, entityId: string) => ({
  societyId: actor.societyId,
  userId: actor.userId,
  action,
  entityType: 'committee_member',
  entityId,
  ip: actor.ip,
});
