import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import {
  endsBeforeStart,
  OPEN_TENANCY_STATUSES,
  type EndInput,
  type PermissionAction,
  type PermissionModule,
  type Tenancy,
  type TenancyCreateInput,
  type TenancyUpdateInput,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate } from '../common/dates.js';
import { isForeignKeyViolation, isUniqueViolation } from '../common/prisma-errors.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OccupancyService } from '../property/occupancy.service.js';
import { beyondPermissions, TreeService, type LocationRow } from '../property/tree.service.js';
import { MemberRowsService } from './member-rows.service.js';
import { alreadyEnded, auditOf, dayOf, endBeforeStart, lockLocation, PartiesService } from './parties.service.js';

const notFound = () => new NotFoundException({ code: 'tenancy_not_found', message: 'Tenancy not found' });
const openExists = () => new ConflictException({ code: 'tenancy_open_exists', message: 'The unit already has an open tenancy' });
const hasOccupants = () =>
  new ConflictException({ code: 'tenancy_has_occupants', message: 'Remove the household members of this tenancy first' });
export const notAUnit = () => new BadRequestException({ code: 'not_a_unit', message: 'People can only rent or live in a unit' });
const moveOpen = () =>
  new ConflictException({ code: 'move_open', message: 'Finish or cancel the move under way to change the status' });
const inactiveUnit = () => new ConflictException({ code: 'location_inactive', message: 'The unit is inactive' });

const OPEN = [...OPEN_TENANCY_STATUSES];

/** The tenancy's own columns: what reads and writes inside a transaction select (no nested relations there). */
export const tenancyFlatSelect = {
  id: true,
  unit_id: true,
  renter_type: true,
  primary_person_id: true,
  organisation_id: true,
  status: true,
  start_date: true,
  end_date: true,
  monthly_rent: true,
  police_form_submitted: true,
} satisfies Prisma.tenanciesSelect;
export const tenancyRowSelect = {
  ...tenancyFlatSelect,
  units: { select: { locations: { select: { path: true } } } },
} satisfies Prisma.tenanciesSelect;
export type TenancyRow = Prisma.tenanciesGetPayload<{ select: typeof tenancyRowSelect }>;

export const tenancySnapshot = (row: Prisma.tenanciesGetPayload<{ select: typeof tenancyFlatSelect }>) => ({
  unitId: row.unit_id,
  renterType: row.renter_type,
  personId: row.primary_person_id,
  organisationId: row.organisation_id,
  status: row.status,
  startDate: isoDate(row.start_date),
  endDate: row.end_date ? isoDate(row.end_date) : null,
  monthlyRent: row.monthly_rent?.toString() ?? null,
  policeFormSubmitted: row.police_form_submitted,
});

/**
 * A unit the caller sees on `module` (else 404) and may `action` on (else 403); it must be a unit.
 * Shared by tenancies and household rows.
 */
export async function unitFor(tree: TreeService, actor: Actor, id: string, module: PermissionModule, action: PermissionAction): Promise<LocationRow> {
  const unit = await tree.visible(actor.access, actor.societyId, module, id);
  if (!unit.isUnit) throw notAUnit();
  if (!actor.access.can(action, module, { path: unit.path })) throw beyondPermissions();
  return unit;
}

/**
 * Renting households, messes and companies (`tenancies` permission, checked at the unit).
 * A unit has at most one open tenancy. A renter who is a person is added as a resident (head of
 * the renter's household); ending a tenancy ends its residents too.
 * Every change re-derives the unit's occupancy.
 */
