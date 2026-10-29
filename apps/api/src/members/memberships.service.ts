import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import { nextMemberNumber, type MemberBulkInput, type MemberBulkResult, type MemberCreated, type MemberCreateInput } from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { firstMemberNo, lockMemberNumbers } from './membership-settings.service.js';
import { auditOf, onlySocietyWide, PartiesService, personNotFound } from './parties.service.js';

type Tx = Prisma.TransactionClient;

export const alreadyMember = () => new ConflictException({ code: 'already_member', message: 'This person is already a member' });
const placeNotFound = () => new NotFoundException({ code: 'location_not_found', message: 'Place not found' });

/**
 * Society memberships. Member numbers count up per society; the database turns each into the
 * global membership ID (`memberships_set_code` trigger), so every path that adds a member gets one.
 * Adding members directly is for whole-society callers only.
 */
@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly parties: PartiesService,
  ) {}

  /** One member: new details, or someone on file (an owner, a renter). */
  async create(actor: Actor, input: MemberCreateInput): Promise<MemberCreated> {
    if (actor.access.paths('create', 'members') !== 'all') throw onlySocietyWide();
    return this.prisma.$transaction(async (tx) => {
      if (input.locationId) {
        const place = await tx.locations.findFirst({
          where: { id: input.locationId, society_id: actor.societyId, is_active: true },
          select: { id: true },
        });
        if (!place) throw placeNotFound();
      }
      let person: { id: string; reused: boolean };
      if (input.personId) {
        const found = await tx.persons.findFirst({ where: { id: input.personId, society_id: actor.societyId }, select: { id: true } });
        if (!found) throw personNotFound();
        person = { id: found.id, reused: true };
      } else {
        person = await this.parties.resolvePerson(tx, actor.societyId, input.person!);
      }
      const locationId = input.locationId ?? (await this.homePlaces(tx, actor.societyId, [person.id])).get(person.id) ?? null;
      const row = await this.insert(tx, actor.societyId, {
        personId: person.id,
        locationId,
        joinedOn: input.joinedOn ? new Date(input.joinedOn) : todayDate(),
        submissionId: null,
      });
      await this.recordCreate(tx, actor, person.id, row);
      return { personId: person.id, memberNo: row.member_no, membershipCode: row.membership_code, reusedPerson: person.reused };
    });
  }

  /**
   * People on file made members in one go, numbered in the order given, all or none. Those who
   * already are members are skipped. 404 when any id isn't a person of the society.
   */
  async bulk(actor: Actor, input: MemberBulkInput): Promise<MemberBulkResult> {
    if (actor.access.paths('create', 'members') !== 'all') throw onlySocietyWide();
    const joinedOn = input.joinedOn ? new Date(input.joinedOn) : todayDate();
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.persons.findMany({ where: { id: { in: input.personIds }, society_id: actor.societyId }, select: { id: true } });
      if (found.length !== input.personIds.length) throw personNotFound();
      const members = await tx.memberships.findMany({
        where: { person_id: { in: input.personIds }, status: 'active' },
        select: { person_id: true },
      });
      const taken = new Set(members.map((m) => m.person_id));
      const todo = input.personIds.filter((id) => !taken.has(id));
      const places = await this.homePlaces(tx, actor.societyId, todo);
      const created: MemberBulkResult['created'] = [];
      for (const personId of todo) {
        const row = await this.insert(tx, actor.societyId, { personId, locationId: places.get(personId) ?? null, joinedOn, submissionId: null });
        await this.recordCreate(tx, actor, personId, row);
        created.push({ personId, memberNo: row.member_no, membershipCode: row.membership_code });
      }
      return { created, skipped: taken.size };
    });
  }

  /** A new active membership with the next member number. 409 `already_member` when the person has one. */
  async insert(
    tx: Tx,
    societyId: string,
    input: { personId: string; locationId: string | null; joinedOn: Date; submissionId: string | null },
  ) {
    const active = await tx.memberships.findFirst({ where: { person_id: input.personId, status: 'active' }, select: { id: true } });
    if (active) throw alreadyMember();
    await this.parties.requireIds(tx, societyId, { personId: input.personId, organisationId: null });
    return tx.memberships.create({
      data: {
        society_id: societyId,
        person_id: input.personId,
        location_id: input.locationId,
        member_no: await this.nextMemberNo(tx, societyId),
        joined_on: input.joinedOn,
        submission_id: input.submissionId,
      },
      select: { id: true, member_no: true, membership_code: true, joined_on: true },
    });
  }

  /** Each person's first current place: the earliest ownership still running, else the earliest open tenancy. */
  private async homePlaces(tx: Tx, societyId: string, personIds: string[]): Promise<Map<string, string>> {
    if (personIds.length === 0) return new Map();
    const [owned, rented] = await Promise.all([
      tx.ownerships.findMany({
        where: { society_id: societyId, person_id: { in: personIds }, end_date: null },
        orderBy: [{ start_date: 'asc' }, { id: 'asc' }],
        select: { person_id: true, location_id: true },
      }),
      tx.tenancies.findMany({
        where: { society_id: societyId, primary_person_id: { in: personIds }, status: { in: ['active', 'moving_out'] } },
        orderBy: [{ start_date: 'asc' }, { id: 'asc' }],
        select: { primary_person_id: true, unit_id: true },
      }),
    ]);
    const places = new Map<string, string>();
    for (const row of owned) if (row.person_id && !places.has(row.person_id)) places.set(row.person_id, row.location_id);
    for (const row of rented) if (row.primary_person_id && !places.has(row.primary_person_id)) places.set(row.primary_person_id, row.unit_id);
    return places;
  }

  private recordCreate(tx: Tx, actor: Actor, personId: string, row: { id: string; member_no: number; membership_code: string; joined_on: Date }) {
    return this.audit.record(
      {
        ...auditOf(actor, 'membership', 'create', row.id),
        after: { personId, memberNo: row.member_no, membershipCode: row.membership_code, joinedOn: isoDate(row.joined_on) },
      },
      tx,
    );
  }

  /** The next member number (the starter, or one past the highest); one at a time per society (transaction lock). */
  private async nextMemberNo(tx: Tx, societyId: string): Promise<number> {
    await lockMemberNumbers(tx, societyId);
    const [start, { _max }] = await Promise.all([
      firstMemberNo(tx, societyId),
      tx.memberships.aggregate({ where: { society_id: societyId }, _max: { member_no: true } }),
    ]);
    return nextMemberNumber(start, _max.member_no);
  }
}
