import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import { toGender, type PermissionAction, type PersonDetail, type PersonInput, type PersonUpdateInput } from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate } from '../common/dates.js';
import { mediaUrl } from '../common/media.js';
import { isForeignKeyViolation, isUniqueViolation } from '../common/prisma-errors.js';
import { ENV, type Env } from '../config/env.js';
import { scopeWhere } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beyondPermissions } from '../property/tree.service.js';
import { MediaService } from '../storage/media.service.js';
import { MemberRowsService } from './member-rows.service.js';
import { MembershipsService } from './memberships.service.js';
import {
  auditOf,
  canOnParty,
  nidRequired,
  nidTaken,
  onlySocietyWide,
  PartiesService,
  personData,
  personNotFound,
  phoneTaken,
} from './parties.service.js';

const inUse = () =>
  new ConflictException({ code: 'person_in_use', message: 'This person is still linked to units, the committee, a login or bills' });

const select = {
  id: true,
  full_name: true,
  full_name_en: true,
  phone: true,
  email: true,
  nid: true,
  date_of_birth: true,
  gender: true,
  photo_url: true,
  verified_at: true,
  created_at: true,
} satisfies Prisma.personsSelect;
type Row = Prisma.personsGetPayload<{ select: typeof select }>;

/** What an audit row keeps of a person. The NID itself never goes into the log, only whether it changed. */
const snapshot = (row: Row) => ({
  fullName: row.full_name,
  fullNameEn: row.full_name_en,
  phone: row.phone,
  email: row.email,
  hasNid: row.nid !== null,
  dateOfBirth: row.date_of_birth ? isoDate(row.date_of_birth) : null,
  gender: row.gender,
});

/**
 * People (`members` permission). A person is in a scoped caller's area while they own, rent or
 * live somewhere inside it; whole-society callers see everyone. The national ID is only sent to
 * callers who may edit the person.
 */
