import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import {
  endsBeforeStart,
  OPEN_TENANCY_STATUSES,
  type EndInput,
  type Occupant,
  type OccupantCreateInput,
  type OccupantUpdateInput,
  type PermissionAction,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate } from '../common/dates.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OccupancyService } from '../property/occupancy.service.js';
import { beyondPermissions, pathIds, TreeService } from '../property/tree.service.js';
import { MemberRowsService } from './member-rows.service.js';
import { alreadyEnded, auditOf, dayOf, endBeforeStart, lockLocation, PartiesService } from './parties.service.js';
import { unitFor } from './tenancies.service.js';

const notFound = () => new NotFoundException({ code: 'occupant_not_found', message: 'Household member not found' });
const invalidTenancy = () =>
  new BadRequestException({ code: 'invalid_tenancy', message: 'The tenancy is not an open tenancy of this unit' });
const invalidPerson = () =>
  new BadRequestException({ code: 'invalid_person', message: 'This person is not a current owner or the renter of this unit' });
const alreadyOccupant = () =>
  new ConflictException({ code: 'already_occupant', message: 'This person already lives in this unit' });

const rowSelect = {
  id: true,
  unit_id: true,
  person_id: true,
  tenancy_id: true,
  relation: true,
  start_date: true,
  end_date: true,
  units: { select: { locations: { select: { path: true } } } },
} satisfies Prisma.occupantsSelect;
type Row = Prisma.occupantsGetPayload<{ select: typeof rowSelect }>;

const snapshot = (row: Omit<Row, 'id' | 'units'>) => ({
  unitId: row.unit_id,
  personId: row.person_id,
  tenancyId: row.tenancy_id,
  relation: row.relation,
  startDate: isoDate(row.start_date),
  endDate: row.end_date ? isoDate(row.end_date) : null,
});

/**
 * Residents: who lives in a unit, in the owner's household (`tenancyId` null) or the open
 * tenancy's. Uses the `members` permission at the unit. A resident of the owner's household
 * makes the unit owner-occupied, so every change refreshes its occupancy.
 */
@Injectable()
export class OccupantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tree: TreeService,
    private readonly parties: PartiesService,
    private readonly rows: MemberRowsService,
    private readonly occupancy: OccupancyService,
  ) {}

  async get(actor: Actor, id: string): Promise<Occupant> {
    await this.row(actor, id, 'view');
    const [occupant] = await this.rows.occupants(actor.societyId, { id });
    if (!occupant) throw notFound();
    return occupant;
  }

  async create(actor: Actor, input: OccupantCreateInput): Promise<Occupant> {
    const unit = await unitFor(this.tree, actor, input.unitId, 'members', 'create');
    const id = await this.prisma.$transaction(async (tx) => {
      await lockLocation(tx, unit.id);
      if (input.tenancyId) {
        const tenancy = await tx.tenancies.findFirst({
          where: { id: input.tenancyId, unit_id: unit.id, society_id: actor.societyId, status: { in: [...OPEN_TENANCY_STATUSES] } },
          select: { id: true },
        });
        if (!tenancy) throw invalidTenancy();
      }
      const person = input.personId
        ? await this.onRecordHere(tx, actor.societyId, unit.path, input.tenancyId, input.personId)
        : await this.parties.resolvePerson(tx, actor.societyId, input.person!);
      const living = await tx.occupants.findFirst({ where: { unit_id: unit.id, person_id: person.id, end_date: null }, select: { id: true } });
      if (living) throw alreadyOccupant();
      const row = await tx.occupants.create({
        data: {
          society_id: actor.societyId,
          unit_id: unit.id,
          person_id: person.id,
          tenancy_id: input.tenancyId,
          relation: input.relation,
          start_date: dayOf(input.startDate),
        },
        select: rowSelect,
      });
      await this.audit.record({ ...auditOf(actor, 'occupant', 'create', row.id), after: { ...snapshot(row), reusedPerson: person.reused } }, tx);
      await this.occupancy.refresh(actor.societyId, unit.path, tx);
      return row.id;
    });
    return this.get(actor, id);
  }

  async update(actor: Actor, id: string, input: OccupantUpdateInput): Promise<Occupant> {
    const before = await this.row(actor, id, 'edit');
    const startDate = input.startDate ?? isoDate(before.start_date);
    if (endsBeforeStart(startDate, before.end_date ? isoDate(before.end_date) : null)) throw endBeforeStart();
    await this.prisma.$transaction(async (tx) => {
      const after = await tx.occupants.update({
        where: { id },
        data: { relation: input.relation, start_date: dayOf(startDate) },
        select: rowSelect,
      });
      await this.audit.record({ ...auditOf(actor, 'occupant', 'update', id), before: snapshot(before), after: snapshot(after) }, tx);
    });
    return this.get(actor, id);
  }

  /** The person moves out on `endDate`. */
  async end(actor: Actor, id: string, input: EndInput): Promise<Occupant> {
    const before = await this.row(actor, id, 'edit');
    if (before.end_date !== null) throw alreadyEnded();
    if (endsBeforeStart(isoDate(before.start_date), input.endDate)) throw endBeforeStart();
    await this.prisma.$transaction(async (tx) => {
      const after = await tx.occupants.update({ where: { id }, data: { end_date: dayOf(input.endDate) }, select: rowSelect });
      await this.audit.record({ ...auditOf(actor, 'occupant', 'end', id), before: snapshot(before), after: snapshot(after) }, tx);
      await this.occupancy.refresh(actor.societyId, before.units.locations.path, tx);
    });
    return this.get(actor, id);
  }

  /** For rows entered by mistake. The person stays. */
  async remove(actor: Actor, id: string): Promise<void> {
    const before = await this.row(actor, id, 'delete');
    await this.prisma.$transaction(async (tx) => {
      await tx.occupants.delete({ where: { id } });
      await this.audit.record({ ...auditOf(actor, 'occupant', 'delete', id), before: snapshot(before) }, tx);
      await this.occupancy.refresh(actor.societyId, before.units.locations.path, tx);
    });
  }

  /**
   * Someone picked by id must already be on record at this unit: the tenancy's renter for a
   * renter's household, or a current owner of the unit or a place above it for the owner's.
   * So an id never reaches a person outside what the caller already sees here.
   */
  private async onRecordHere(
    tx: Prisma.TransactionClient,
    societyId: string,
    unitPath: string,
    tenancyId: string | null,
    personId: string,
  ): Promise<{ id: string; reused: boolean }> {
    const found = tenancyId
      ? await tx.tenancies.findFirst({ where: { id: tenancyId, society_id: societyId, primary_person_id: personId }, select: { id: true } })
      : await tx.ownerships.findFirst({
          where: { society_id: societyId, person_id: personId, end_date: null, location_id: { in: pathIds(unitPath) } },
          select: { id: true },
        });
    if (!found) throw invalidPerson();
    return { id: personId, reused: true };
  }

  private async row(actor: Actor, id: string, action: PermissionAction): Promise<Row> {
    const row = await this.prisma.occupants.findFirst({
      where: { id, society_id: actor.societyId, units: { society_id: actor.societyId } },
      select: rowSelect,
    });
    const located = row ? { path: row.units.locations.path } : null;
    if (!row || !located || !actor.access.can('view', 'members', located)) throw notFound();
    if (!actor.access.can(action, 'members', located)) throw beyondPermissions();
    return row;
  }
}
