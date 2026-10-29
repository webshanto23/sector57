import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import { SETTING_KEYS, type OrganisationInput, type PartyInput, type PermissionAction, type PersonInput } from '@s57/shared';
import { isUniqueViolation } from '../common/prisma-errors.js';
import type { CallerAccess } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Tx = Prisma.TransactionClient;

export const personNotFound = () => new NotFoundException({ code: 'person_not_found', message: 'Person not found' });
export const organisationNotFound = () =>
  new NotFoundException({ code: 'organisation_not_found', message: 'Organisation not found' });
export const personConflict = () =>
  new ConflictException({
    code: 'person_conflict',
    message: 'The phone and the national ID belong to two different people',
  });
export const phoneTaken = () => new ConflictException({ code: 'person_phone_taken', message: 'Another person has this phone number' });
export const nidTaken = () => new ConflictException({ code: 'person_nid_taken', message: 'Another person has this national ID' });
export const nidRequired = () => new BadRequestException({ code: 'nid_required', message: 'An owner, renter or member needs a national ID on file' });
export const tradeLicenceRequired = () =>
  new BadRequestException({ code: 'trade_licence_required', message: 'An organisation that owns or rents needs a trade licence on file' });
export const onlySocietyWide = () =>
  new ForbiddenException({ code: 'beyond_your_permissions', message: 'Only a society-wide role may do this' });

/** Who a row points at once a typed party is found or added. */
export type ResolvedParty = { personId: string | null; organisationId: string | null; reused: boolean };

export const dayOf = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** The columns a person form writes. */
export const personData = (input: PersonInput) => ({
  full_name: input.fullName,
  full_name_en: input.fullNameEn,
  phone: input.phone,
  email: input.email,
  nid: input.nid,
  date_of_birth: input.dateOfBirth ? dayOf(input.dateOfBirth) : null,
  gender: input.gender,
});

/**
 * Finds or adds the people and organisations that rows point at, and works out who may see
 * them. People carry no location: a person is in a caller's area while they own, rent or live
 * somewhere inside it (current rows only). Whole-society callers see everyone.
 */