@Injectable()
export class PersonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly parties: PartiesService,
    private readonly rows: MemberRowsService,
    private readonly memberships: MembershipsService,
    private readonly media: MediaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async get(actor: Actor, id: string): Promise<PersonDetail> {
    const { row, paths } = await this.visible(actor, id);
    const can = (action: PermissionAction) => canOnParty(actor.access, action, paths);
    const at = (module: 'ownerships' | 'tenancies' | 'members') =>
      scopeWhere(actor.access, 'view', module, (prefix) => ({ path: { startsWith: prefix } }));
    const [ownerships, tenancies, households, membership] = await Promise.all([
      this.rows.ownerships(actor.societyId, { person_id: id, locations: at('ownerships') }),
      this.rows.tenancies(actor.societyId, { primary_person_id: id, units: { locations: at('tenancies') } }),
      this.rows.occupants(actor.societyId, { person_id: id, units: { locations: at('members') } }),
      this.rows.membership(actor.societyId, { person_id: id }),
    ]);
    const mayEdit = can('edit');
    return {
      id: row.id,
      fullName: row.full_name,
      fullNameEn: row.full_name_en,
      phone: row.phone,
      email: row.email,
      nid: mayEdit ? row.nid : null,
      hasNid: row.nid !== null,
      dateOfBirth: row.date_of_birth ? isoDate(row.date_of_birth) : null,
      gender: toGender(row.gender),
      photoUrl: mediaUrl(row.photo_url, this.env.MEDIA_BASE_URL),
      verifiedAt: row.verified_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      ownerships,
      tenancies,
      households,
      membership,
      can: { edit: mayEdit, verify: can('approve'), delete: can('delete') },
    };
  }

  /**
   * A person not yet linked to any unit. Only whole-society callers: a scoped caller adds people
   * from a unit, where they come into the caller's area.
   */
  async create(actor: Actor, input: PersonInput): Promise<PersonDetail> {
    if (actor.access.paths('create', 'members') !== 'all') throw onlySocietyWide();
    await this.checkUnique(actor.societyId, input);
    let row: Row;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.persons.create({ data: { society_id: actor.societyId, ...personData(input) }, select });
        await this.audit.record({ ...auditOf(actor, 'person', 'create', created.id), after: snapshot(created) }, tx);
        return created;
      });
    } catch (error) {
      throw isUniqueViolation(error) ? phoneTaken() : error;
    }
    return this.get(actor, row.id);
  }

  async update(actor: Actor, id: string, input: PersonUpdateInput): Promise<PersonDetail> {
    const { row: before } = await this.allowed(actor, id, 'edit');
    await this.checkUnique(actor.societyId, input, id);
    // An owner, renter or member keeps their NID while the society requires it.
    if (
      before.nid &&
      !input.nid &&
      (await this.parties.idsRequired(this.prisma, actor.societyId)) &&
      (await this.parties.holdsRole(actor.societyId, { personId: id }))
    ) {
      throw nidRequired();
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        const after = await tx.persons.update({ where: { id }, data: personData(input), select });
        await this.audit.record(
          { ...auditOf(actor, 'person', 'update', id), before: snapshot(before), after: { ...snapshot(after), nidChanged: before.nid !== after.nid } },
          tx,
        );
      });
    } catch (error) {
      throw isUniqueViolation(error) ? phoneTaken() : error;
    }
    return this.get(actor, id);
  }

  /**
   * Marks the details as checked against the person's papers (`members.approve`), or clears the
   * mark. Marking issues the membership ID of a member still waiting for one; clearing keeps it.
   */
  async setVerified(actor: Actor, id: string, verified: boolean): Promise<PersonDetail> {
    const { row } = await this.allowed(actor, id, 'approve');
    const verifiedAt = verified ? (row.verified_at ?? new Date()) : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.persons.update({ where: { id }, data: { verified_at: verifiedAt } });
      await this.audit.record(
        { ...auditOf(actor, 'person', verified ? 'verify' : 'unverify', id), before: { verified: row.verified_at !== null }, after: { verified } },
        tx,
      );
      if (verified) await this.memberships.issueId(tx, actor, { personId: id, organisationId: null });
    });
    return this.get(actor, id);
  }

  /** Only a person nothing refers to; their photo goes with them. */
  async remove(actor: Actor, id: string): Promise<void> {
    const { row } = await this.allowed(actor, id, 'delete');
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.persons.delete({ where: { id } });
        await this.audit.record({ ...auditOf(actor, 'person', 'delete', id), before: snapshot(row) }, tx);
      });
    } catch (error) {
      throw isForeignKeyViolation(error) ? inUse() : error;
    }
    await this.media.removeQuietly(actor.societyId, [row.photo_url]);
  }

  async setPhoto(actor: Actor, id: string, upload: Buffer): Promise<PersonDetail> {
    await this.allowed(actor, id, 'edit');
    const key = await this.media.saveImage(actor.societyId, 'people', upload);
    let old: string | null;
    try {
      old = await this.replacePhoto(actor, id, key);
    } catch (error) {
      await this.media.removeQuietly(actor.societyId, [key]);
      throw error;
    }
    await this.media.removeQuietly(actor.societyId, [old]);
    return this.get(actor, id);
  }

  async removePhoto(actor: Actor, id: string): Promise<PersonDetail> {
    await this.allowed(actor, id, 'edit');
    const old = await this.replacePhoto(actor, id, null);
    await this.media.removeQuietly(actor.societyId, [old]);
    return this.get(actor, id);
  }

  private replacePhoto(actor: Actor, id: string, key: string | null): Promise<string | null> {
    return this.prisma.$transaction(async (tx) => {
      const person = await tx.persons.findUniqueOrThrow({ where: { id }, select: { photo_url: true } });
      await tx.persons.update({ where: { id }, data: { photo_url: key } });
      await this.audit.record(
        { ...auditOf(actor, 'person', key ? 'photo_set' : 'photo_remove', id), before: { photo: person.photo_url }, after: { photo: key } },
        tx,
      );
      return person.photo_url;
    });
  }

  /** The person if the caller sees them (else 404), with the places they are linked to now. */
  private async visible(actor: Actor, id: string): Promise<{ row: Row; paths: string[] }> {
    const row = await this.prisma.persons.findFirst({ where: { id, society_id: actor.societyId }, select });
    if (!row) throw personNotFound();
    const paths = await this.parties.currentPaths(actor.societyId, { personId: id });
    if (!canOnParty(actor.access, 'view', paths)) throw personNotFound();
    return { row, paths };
  }

  private async allowed(actor: Actor, id: string, action: PermissionAction) {
    const found = await this.visible(actor, id);
    if (!canOnParty(actor.access, action, found.paths)) throw beyondPermissions();
    return found;
  }

  /** Phone and NID are unique per society: 409 instead of quietly reusing someone on a direct add or edit. */
  private async checkUnique(societyId: string, input: PersonInput, exceptId?: string): Promise<void> {
    const other = exceptId ? { NOT: { id: exceptId } } : {};
    const [phone, nid] = await Promise.all([
      input.phone ? this.prisma.persons.findFirst({ where: { society_id: societyId, phone: input.phone, ...other }, select: { id: true } }) : null,
      input.nid ? this.prisma.persons.findFirst({ where: { society_id: societyId, nid: input.nid, ...other }, select: { id: true } }) : null,
    ]);
    if (phone) throw phoneTaken();
    if (nid) throw nidTaken();
  }
}
