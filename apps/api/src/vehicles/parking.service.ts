import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  digitVariants,
  type ParkingAssignInput,
  type ParkingList,
  type ParkingListQuery,
  type ParkingSlot,
  type ParkingSlotCreateInput,
  type ParkingSlotUpdateInput,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { MemberRowsService, placeSelect } from '../members/member-rows.service.js';
import { auditOf } from '../members/parties.service.js';
import { scopeWhere } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beyondPermissions, locationNotFound, TreeService } from '../property/tree.service.js';
import { vehicleRemoved, VehiclesService } from './vehicles.service.js';

const slotSelect = {
  id: true,
  code: true,
  note: true,
  removed_at: true,
  unit_id: true,
  vehicle_id: true,
  locations: { select: placeSelect },
  units: { select: { locations: { select: placeSelect } } },
  vehicles: { select: { id: true, reg_no: true, units: { select: { locations: { select: placeSelect } } } } },
} satisfies Prisma.parking_slotsSelect;
type SlotSelected = Prisma.parking_slotsGetPayload<{ select: typeof slotSelect }>;

const slotNotFound = () => new NotFoundException({ code: 'parking_slot_not_found', message: 'Parking slot not found' });
const slotRemoved = () => new ConflictException({ code: 'parking_slot_removed', message: 'This parking slot has been removed' });
const IN_USE = { removed_at: null } satisfies Prisma.parking_slotsWhereInput;
const FREE = { unit_id: null, vehicle_id: null } satisfies Prisma.parking_slotsWhereInput;

/**
 * Parking slots (`vehicles` permission where the slot is): a garage space or a spot on a road,
 * given to a unit or one vehicle, or free. Never deleted, only removed. Audited here.
 */
