import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  digitVariants,
  regNoKey,
  VEHICLE_LOOKUP_LIMIT,
  type UnitTie,
  type VehicleCreateInput,
  type VehicleDetail,
  type VehicleKind,
  type VehicleList,
  type VehicleListQuery,
  type VehicleLookup,
  type VehicleRemoveInput,
  type VehicleUnitPeople,
  type VehicleUpdateInput,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { MemberRowsService, placeSelect } from '../members/member-rows.service.js';
import { auditOf, personNotFound } from '../members/parties.service.js';
import { scopeWhere } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beyondPermissions } from '../property/tree.service.js';
import { stickerRefOf, vehicleRowOf, vehicleSelect, vehicleSnapshot, type VehicleSelected } from './vehicle-rows.js';

type Unit = { id: string; path: string };

export const vehicleNotFound = () => new NotFoundException({ code: 'vehicle_not_found', message: 'Vehicle not found' });
export const vehicleRemoved = () => new ConflictException({ code: 'vehicle_removed', message: 'This vehicle has been removed' });
const unitNotFound = () => new NotFoundException({ code: 'unit_not_found', message: 'Unit not found' });
const vehicleExists = () => new ConflictException({ code: 'vehicle_exists', message: 'A vehicle with this registration number is already on file' });
const personNotAtUnit = () =>
  new ConflictException({ code: 'vehicle_person_not_at_unit', message: 'This person does not own, rent or live in this unit now' });

/**
 * Vehicles (যানবাহন), under the `vehicles` permission where their unit is. Each belongs to a
 * person who owns, rents or lives in the unit when it is added; never deleted, only removed
 * (which revokes its sticker and frees its parking slot). The services write their own audit rows.
 */