@Injectable()
export class TenanciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tree: TreeService,
    private readonly occupancy: OccupancyService,
    private readonly parties: PartiesService,
    private readonly rows: MemberRowsService,
  ) {}

  async get(actor: Actor, id: string): Promise<Tenancy> {
    await this.row(actor, id, 'view');
    const [tenancy] = await this.rows.tenancies(actor.societyId, { id });
    if (!tenancy) throw notFound();
    return tenancy;
  }

  async create(actor: Actor, input: TenancyCreateInput): Promise<Tenancy> {
    const unit = await unitFor(this.tree, actor, input.unitId, 'tenancies', 'create');
    if (!unit.isActive) throw inactiveUnit();
    let id: string;
    try {
      id = await this.prisma.$transaction((tx) => this.insert(tx, actor, unit, input));
    } catch (error) {
      throw isUniqueViolation(error) ? openExists() : error;
    }
    return this.get(actor, id);
  }

  /**
   * Opens the tenancy inside the caller's transaction, after the unit checks (`unitFor`, active).
   * Also used when the office approves a renter registration.
   */
  async insert(tx: Prisma.TransactionClient, actor: Actor, unit: LocationRow, input: TenancyCreateInput): Promise<string> {
    await lockLocation(tx, unit.id);
    const open = await tx.tenancies.findFirst({ where: { unit_id: unit.id, status: { in: OPEN } }, select: { id: true } });
    if (open) throw openExists();
    const party = await this.parties.resolve(tx, actor.societyId, input.renter);
    const row = await tx.tenancies.create({
      data: {
        society_id: actor.societyId,
        unit_id: unit.id,
        renter_type: input.renterType,
        primary_person_id: party.personId,
        organisation_id: party.organisationId,
        status: input.status,
        start_date: dayOf(input.startDate),
        monthly_rent: input.monthlyRent,
        police_form_submitted: input.policeFormSubmitted,
      },
      select: tenancyRowSelect,
    });
    // A renter who is a person lives here: they become the head of the renter's household.
    let residentAdded = false;
    if (party.personId) {
      const living = await tx.occupants.findFirst({
        where: { unit_id: unit.id, person_id: party.personId, end_date: null },
        select: { id: true },
      });
      if (!living) {
        await tx.occupants.create({
          data: {
            society_id: actor.societyId,
            unit_id: unit.id,
            person_id: party.personId,
            tenancy_id: row.id,
            relation: 'head',
            start_date: row.start_date,
          },
        });
        residentAdded = true;
      }
    }
    await this.occupancy.refresh(actor.societyId, unit.path, tx);
    await this.audit.record(
      { ...auditOf(actor, 'tenancy', 'create', row.id), after: { ...tenancySnapshot(row), reusedParty: party.reused, residentAdded } },
      tx,
    );
    return row.id;
  }

  async update(actor: Actor, id: string, input: TenancyUpdateInput): Promise<Tenancy> {
    const before = await this.row(actor, id, 'edit');
    if (before.status === 'ended') throw alreadyEnded();
    await this.prisma.$transaction(async (tx) => {
      // While a move is under way, it decides the status (complete or cancel it instead).
      if (input.status !== undefined && input.status !== before.status) {
        const move = await tx.move_events.findFirst({ where: { tenancy_id: id, status: 'open' }, select: { id: true } });
        if (move) throw moveOpen();
      }
      const after = await tx.tenancies.update({
        where: { id },
        data: {
          renter_type: input.renterType,
          status: input.status,
          start_date: input.startDate ? dayOf(input.startDate) : undefined,
          monthly_rent: input.monthlyRent,
          police_form_submitted: input.policeFormSubmitted,
        },
        select: tenancyRowSelect,
      });
      await this.occupancy.refresh(actor.societyId, before.units.locations.path, tx);
      await this.audit.record({ ...auditOf(actor, 'tenancy', 'update', id), before: tenancySnapshot(before), after: tenancySnapshot(after) }, tx);
    });
    return this.get(actor, id);
  }

  /** The renters leave on `endDate`; their household rows end then too (or on their own start, if later). */
  async end(actor: Actor, id: string, input: EndInput): Promise<Tenancy> {
    const before = await this.row(actor, id, 'edit');
    await this.prisma.$transaction((tx) => this.endIn(tx, actor, before, input.endDate));
    return this.get(actor, id);
  }

  /**
   * Ends the tenancy inside the caller's transaction (also a completed move-out). A move still
   * open for it is cancelled: nobody can move in or out of an ended tenancy.
   */
  async endIn(tx: Prisma.TransactionClient, actor: Actor, before: TenancyRow, endDate: string): Promise<void> {
    if (before.status === 'ended') throw alreadyEnded();
    if (endsBeforeStart(isoDate(before.start_date), endDate)) throw endBeforeStart();
    const after = await tx.tenancies.update({ where: { id: before.id }, data: { status: 'ended', end_date: dayOf(endDate) }, select: tenancyFlatSelect });
    await tx.$executeRaw`
      update occupants set end_date = greatest(start_date, ${endDate}::date)
      where tenancy_id = ${before.id}::uuid and end_date is null`;
    await tx.move_events.updateMany({
      where: { tenancy_id: before.id, status: 'open' },
      data: { status: 'cancelled', cancelled_at: new Date(), cancelled_by: actor.userId },
    });
    await this.occupancy.refresh(actor.societyId, before.units.locations.path, tx);
    await this.audit.record({ ...auditOf(actor, 'tenancy', 'end', before.id), before: tenancySnapshot(before), after: tenancySnapshot(after) }, tx);
  }

  /** For rows entered by mistake, once no household row points at it. */
  async remove(actor: Actor, id: string): Promise<void> {
    const before = await this.row(actor, id, 'delete');
    try {
      await this.prisma.$transaction(async (tx) => {
        // Its move checklists go with a tenancy entered by mistake.
        await tx.move_events.deleteMany({ where: { tenancy_id: id } });
        await tx.tenancies.delete({ where: { id } });
        await this.occupancy.refresh(actor.societyId, before.units.locations.path, tx);
        await this.audit.record({ ...auditOf(actor, 'tenancy', 'delete', id), before: tenancySnapshot(before) }, tx);
      });
    } catch (error) {
      throw isForeignKeyViolation(error) ? hasOccupants() : error;
    }
  }

  /** The tenancy row if the caller may see it (404) and `action` on it (403). */
  async row(actor: Actor, id: string, action: PermissionAction): Promise<TenancyRow> {
    const row = await this.prisma.tenancies.findFirst({
      where: { id, society_id: actor.societyId, units: { society_id: actor.societyId } },
      select: tenancyRowSelect,
    });
    const located = row ? { path: row.units.locations.path } : null;
    if (!row || !located || !actor.access.can('view', 'tenancies', located)) throw notFound();
    if (!actor.access.can(action, 'tenancies', located)) throw beyondPermissions();
    return row;
  }
}
