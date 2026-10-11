import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import {
  endsBeforeStart,
  shareHundredths,
  type EndInput,
  type Ownership,
  type OwnershipCreateInput,
  type OwnershipTransferInput,
  type OwnershipUpdateInput,
  type PermissionAction,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate } from '../common/dates.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OccupancyService } from '../property/occupancy.service.js';
import { beyondPermissions, TreeService, type LocationRow } from '../property/tree.service.js';
import { MemberRowsService } from './member-rows.service.js';
import { alreadyEnded, auditOf, dayOf, endBeforeStart, lockLocation, PartiesService, type ResolvedParty } from './parties.service.js';

type Tx = Prisma.TransactionClient;

const notFound = () => new NotFoundException({ code: 'ownership_not_found', message: 'Ownership not found' });
const sharesOver = () => new ConflictException({ code: 'shares_over_100', message: 'Current owners would hold more than 100%' });
const alreadyOwner = () => new ConflictException({ code: 'already_owner', message: 'Already a current owner here' });
const duplicateOwner = () => new BadRequestException({ code: 'duplicate_owner', message: 'The same owner is listed twice' });
const locationInactive = () => new ConflictException({ code: 'location_inactive', message: 'The location is inactive' });

const rowSelect = {
  id: true,
  location_id: true,
  person_id: true,
  organisation_id: true,
  share_percent: true,
  start_date: true,
  end_date: true,
  locations: { select: { path: true } },
} satisfies Prisma.ownershipsSelect;
type Row = Prisma.ownershipsGetPayload<{ select: typeof rowSelect }>;

const snapshot = (row: Omit<Row, 'id' | 'locations'>) => ({
  locationId: row.location_id,
  personId: row.person_id,
  organisationId: row.organisation_id,
  sharePercent: row.share_percent.toString(),
  startDate: isoDate(row.start_date),
  endDate: row.end_date ? isoDate(row.end_date) : null,
});

const sameParty = (row: { person_id: string | null; organisation_id: string | null }, party: ResolvedParty) =>
  (party.personId !== null && row.person_id === party.personId) ||
  (party.organisationId !== null && row.organisation_id === party.organisationId);

/**
 * Owners of plots, buildings and units (`ownerships` permission, checked at the location).
 * Co-owners hold one row each; current shares add up to at most 100%. A transfer ends the
 * current rows and starts new ones, so the history stays. Every change re-derives the
 * occupancy of the units at and below the location.
 */