@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rows: MemberRowsService,
  ) {}

  async list(actor: Actor, query: VehicleListQuery): Promise<VehicleList> {
    const { page, pageSize } = query;
    const today = todayDate();
    const scope = this.scope(actor);
    const where: Prisma.vehiclesWhereInput = { AND: [scope, ...this.filters(query)] };
    const onFile = { removed_at: null } satisfies Prisma.vehiclesWhereInput;
    const [rows, total, active, noSticker] = await Promise.all([
      this.prisma.vehicles.findMany({ where, select: vehicleSelect, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.vehicles.count({ where }),
      this.prisma.vehicles.count({ where: { AND: [scope, onFile] } }),
      this.prisma.vehicles.count({ where: { AND: [scope, onFile, { stickers: { none: { status: 'active', valid_until: { gte: today } } } }] } }),
    ]);
    const place = await this.rows.places(actor.societyId, rows.map((row) => row.units.locations));
    return {
      items: rows.map((row) => vehicleRowOf(row, place(row.units.locations), isoDate(today))),
      total,
      page,
      pageSize,
      counts: { active, noSticker },
      can: { create: actor.access.can('create', 'vehicles') },
    };
  }

  async get(actor: Actor, id: string): Promise<VehicleDetail> {
    const row = await this.visible(actor, id);
    const place = await this.rows.places(actor.societyId, [row.units.locations]);
    const at = { path: row.units.locations.path };
    const onFile = row.removed_at === null;
    return {
      ...vehicleRowOf(row, place(row.units.locations), isoDate(todayDate())),
      note: row.note,
      removeReason: row.remove_reason,
      can: { edit: onFile && actor.access.can('edit', 'vehicles', at), remove: onFile && actor.access.can('delete', 'vehicles', at) },
    };
  }

  /** 404 `unit_not_found`, `person_not_found`; 409 `vehicle_person_not_at_unit`, `vehicle_exists`. */
  async create(actor: Actor, input: VehicleCreateInput): Promise<VehicleDetail> {
    const unit = await this.unitAt(actor, input.unitId, 'create');
    await this.checkPerson(actor.societyId, unit, input.personId);
    const id = await this.unique(() =>
      this.prisma.$transaction(async (tx) => {
        const made = await tx.vehicles.create({
          data: {
            society_id: actor.societyId,
            reg_no: input.regNo,
            reg_key: regNoKey(input.regNo),
            kind: input.kind,
            make: input.make,
            colour: input.colour,
            unit_id: unit.id,
            person_id: input.personId,
            note: input.note,
            created_by: actor.userId,
          },
          select: vehicleSelect,
        });
        await this.audit.record({ ...auditOf(actor, 'vehicle', 'create', made.id), after: vehicleSnapshot(made) }, tx);
        return made.id;
      }),
    );
    return this.get(actor, id);
  }

  /**
   * Not once removed (409 `vehicle_removed`). A new unit needs `vehicles.edit` there too; a new
   * unit or person is checked again (409 `vehicle_person_not_at_unit`).
   */
  async update(actor: Actor, id: string, input: VehicleUpdateInput): Promise<VehicleDetail> {
    const before = await this.changeable(actor, id, 'edit');
    const unitId = input.unitId ?? before.units.locations.id;
    const personId = input.personId ?? before.persons.id;
    const moved = unitId !== before.units.locations.id;
    if (moved || personId !== before.persons.id) {
      const unit = moved ? await this.unitAt(actor, unitId, 'edit') : before.units.locations;
      await this.checkPerson(actor.societyId, unit, personId);
    }
    await this.unique(() =>
      this.prisma.$transaction(async (tx) => {
        const { count } = await tx.vehicles.updateMany({
          where: { id, removed_at: null },
          data: {
            reg_no: input.regNo,
            reg_key: input.regNo === undefined ? undefined : regNoKey(input.regNo),
            kind: input.kind,
            make: input.make,
            colour: input.colour,
            unit_id: unitId,
            person_id: personId,
            note: input.note,
          },
        });
        if (count === 0) throw vehicleRemoved();
        const after = await tx.vehicles.findUniqueOrThrow({ where: { id }, select: vehicleSelect });
        const was = vehicleSnapshot(before);
        const now = vehicleSnapshot(after);
        if ((Object.keys(now) as (keyof typeof now)[]).every((key) => now[key] === was[key])) return;
        await this.audit.record({ ...auditOf(actor, 'vehicle', 'update', id), before: was, after: now }, tx);
      }),
    );
    return this.get(actor, id);
  }

  /** Sold, gone or a mistake: revokes its sticker in force and frees its parking slot. 409 `vehicle_removed`. */
  async remove(actor: Actor, id: string, input: VehicleRemoveInput): Promise<VehicleDetail> {
    const before = await this.changeable(actor, id, 'delete');
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const { count } = await tx.vehicles.updateMany({ where: { id, removed_at: null }, data: { removed_at: now, remove_reason: input.reason } });
      if (count === 0) throw vehicleRemoved();
      const revoked = await tx.stickers.updateMany({
        where: { vehicle_id: id, status: 'active' },
        data: { status: 'revoked', revoked_at: now, revoke_reason: input.reason },
      });
      const freed = await tx.parking_slots.updateMany({ where: { vehicle_id: id }, data: { vehicle_id: null } });
      await this.audit.record(
        {
          ...auditOf(actor, 'vehicle', 'remove', id),
          before: vehicleSnapshot(before),
          after: { removeReason: input.reason, stickersRevoked: revoked.count, slotsFreed: freed.count },
        },
        tx,
      );
    });
    return this.get(actor, id);
  }

  /**
   * A guard's check by plate, in the caller's `vehicles.view` area, vehicles on file only. An
   * exact number, or its last digits (four or more). Gives no names, phones or notes.
   */
  async lookup(actor: Actor, plate: string): Promise<VehicleLookup> {
    const key = regNoKey(plate);
    if (key.length < 2) return { items: [] };
    const rows = await this.prisma.vehicles.findMany({
      where: {
        AND: [this.scope(actor), { removed_at: null }, { OR: [{ reg_key: key }, ...(/^\d{4,}$/.test(key) ? [{ reg_key: { endsWith: key } }] : [])] }],
      },
      select: { reg_no: true, reg_key: true, kind: true, units: { select: { locations: { select: placeSelect } } }, stickers: vehicleSelect.stickers },
      orderBy: [{ reg_key: 'asc' }],
      take: VEHICLE_LOOKUP_LIMIT,
    });
    rows.sort((a, b) => Number(b.reg_key === key) - Number(a.reg_key === key));
    const place = await this.rows.places(actor.societyId, rows.map((row) => row.units.locations));
    const today = isoDate(todayDate());
    return {
      items: rows.map((row) => {
        const sticker = stickerRefOf(row.stickers[0], today);
        return {
          regNo: row.reg_no,
          kind: row.kind as VehicleKind,
          place: place(row.units.locations),
          sticker: sticker && { stickerNo: sticker.stickerNo, validUntil: sticker.validUntil, state: sticker.state },
        };
      }),
    };
  }

  /** Who owns (at or above), rents or lives in a unit the caller sees vehicles at (404 `unit_not_found`). */
  async unitPeople(actor: Actor, unitId: string): Promise<VehicleUnitPeople> {
    const unit = await this.unitAt(actor, unitId, 'view');
    const ties = await this.ties(actor.societyId, unit, null);
    const people = await this.prisma.persons.findMany({
      where: { id: { in: [...new Set(ties.map((tie) => tie.person_id))] }, society_id: actor.societyId },
      select: { id: true, full_name: true, full_name_en: true },
      orderBy: [{ full_name: 'asc' }, { id: 'asc' }],
    });
    return {
      items: people.map((person) => ({
        id: person.id,
        name: person.full_name,
        nameEn: person.full_name_en,
        ties: ties.filter((tie) => tie.person_id === person.id).map((tie) => tie.tie),
      })),
    };
  }

  /** A vehicle the caller may see where its unit is, or 404. */
  async visible(actor: Actor, id: string): Promise<VehicleSelected> {
    const row = await this.prisma.vehicles.findFirst({ where: { id, society_id: actor.societyId }, select: vehicleSelect });
    if (!row || !actor.access.can('view', 'vehicles', { path: row.units.locations.path })) throw vehicleNotFound();
    return row;
  }

  /** A vehicle the caller may `action` (403) and still on file (409 `vehicle_removed`). */
  async changeable(actor: Actor, id: string, action: 'edit' | 'delete'): Promise<VehicleSelected> {
    const row = await this.visible(actor, id);
    if (!actor.access.can(action, 'vehicles', { path: row.units.locations.path })) throw beyondPermissions();
    if (row.removed_at) throw vehicleRemoved();
    return row;
  }

  /** Vehicle rows in the caller's `vehicles.view` area. */
  scope(actor: Actor): Prisma.vehiclesWhereInput {
    return {
      society_id: actor.societyId,
      units: { locations: scopeWhere(actor.access, 'view', 'vehicles', (prefix) => ({ path: { startsWith: prefix } })) },
    };
  }

  /** A unit the caller sees (404 `unit_not_found`) and may `action` vehicles at (403). */
  async unitAt(actor: Actor, unitId: string, action: 'view' | 'create' | 'edit'): Promise<Unit> {
    const row = await this.prisma.units.findFirst({ where: { location_id: unitId, society_id: actor.societyId }, select: { locations: { select: { id: true, path: true } } } });
    const at = row && { path: row.locations.path };
    if (!at || !(actor.access.can('view', 'vehicles', at) || actor.access.can('view', 'locations', at))) throw unitNotFound();
    if (!actor.access.can(action, 'vehicles', at)) throw action === 'view' ? unitNotFound() : beyondPermissions();
    return row.locations;
  }

  /** The person is in this society (404) and owns, rents or lives in the unit now (409). */
  async checkPerson(societyId: string, unit: Unit, personId: string): Promise<void> {
    const person = await this.prisma.persons.findFirst({ where: { id: personId, society_id: societyId }, select: { id: true } });
    if (!person) throw personNotFound();
    if ((await this.ties(societyId, unit, personId)).length === 0) throw personNotAtUnit();
  }

  /** Current owners (of the unit or a place above it), renters and residents of a unit; one person may hold several ties. */
  private ties(societyId: string, unit: Unit, personId: string | null): Promise<{ person_id: string; tie: UnitTie }[]> {
    return this.prisma.$queryRaw`
      select o.person_id, 'owner' as tie from ownerships o join locations l on l.id = o.location_id
        where o.society_id = ${societyId}::uuid and o.end_date is null and o.person_id is not null
          and starts_with(${unit.path}, l.path) and (${personId}::uuid is null or o.person_id = ${personId}::uuid)
      union
      select t.primary_person_id, 'renter' from tenancies t
        where t.society_id = ${societyId}::uuid and t.unit_id = ${unit.id}::uuid and t.status <> 'ended'
          and t.primary_person_id is not null and (${personId}::uuid is null or t.primary_person_id = ${personId}::uuid)
      union
      select oc.person_id, 'resident' from occupants oc
        where oc.society_id = ${societyId}::uuid and oc.unit_id = ${unit.id}::uuid and oc.end_date is null
          and (${personId}::uuid is null or oc.person_id = ${personId}::uuid)`;
  }

  /** Runs a write, turning a clash on the registration number into 409 `vehicle_exists`. */
  private async unique<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isUniqueViolation(error)) throw vehicleExists();
      throw error;
    }
  }

  private filters(query: VehicleListQuery): Prisma.vehiclesWhereInput[] {
    const filters: Prisma.vehiclesWhereInput[] = [];
    if (query.view === 'active') filters.push({ removed_at: null });
    if (query.view === 'removed') filters.push({ removed_at: { not: null } });
    if (query.kind) filters.push({ kind: query.kind });
    if (query.unitId) filters.push({ unit_id: query.unitId });
    if (query.personId) filters.push({ person_id: query.personId });
    if (query.locationId) filters.push({ units: { locations: { path: { contains: `/${query.locationId}/` } } } });
    if (query.q) {
      const key = regNoKey(query.q);
      filters.push({
        OR: [
          ...(key.length >= 2 ? [{ reg_key: { contains: key } }] : []),
          ...digitVariants(query.q).flatMap((term) => [
            { make: { contains: term, mode: 'insensitive' as const } },
            { persons: { full_name: { contains: term, mode: 'insensitive' as const } } },
            { persons: { full_name_en: { contains: term, mode: 'insensitive' as const } } },
          ]),
        ],
      });
    }
    return filters;
  }
}