@Injectable()
export class ParkingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rows: MemberRowsService,
    private readonly tree: TreeService,
    private readonly vehicles: VehiclesService,
  ) {}

  async list(actor: Actor, query: ParkingListQuery): Promise<ParkingList> {
    const { page, pageSize } = query;
    const scope = this.scope(actor);
    const where: Prisma.parking_slotsWhereInput = { AND: [scope, ...this.filters(query)] };
    const [rows, total, slots, free] = await Promise.all([
      this.prisma.parking_slots.findMany({ where, select: slotSelect, orderBy: [{ code: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.parking_slots.count({ where }),
      this.prisma.parking_slots.count({ where: { AND: [scope, IN_USE] } }),
      this.prisma.parking_slots.count({ where: { AND: [scope, IN_USE, FREE] } }),
    ]);
    return { items: await this.toSlots(actor, rows), total, page, pageSize, counts: { slots, free }, can: { create: actor.access.can('create', 'vehicles') } };
  }

  async get(actor: Actor, id: string): Promise<ParkingSlot> {
    const [slot] = await this.toSlots(actor, [await this.visible(actor, id)]);
    return slot!;
  }

  /** 404 `location_not_found`; 409 `parking_code_taken`. */
  async create(actor: Actor, input: ParkingSlotCreateInput): Promise<ParkingSlot> {
    const place = await this.placeAt(actor, input.locationId, 'create');
    const id = await this.unique(() =>
      this.prisma.$transaction(async (tx) => {
        const made = await tx.parking_slots.create({
          data: { society_id: actor.societyId, location_id: place, code: input.code, note: input.note, created_by: actor.userId },
          select: { id: true },
        });
        await this.audit.record({ ...auditOf(actor, 'parking_slot', 'create', made.id), after: { locationId: place, code: input.code, note: input.note } }, tx);
        return made.id;
      }),
    );
    return this.get(actor, id);
  }

  /** 409 `parking_slot_removed`, `parking_code_taken`. A new place needs `vehicles.edit` there too. */
  async update(actor: Actor, id: string, input: ParkingSlotUpdateInput): Promise<ParkingSlot> {
    const before = await this.changeable(actor, id, 'edit');
    const place = input.locationId && input.locationId !== before.locations.id ? await this.placeAt(actor, input.locationId, 'edit') : undefined;
    await this.unique(() =>
      this.prisma.$transaction(async (tx) => {
        const { count } = await tx.parking_slots.updateMany({ where: { id, ...IN_USE }, data: { location_id: place, code: input.code, note: input.note } });
        if (count === 0) throw slotRemoved();
        await this.audit.record(
          {
            ...auditOf(actor, 'parking_slot', 'update', id),
            before: { locationId: before.locations.id, code: before.code, note: before.note },
            after: { locationId: place ?? before.locations.id, code: input.code ?? before.code, note: input.note === undefined ? before.note : input.note },
          },
          tx,
        );
      }),
    );
    return this.get(actor, id);
  }

  /**
   * Gives the slot to a unit or one vehicle the caller sees vehicles at, or frees it (both null).
   * 404 `unit_not_found`, `vehicle_not_found`; 409 `vehicle_removed`, `parking_vehicle_taken`, `parking_slot_removed`.
   */
  async assign(actor: Actor, id: string, input: ParkingAssignInput): Promise<ParkingSlot> {
    const before = await this.changeable(actor, id, 'edit');
    if (input.unitId) await this.vehicles.unitAt(actor, input.unitId, 'view');
    if (input.vehicleId && (await this.vehicles.visible(actor, input.vehicleId)).removed_at) throw vehicleRemoved();
    try {
      await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.parking_slots.updateMany({ where: { id, ...IN_USE }, data: { unit_id: input.unitId, vehicle_id: input.vehicleId } });
        if (count === 0) throw slotRemoved();
        await this.audit.record(
          {
            ...auditOf(actor, 'parking_slot', 'assign', id),
            before: { unitId: before.unit_id, vehicleId: before.vehicle_id },
            after: { unitId: input.unitId, vehicleId: input.vehicleId },
          },
          tx,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException({ code: 'parking_vehicle_taken', message: 'This vehicle already has a parking slot' });
      throw error;
    }
    return this.get(actor, id);
  }

  /** No longer used: freed and hidden from the default list. 409 `parking_slot_removed`. */
  async remove(actor: Actor, id: string): Promise<ParkingSlot> {
    const before = await this.changeable(actor, id, 'delete');
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.parking_slots.updateMany({ where: { id, ...IN_USE }, data: { removed_at: new Date(), ...FREE } });
      if (count === 0) throw slotRemoved();
      await this.audit.record({ ...auditOf(actor, 'parking_slot', 'remove', id), before: { code: before.code, unitId: before.unit_id, vehicleId: before.vehicle_id } }, tx);
    });
    return this.get(actor, id);
  }

  private async visible(actor: Actor, id: string): Promise<SlotSelected> {
    const row = await this.prisma.parking_slots.findFirst({ where: { id, society_id: actor.societyId }, select: slotSelect });
    if (!row || !actor.access.can('view', 'vehicles', { path: row.locations.path })) throw slotNotFound();
    return row;
  }

  private async changeable(actor: Actor, id: string, action: 'edit' | 'delete'): Promise<SlotSelected> {
    const row = await this.visible(actor, id);
    if (!actor.access.can(action, 'vehicles', { path: row.locations.path })) throw beyondPermissions();
    if (row.removed_at) throw slotRemoved();
    return row;
  }

  /** A place for a slot: one the caller sees (404) and may `action` vehicles at (403). */
  private async placeAt(actor: Actor, locationId: string, action: 'create' | 'edit'): Promise<string> {
    const place = await this.tree.find(actor.societyId, locationId);
    if (!place || !(actor.access.can('view', 'vehicles', { path: place.path }) || actor.access.can('view', 'locations', { path: place.path }))) {
      throw locationNotFound();
    }
    if (!actor.access.can(action, 'vehicles', { path: place.path })) throw beyondPermissions();
    return place.id;
  }

  private scope(actor: Actor): Prisma.parking_slotsWhereInput {
    return { society_id: actor.societyId, locations: scopeWhere(actor.access, 'view', 'vehicles', (prefix) => ({ path: { startsWith: prefix } })) };
  }

  private async toSlots(actor: Actor, rows: SlotSelected[]): Promise<ParkingSlot[]> {
    const assigneePlace = (row: SlotSelected) => row.units?.locations ?? row.vehicles?.units.locations;
    const place = await this.rows.places(actor.societyId, [...rows.map((row) => row.locations), ...rows.flatMap((row) => assigneePlace(row) ?? [])]);
    return rows.map((row) => {
      const at = { path: row.locations.path };
      const inUse = row.removed_at === null;
      return {
        id: row.id,
        code: row.code,
        note: row.note,
        place: place(row.locations),
        assignee: row.units
          ? { kind: 'unit' as const, place: place(row.units.locations) }
          : row.vehicles
            ? { kind: 'vehicle' as const, id: row.vehicles.id, regNo: row.vehicles.reg_no, place: place(row.vehicles.units.locations) }
            : null,
        removedAt: row.removed_at?.toISOString() ?? null,
        can: { edit: inUse && actor.access.can('edit', 'vehicles', at), remove: inUse && actor.access.can('delete', 'vehicles', at) },
      };
    });
  }

  private async unique<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException({ code: 'parking_code_taken', message: 'A slot with this code is already in use here' });
      throw error;
    }
  }

  private filters(query: ParkingListQuery): Prisma.parking_slotsWhereInput[] {
    const filters: Prisma.parking_slotsWhereInput[] = [];
    if (query.view === 'removed') filters.push({ removed_at: { not: null } });
    else filters.push(IN_USE);
    if (query.view === 'free') filters.push(FREE);
    if (query.view === 'taken') filters.push({ OR: [{ unit_id: { not: null } }, { vehicle_id: { not: null } }] });
    if (query.locationId) filters.push({ locations: { path: { contains: `/${query.locationId}/` } } });
    if (query.q) filters.push({ OR: digitVariants(query.q).map((term) => ({ code: { contains: term, mode: 'insensitive' as const } })) });
    return filters;
  }
}