@Injectable()
export class PartiesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The society's person with this phone, or else this NID; otherwise a new person. A reused
   * person keeps their stored details, except that a typed NID fills one they don't have yet.
   * A phone and NID of two different people is a conflict.
   */
  async resolvePerson(tx: Tx, societyId: string, input: PersonInput): Promise<{ id: string; reused: boolean }> {
    const [byPhone, byNid] = await Promise.all([
      input.phone
        ? tx.persons.findUnique({ where: { society_id_phone: { society_id: societyId, phone: input.phone } }, select: { id: true, nid: true } })
        : null,
      input.nid ? tx.persons.findUnique({ where: { society_id_nid: { society_id: societyId, nid: input.nid } }, select: { id: true, nid: true } }) : null,
    ]);
    if (byPhone && byNid && byPhone.id !== byNid.id) throw personConflict();
    const existing = byPhone ?? byNid;
    if (existing) {
      // Found by phone with no NID yet: no one else has the typed NID (that would be a conflict above).
      if (input.nid && existing.nid === null) await tx.persons.update({ where: { id: existing.id }, data: { nid: input.nid } });
      return { id: existing.id, reused: true };
    }
    try {
      const created = await tx.persons.create({ data: { society_id: societyId, ...personData(input) }, select: { id: true } });
      return { id: created.id, reused: false };
    } catch (error) {
      // Someone added the same phone or NID a moment ago.
      throw isUniqueViolation(error) ? personConflict() : error;
    }
  }

  /**
   * The society's organisation with this trade licence, or else this exact name (any case);
   * otherwise a new one. A typed licence fills one the found organisation doesn't have yet.
   */
  async resolveOrganisation(tx: Tx, societyId: string, input: OrganisationInput): Promise<{ id: string; reused: boolean }> {
    const existing =
      (input.tradeLicence
        ? await tx.organisations.findFirst({ where: { society_id: societyId, trade_licence: input.tradeLicence }, select: { id: true, trade_licence: true } })
        : null) ??
      (await tx.organisations.findFirst({
        where: { society_id: societyId, name: { equals: input.name, mode: 'insensitive' } },
        select: { id: true, trade_licence: true },
        orderBy: { created_at: 'asc' },
      }));
    if (existing) {
      if (input.tradeLicence && !existing.trade_licence) {
        await tx.organisations.update({ where: { id: existing.id }, data: { trade_licence: input.tradeLicence } });
      }
      return { id: existing.id, reused: true };
    }
    const contact = input.contact ? await this.resolvePerson(tx, societyId, input.contact) : null;
    const created = await tx.organisations.create({
      data: { society_id: societyId, name: input.name, trade_licence: input.tradeLicence, contact_person_id: contact?.id ?? null },
      select: { id: true },
    });
    return { id: created.id, reused: false };
  }

  async resolve(tx: Tx, societyId: string, party: PartyInput): Promise<ResolvedParty> {
    if (party.kind === 'existing') {
      const { kind, id } = party.party;
      const where = { id, society_id: societyId };
      if (kind === 'person') {
        if (!(await tx.persons.findFirst({ where, select: { id: true } }))) throw personNotFound();
        return { personId: id, organisationId: null, reused: true };
      }
      if (!(await tx.organisations.findFirst({ where, select: { id: true } }))) throw organisationNotFound();
      return { personId: null, organisationId: id, reused: true };
    }
    if (party.kind === 'person') {
      const person = await this.resolvePerson(tx, societyId, party.person);
      return { personId: person.id, organisationId: null, reused: person.reused };
    }
    const organisation = await this.resolveOrganisation(tx, societyId, party.organisation);
    return { personId: null, organisationId: organisation.id, reused: organisation.reused };
  }

  /** Does the society require an NID (person) or trade licence (organisation) of owners, renters and members? */
  async idsRequired(client: Pick<Tx, 'society_settings'>, societyId: string): Promise<boolean> {
    const row = await client.society_settings.findUnique({
      where: { society_id_key: { society_id: societyId, key: SETTING_KEYS.requireIdNumbers } },
      select: { value: true },
    });
    return row?.value === true;
  }

  /**
   * When the society requires them: 400 `nid_required` unless the person has an NID on file,
   * `trade_licence_required` unless the organisation has a trade licence. Checks the stored
   * record, so a typed, reused or picked owner, renter or member is held to the same rule.
   */
  async requireIds(tx: Tx, societyId: string, party: { personId: string | null; organisationId: string | null }): Promise<void> {
    if (!(await this.idsRequired(tx, societyId))) return;
    if (party.personId) {
      const person = await tx.persons.findUnique({ where: { id: party.personId }, select: { nid: true } });
      if (!person?.nid) throw nidRequired();
    }
    if (party.organisationId) {
      const organisation = await tx.organisations.findUnique({ where: { id: party.organisationId }, select: { trade_licence: true } });
      if (!organisation?.trade_licence) throw tradeLicenceRequired();
    }
  }

  /** Is the person or organisation an owner or renter now, or an active member? */
  async holdsRole(societyId: string, party: { personId?: string; organisationId?: string }): Promise<boolean> {
    const person = party.personId ?? null;
    const organisation = party.organisationId ?? null;
    const [row] = await this.prisma.$queryRaw<{ held: boolean }[]>`
      select exists (select 1 from ownerships o where o.society_id = ${societyId}::uuid and o.end_date is null
          and (o.person_id = ${person}::uuid or o.organisation_id = ${organisation}::uuid))
        or exists (select 1 from tenancies t where t.society_id = ${societyId}::uuid and t.status <> 'ended'
          and (t.primary_person_id = ${person}::uuid or t.organisation_id = ${organisation}::uuid))
        or exists (select 1 from memberships m where m.society_id = ${societyId}::uuid and m.status = 'active'
          and (m.person_id = ${person}::uuid or m.organisation_id = ${organisation}::uuid)) as held`;
    return row?.held === true;
  }

  /** `locations.path` of every place a person or organisation owns, rents or lives in now. */
  async currentPaths(societyId: string, party: { personId?: string; organisationId?: string }): Promise<string[]> {
    const person = party.personId ?? null;
    const organisation = party.organisationId ?? null;
    const rows = await this.prisma.$queryRaw<{ path: string }[]>`
      select l.path from ownerships o join locations l on l.id = o.location_id
        where o.society_id = ${societyId}::uuid and o.end_date is null
          and (o.person_id = ${person}::uuid or o.organisation_id = ${organisation}::uuid)
      union
      select l.path from tenancies t join locations l on l.id = t.unit_id
        where t.society_id = ${societyId}::uuid and t.status <> 'ended'
          and (t.primary_person_id = ${person}::uuid or t.organisation_id = ${organisation}::uuid)
      union
      select l.path from occupants oc join locations l on l.id = oc.unit_id
        where oc.society_id = ${societyId}::uuid and oc.end_date is null and oc.person_id = ${person}::uuid`;
    return rows.map((row) => row.path);
  }
}

/** May the caller `action` on a person or organisation linked to these places (`members` permission)? */
export function canOnParty(access: CallerAccess, action: PermissionAction, paths: readonly string[]): boolean {
  return access.paths(action, 'members') === 'all' || paths.some((path) => access.can(action, 'members', { path }));
}

/** An audit row written by the members services (they record their own, with before and after). */
export const auditOf = (actor: Actor, entityType: string, action: string, entityId: string | null) => ({
  societyId: actor.societyId,
  userId: actor.userId,
  action,
  entityType,
  entityId,
  ip: actor.ip,
});

export const endBeforeStart = () =>
  new BadRequestException({ code: 'end_before_start', message: 'The end date is before the start date' });
export const alreadyEnded = () => new ConflictException({ code: 'already_ended', message: 'This has already ended' });

/** Locks a location row until the transaction ends, so changes to what hangs on it run one at a time. */
export async function lockLocation(tx: Tx, id: string): Promise<void> {
  await tx.$queryRaw`select id from locations where id = ${id}::uuid for update`;
}