@Injectable()
export class OwnershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tree: TreeService,
    private readonly occupancy: OccupancyService,
    private readonly parties: PartiesService,
    private readonly rows: MemberRowsService,
  ) {}

  async get(actor: Actor, id: string): Promise<Ownership> {
    await this.row(actor, id, 'view');
    const [ownership] = await this.rows.ownerships(actor.societyId, { id });
    if (!ownership) throw notFound();
    return ownership;
  }

  async create(actor: Actor, input: OwnershipCreateInput): Promise<Ownership> {
    const location = await this.location(actor, input.locationId, 'create');
    if (!location.isActive) throw locationInactive();
    const id = await this.prisma.$transaction(async (tx) => {
      await lockLocation(tx, location.id);
      const party = await this.parties.resolve(tx, actor.societyId, input.owner);
      const current = await this.current(tx, location.id);
      if (current.some((row) => sameParty(row, party))) throw alreadyOwner();
      const held = current.reduce((sum, row) => sum + shareHundredths(row.share_percent.toString()), 0);
      if (held + shareHundredths(input.sharePercent) > 10000) throw sharesOver();

      const row = await tx.ownerships.create({
        data: {
          society_id: actor.societyId,
          location_id: location.id,
          person_id: party.personId,
          organisation_id: party.organisationId,
          share_percent: input.sharePercent,
          start_date: dayOf(input.startDate),
        },
        select: rowSelect,
      });
      await this.occupancy.refresh(actor.societyId, location.path, tx);
      await this.audit.record({ ...auditOf(actor, 'ownership', 'create', row.id), after: { ...snapshot(row), reusedParty: party.reused } }, tx);
      return row.id;
    });
    return this.get(actor, id);
  }

  /** On `date` the current owners stop and the listed owners start. */
  async transfer(actor: Actor, input: OwnershipTransferInput): Promise<Ownership[]> {
    const location = await this.location(actor, input.locationId, 'edit');
    if (!actor.access.can('create', 'ownerships', { path: location.path })) throw beyondPermissions();
    if (!location.isActive) throw locationInactive();
    const date = dayOf(input.date);

    await this.prisma.$transaction(async (tx) => {
      await lockLocation(tx, location.id);
      const current = await this.current(tx, location.id);
      if (current.some((row) => endsBeforeStart(isoDate(row.start_date), input.date))) throw endBeforeStart();

      const resolved: (ResolvedParty & { sharePercent: string })[] = [];
      for (const row of input.owners) {
        const party = await this.parties.resolve(tx, actor.societyId, row.owner);
        if (resolved.some((other) => sameParty({ person_id: other.personId, organisation_id: other.organisationId }, party))) {
          throw duplicateOwner();
        }
        resolved.push({ ...party, sharePercent: row.sharePercent });
      }

      await tx.ownerships.updateMany({ where: { id: { in: current.map((row) => row.id) } }, data: { end_date: date } });
      await tx.ownerships.createMany({
        data: resolved.map((party) => ({
          society_id: actor.societyId,
          location_id: location.id,
          person_id: party.personId,
          organisation_id: party.organisationId,
          share_percent: party.sharePercent,
          start_date: date,
        })),
      });
      await this.occupancy.refresh(actor.societyId, location.path, tx);
      await this.audit.record(
        {
          ...auditOf(actor, 'location', 'ownership_transfer', location.id),
          before: { owners: current.map((row) => snapshot(row)) },
          after: {
            date: input.date,
            owners: resolved.map((party) => ({ personId: party.personId, organisationId: party.organisationId, sharePercent: party.sharePercent })),
          },
        },
        tx,
      );
    });
    return this.rows.ownerships(actor.societyId, { location_id: location.id, end_date: null });
  }

  async update(actor: Actor, id: string, input: OwnershipUpdateInput): Promise<Ownership> {
    const before = await this.row(actor, id, 'edit');
    const startDate = input.startDate ?? isoDate(before.start_date);
    if (endsBeforeStart(startDate, before.end_date ? isoDate(before.end_date) : null)) throw endBeforeStart();

    await this.prisma.$transaction(async (tx) => {
      await lockLocation(tx, before.location_id);
      if (input.sharePercent !== undefined && before.end_date === null) {
        const others = (await this.current(tx, before.location_id)).filter((row) => row.id !== id);
        const held = others.reduce((sum, row) => sum + shareHundredths(row.share_percent.toString()), 0);
        if (held + shareHundredths(input.sharePercent) > 10000) throw sharesOver();
      }
      const after = await tx.ownerships.update({
        where: { id },
        data: { share_percent: input.sharePercent, start_date: dayOf(startDate) },
        select: rowSelect,
      });
      await this.audit.record({ ...auditOf(actor, 'ownership', 'update', id), before: snapshot(before), after: snapshot(after) }, tx);
    });
    return this.get(actor, id);
  }

  /** The owner stops owning on `endDate` (sold, or a record closed without a new owner). */
  async end(actor: Actor, id: string, input: EndInput): Promise<Ownership> {
    const before = await this.row(actor, id, 'edit');
    if (before.end_date !== null) throw alreadyEnded();
    if (endsBeforeStart(isoDate(before.start_date), input.endDate)) throw endBeforeStart();
    await this.prisma.$transaction(async (tx) => {
      const after = await tx.ownerships.update({ where: { id }, data: { end_date: dayOf(input.endDate) }, select: rowSelect });
      await this.occupancy.refresh(actor.societyId, before.locations.path, tx);
      await this.audit.record({ ...auditOf(actor, 'ownership', 'end', id), before: snapshot(before), after: snapshot(after) }, tx);
    });
    return this.get(actor, id);
  }

  /** For rows entered by mistake; a real change of owner is a transfer or an end. */
  async remove(actor: Actor, id: string): Promise<void> {
    const before = await this.row(actor, id, 'delete');
    await this.prisma.$transaction(async (tx) => {
      await tx.ownerships.delete({ where: { id } });
      await this.occupancy.refresh(actor.societyId, before.locations.path, tx);
      await this.audit.record({ ...auditOf(actor, 'ownership', 'delete', id), before: snapshot(before) }, tx);
    });
  }

  /** A location the caller sees on `ownerships` (else 404) and may `action` on there (else 403). */
  private async location(actor: Actor, id: string, action: PermissionAction): Promise<LocationRow> {
    const location = await this.tree.visible(actor.access, actor.societyId, 'ownerships', id);
    if (!actor.access.can(action, 'ownerships', { path: location.path })) throw beyondPermissions();
    return location;
  }

  /** The row, if the caller sees it (else 404) and may `action` on it (else 403). */
  private async row(actor: Actor, id: string, action: PermissionAction): Promise<Row> {
    const row = await this.prisma.ownerships.findFirst({
      where: { id, society_id: actor.societyId, locations: { society_id: actor.societyId } },
      select: rowSelect,
    });
    const located = row ? { path: row.locations.path } : null;
    if (!row || !located || !actor.access.can('view', 'ownerships', located)) throw notFound();
    if (!actor.access.can(action, 'ownerships', located)) throw beyondPermissions();
    return row;
  }

  private current(tx: Tx, locationId: string) {
    return tx.ownerships.findMany({ where: { location_id: locationId, end_date: null }, select: rowSelect });
  }
}
