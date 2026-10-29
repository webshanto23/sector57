import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import { nextMemberNumber, type MemberBulkInput, type MemberBulkResult, type MemberCreated, type MemberCreateInput } from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { firstMemberNo, lockMemberNumbers } from './membership-settings.service.js';
import { auditOf, onlySocietyWide, organisationNotFound, PartiesService, personNotFound } from './parties.service.js';

type Tx = Prisma.TransactionClient;

export const alreadyMember = () => new ConflictException({ code: 'already_member', message: 'This person or organisation is already a member' });

/** Who holds a membership: a person or an organisation, exactly one. */
type Holder = { personId: string | null; organisationId: string | null };
const keyOf = (holder: Holder) => (holder.personId ? `p:${holder.personId}` : `o:${holder.organisationId}`);
const placeNotFound = () => new NotFoundException({ code: 'location_not_found', message: 'Place not found' });

/**
 * Society memberships. A membership gets its member number only once its person or organisation
 * is verified (at once when they already are, else through `issueId` when they are marked as
 * verified); numbers count up per society in that order. The database turns each number into
 * the global membership ID (`memberships_set_code` trigger). An issued ID is never taken back.
 * Adding members directly is for whole-society callers only.
 */
@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly parties: PartiesService,
  ) {}

  /** One member: new details, or someone on file (an owner, a renter), a person or an organisation. */
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
      const holder = await this.holderOf(tx, actor.societyId, input);
      const locationId = input.locationId ?? (await this.homePlaces(tx, actor.societyId, [holder])).get(keyOf(holder)) ?? null;
      const row = await this.insert(tx, actor.societyId, {
        personId: holder.personId,
        organisationId: holder.organisationId,
        locationId,
        joinedOn: input.joinedOn ? new Date(input.joinedOn) : todayDate(),
        submissionId: null,
      });
      await this.recordCreate(tx, actor, holder, row);
      return {
        personId: holder.personId,
        organisationId: holder.organisationId,
        memberNo: row.member_no,
        membershipCode: row.membership_code,
        reusedPerson: holder.reused,
      };
    });
  }

  /** Who the new member is: found or added from the details given, or one on file by id (404 when not in the society). */
  private async holderOf(tx: Tx, societyId: string, input: MemberCreateInput): Promise<Holder & { reused: boolean }> {
    if (input.personId) {
      const found = await tx.persons.findFirst({ where: { id: input.personId, society_id: societyId }, select: { id: true } });
      if (!found) throw personNotFound();
      return { personId: found.id, organisationId: null, reused: true };
    }
    if (input.organisationId) {
      const found = await tx.organisations.findFirst({ where: { id: input.organisationId, society_id: societyId }, select: { id: true } });
      if (!found) throw organisationNotFound();
      return { personId: null, organisationId: found.id, reused: true };
    }
    if (input.organisation) {
      const organisation = await this.parties.resolveOrganisation(tx, societyId, input.organisation);
      return { personId: null, organisationId: organisation.id, reused: organisation.reused };
    }
    const person = await this.parties.resolvePerson(tx, societyId, input.person!);
    return { personId: person.id, organisationId: null, reused: person.reused };
  }

  /**
   * People and organisations on file made members in one go; the verified ones are numbered in the order given (people
   * first), all or none. Those who already are members are skipped. 404 when any id isn't in the society.
   */
  async bulk(actor: Actor, input: MemberBulkInput): Promise<MemberBulkResult> {
    if (actor.access.paths('create', 'members') !== 'all') throw onlySocietyWide();
    const joinedOn = input.joinedOn ? new Date(input.joinedOn) : todayDate();
    return this.prisma.$transaction(async (tx) => {
      const where = { society_id: actor.societyId };
      const [persons, organisations, members] = await Promise.all([
        tx.persons.count({ where: { ...where, id: { in: input.personIds } } }),
        tx.organisations.count({ where: { ...where, id: { in: input.organisationIds } } }),
        tx.memberships.findMany({
          where: { status: 'active', OR: [{ person_id: { in: input.personIds } }, { organisation_id: { in: input.organisationIds } }] },
          select: { person_id: true, organisation_id: true },
        }),
      ]);
      if (persons !== input.personIds.length) throw personNotFound();
      if (organisations !== input.organisationIds.length) throw organisationNotFound();
      const taken = new Set(members.map((m) => keyOf({ personId: m.person_id, organisationId: m.organisation_id })));
      const todo = [
        ...input.personIds.map((id): Holder => ({ personId: id, organisationId: null })),
        ...input.organisationIds.map((id): Holder => ({ personId: null, organisationId: id })),
      ].filter((holder) => !taken.has(keyOf(holder)));
      const places = await this.homePlaces(tx, actor.societyId, todo);
      const created: MemberBulkResult['created'] = [];
      for (const holder of todo) {
        const row = await this.insert(tx, actor.societyId, { ...holder, locationId: places.get(keyOf(holder)) ?? null, joinedOn, submissionId: null });
        await this.recordCreate(tx, actor, holder, row);
        created.push({ ...holder, memberNo: row.member_no, membershipCode: row.membership_code });
      }
      return { created, skipped: taken.size };
    });
  }

  /**
   * A new active membership; it gets the next member number when the person or organisation is
   * verified already, else none yet. 409 `already_member` when they have one.
   */
  async insert(tx: Tx, societyId: string, input: Holder & { locationId: string | null; joinedOn: Date; submissionId: string | null }) {
    const active = await tx.memberships.findFirst({
      where: input.personId ? { person_id: input.personId, status: 'active' } : { organisation_id: input.organisationId, status: 'active' },
      select: { id: true },
    });
    if (active) throw alreadyMember();
    await this.parties.requireIds(tx, societyId, input);
    return tx.memberships.create({
      data: {
        society_id: societyId,
        person_id: input.personId,
        organisation_id: input.organisationId,
        location_id: input.locationId,
        member_no: (await this.isVerified(tx, input)) ? await this.nextMemberNo(tx, societyId) : null,
        joined_on: input.joinedOn,
        submission_id: input.submissionId,
      },
      select: { id: true, member_no: true, membership_code: true, joined_on: true },
    });
  }

  /** Each member's first current place (by `keyOf`): the earliest ownership still running, else the earliest open tenancy. */
  private async homePlaces(tx: Tx, societyId: string, holders: Holder[]): Promise<Map<string, string>> {
    if (holders.length === 0) return new Map();
    const personIds = holders.flatMap((h) => (h.personId ? [h.personId] : []));
    const organisationIds = holders.flatMap((h) => (h.organisationId ? [h.organisationId] : []));
    const [owned, rented] = await Promise.all([
      tx.ownerships.findMany({
        where: { society_id: societyId, end_date: null, OR: [{ person_id: { in: personIds } }, { organisation_id: { in: organisationIds } }] },
        orderBy: [{ start_date: 'asc' }, { id: 'asc' }],
        select: { person_id: true, organisation_id: true, location_id: true },
      }),
      tx.tenancies.findMany({
        where: {
          society_id: societyId,
          status: { in: ['active', 'moving_out'] },
          OR: [{ primary_person_id: { in: personIds } }, { organisation_id: { in: organisationIds } }],
        },
        orderBy: [{ start_date: 'asc' }, { id: 'asc' }],
        select: { primary_person_id: true, organisation_id: true, unit_id: true },
      }),
    ]);
    const places = new Map<string, string>();
    const add = (holder: Holder, place: string) => {
      const key = keyOf(holder);
      if (!places.has(key)) places.set(key, place);
    };
    for (const row of owned) add({ personId: row.person_id, organisationId: row.organisation_id }, row.location_id);
    for (const row of rented) add({ personId: row.primary_person_id, organisationId: row.organisation_id }, row.unit_id);
    return places;
  }

  /**
   * Gives the person's or organisation's active membership its number (and ID) if it has none
   * yet; call it in the transaction that marks them as verified. Returns the ID issued, or null.
   */
  async issueId(tx: Tx, actor: Actor, holder: Holder): Promise<string | null> {
    const pending = await tx.memberships.findFirst({
      where: { society_id: actor.societyId, status: 'active', member_no: null, ...(holder.personId ? { person_id: holder.personId } : { organisation_id: holder.organisationId }) },
      select: { id: true },
    });
    if (!pending) return null;
    const row = await tx.memberships.update({
      where: { id: pending.id },
      data: { member_no: await this.nextMemberNo(tx, actor.societyId) },
      select: { member_no: true, membership_code: true },
    });
    await this.audit.record({ ...auditOf(actor, 'membership', 'issue_id', pending.id), after: { memberNo: row.member_no, membershipCode: row.membership_code } }, tx);
    return row.membership_code;
  }

  private async isVerified(tx: Tx, holder: Holder): Promise<boolean> {
    const where = { id: (holder.personId ?? holder.organisationId)!, verified_at: { not: null } };
    const found = holder.personId ? await tx.persons.findFirst({ where, select: { id: true } }) : await tx.organisations.findFirst({ where, select: { id: true } });
    return found !== null;
  }

  private recordCreate(tx: Tx, actor: Actor, holder: Holder, row: { id: string; member_no: number | null; membership_code: string | null; joined_on: Date }) {
    return this.audit.record(
      {
        ...auditOf(actor, 'membership', 'create', row.id),
        after: {
          personId: holder.personId,
          organisationId: holder.organisationId,
          memberNo: row.member_no,
          membershipCode: row.membership_code,
          joinedOn: isoDate(row.joined_on),
        },
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
