import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  CHARGE_KINDS,
  monthOfDay,
  monthStart,
  periodEndOf,
  resumeFrom,
  SCHEDULE_GENERATIONS,
  SCHEDULE_STATUSES,
  type ChargeKind,
  type PermissionAction,
  type Schedule,
  type ScheduleInput,
  type ScheduleList,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { toFundOption } from '../finance/funds.service.js';
import { onlySocietyWide } from '../members/parties.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addressOf, TreeService } from '../property/tree.service.js';
import { UnitTypesService } from '../property/unit-types.service.js';

type Tx = Prisma.TransactionClient;

const place = { select: { id: true, name: true, path: true } } as const;

const select = {
  id: true,
  name_bn: true,
  name_en: true,
  amount: true,
  frequency_months: true,
  generation: true,
  unit_types: true,
  starts_on: true,
  ends_on: true,
  next_run_on: true,
  due_days: true,
  status: true,
  charge_types: {
    select: {
      id: true,
      name_bn: true,
      name_en: true,
      kind: true,
      archived_at: true,
      funds: { select: { id: true, name_bn: true, name_en: true, is_default: true } },
    },
  },
  locations: place,
  rates: { select: { amount: true, locations: place }, orderBy: { locations: { name: 'asc' } } },
  _count: { select: { invoice_lines: true } },
} satisfies Prisma.charge_schedulesSelect;
type Row = Prisma.charge_schedulesGetPayload<{ select: typeof select }>;

const FREQUENCIES = [1, 3, 6, 12] as const;
const toFrequency = (value: number | null): Schedule['frequencyMonths'] =>
  value !== null && (FREQUENCIES as readonly number[]).includes(value) ? (value as Schedule['frequencyMonths']) : null;
const oneOf =
  <T extends readonly string[]>(values: T, fallback: T[number]) =>
  (value: string): T[number] =>
    (values as readonly string[]).includes(value) ? (value as T[number]) : fallback;
const toGeneration = oneOf(SCHEDULE_GENERATIONS, 'manual');
const toStatus = oneOf(SCHEDULE_STATUSES, 'ended');
const toKind = (kind: string): ChargeKind => ((CHARGE_KINDS as readonly string[]).includes(kind) ? (kind as ChargeKind) : 'fee');

export const scheduleNotFound = () => new NotFoundException({ code: 'schedule_not_found', message: 'Schedule not found' });
const bad = (code: string, message: string) => new BadRequestException({ code, message });
const conflict = (code: string, message: string) => new ConflictException({ code, message });

/** What an audit row keeps of a schedule. */
const snapshot = (s: Schedule) => ({
  nameBn: s.nameBn,
  nameEn: s.nameEn,
  chargeTypeId: s.chargeType.id,
  amount: s.amount,
  rates: s.rates.map((rate) => ({ locationId: rate.location.id, amount: rate.amount })),
  frequencyMonths: s.frequencyMonths,
  generation: s.generation,
  scopeLocationId: s.scope?.id ?? null,
  unitTypes: s.unitTypes,
  startMonth: s.startMonth,
  endMonth: s.endMonth,
  dueDays: s.dueDays,
  status: s.status,
  nextRunOn: s.nextRunOn,
});

/**
 * Serialises billing runs and schedule changes of one society: a run reads the schedules,
 * bills and moves them on as one step, and a second run waits, then finds nothing due.
 */
export async function lockBillingRun(tx: Tx, societyId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`billing-run:${societyId}`}, 0))`;
}

/** Society-wide only: schedules bill every unit they match, whatever the caller's area. */
export function societyWideBilling(actor: Actor, action: PermissionAction): void {
  if (actor.access.paths(action, 'billing') !== 'all') throw onlySocietyWide();
}

/**
 * Recurring charges (`charge_schedules`): what a billing run bills, how often, for which
 * units and at what rate. Society-wide setup. Never deleted: a schedule is ended.
 */
@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tree: TreeService,
    private readonly unitTypes: UnitTypesService,
  ) {}

  async list(actor: Actor): Promise<ScheduleList> {
    const rows = await this.prisma.charge_schedules.findMany({
      where: { society_id: actor.societyId },
      select,
      orderBy: [{ status: 'asc' }, { name_bn: 'asc' }, { id: 'asc' }],
    });
    return { items: await this.toSchedules(actor.societyId, rows), canEdit: actor.access.paths('edit', 'billing') === 'all' };
  }

  async get(societyId: string, id: string, client: Pick<PrismaService, 'charge_schedules'> = this.prisma): Promise<Schedule> {
    const row = await client.charge_schedules.findFirst({ where: { id, society_id: societyId }, select });
    if (!row) throw scheduleNotFound();
    const [schedule] = await this.toSchedules(societyId, [row]);
    return schedule!;
  }

  async create(actor: Actor, input: ScheduleInput): Promise<Schedule> {
    societyWideBilling(actor, 'create');
    const id = await this.prisma.$transaction(async (tx) => {
      await lockBillingRun(tx, actor.societyId);
      await this.check(tx, actor.societyId, input);
      notInPast(input.startMonth);
      const row = await tx.charge_schedules.create({
        data: { ...toData(input), society_id: actor.societyId, next_run_on: day(monthStart(input.startMonth)), created_by: actor.userId },
        select: { id: true },
      });
      await this.writeRates(tx, row.id, input);
      await this.audit.record({ ...auditOf(actor, 'create', row.id), after: input }, tx);
      return row.id;
    });
    return this.get(actor.societyId, id);
  }

  /** The whole schedule. Once it has made bills, its charge type, frequency and start stay as they are. */
  async update(actor: Actor, id: string, input: ScheduleInput): Promise<Schedule> {
    societyWideBilling(actor, 'edit');
    await this.prisma.$transaction(async (tx) => {
      await lockBillingRun(tx, actor.societyId);
      // Read outside `tx` (its relations load in parallel); the lock keeps every other writer out.
      const before = await this.get(actor.societyId, id);
      if (before.status === 'ended') throw conflict('schedule_ended', 'This schedule has ended');
      if (before.billed && (input.chargeTypeId !== before.chargeType.id || input.frequencyMonths !== before.frequencyMonths || input.startMonth !== before.startMonth)) {
        throw conflict('schedule_in_use', 'This schedule has made bills; its charge, frequency and start are fixed');
      }
      await this.check(tx, actor.societyId, input);
      if (!before.billed && input.startMonth !== before.startMonth) notInPast(input.startMonth);

      // Not billed yet: it starts from its (possibly new) first month. Otherwise it keeps its place.
      let next: string | null = before.billed ? before.nextRunOn : monthStart(input.startMonth);
      const endsOn = input.endMonth ? periodEndOf(monthStart(input.endMonth), 1) : null;
      if (next !== null && endsOn !== null && next > endsOn) next = null;
      await tx.charge_schedules.update({
        where: { id },
        data: {
          ...toData(input),
          next_run_on: next ? day(next) : null,
          status: next === null ? 'ended' : before.status,
          updated_at: new Date(),
        },
      });
      await tx.charge_schedule_rates.deleteMany({ where: { schedule_id: id } });
      await this.writeRates(tx, id, input);
      await this.audit.record({ ...auditOf(actor, 'update', id), before: snapshot(before), after: input }, tx);
    });
    return this.get(actor.societyId, id);
  }

  /** Pause (no bills until resumed), resume (the paused months are not billed) or end for good. */
  async setStatus(actor: Actor, id: string, action: 'pause' | 'resume' | 'end'): Promise<Schedule> {
    societyWideBilling(actor, 'edit');
    await this.prisma.$transaction(async (tx) => {
      await lockBillingRun(tx, actor.societyId);
      // Read outside `tx` (its relations load in parallel); the lock keeps every other writer out.
      const before = await this.get(actor.societyId, id);
      if (before.status === 'ended') throw conflict('schedule_ended', 'This schedule has ended');
      let data: Prisma.charge_schedulesUpdateInput;
      if (action === 'end') {
        data = { status: 'ended', next_run_on: null };
      } else if (action === 'pause') {
        if (before.status === 'paused') return;
        data = { status: 'paused' };
      } else {
        if (before.status === 'active') return;
        const next = resumeFrom(
          {
            nextRunOn: before.nextRunOn,
            startsOn: monthStart(before.startMonth),
            frequencyMonths: before.frequencyMonths,
            endsOn: before.endMonth ? periodEndOf(monthStart(before.endMonth), 1) : null,
          },
          monthStart(monthOfDay(isoDate(todayDate()))),
        );
        data = next === null ? { status: 'ended', next_run_on: null } : { status: 'active', next_run_on: day(next) };
      }
      await tx.charge_schedules.update({ where: { id }, data: { ...data, updated_at: new Date() } });
      await this.audit.record({ ...auditOf(actor, action, id), before: { status: before.status, nextRunOn: before.nextRunOn } }, tx);
    });
    return this.get(actor.societyId, id);
  }

  /** The charge type is this society's and in use, the unit types are the society's; the area and every rate's location are in the society, rates inside the area. */
  private async check(tx: Tx, societyId: string, input: ScheduleInput): Promise<void> {
    const type = await tx.charge_types.findFirst({
      where: { id: input.chargeTypeId, society_id: societyId },
      select: { archived_at: true, funds: { select: { closed_at: true } } },
    });
    if (!type) throw bad('invalid_charge_type', 'Unknown charge type');
    if (type.archived_at) throw bad('charge_type_archived', 'This charge type is no longer used');
    await this.unitTypes.assertCodes(societyId, input.unitTypes, tx);

    const ids = [...new Set([...(input.scopeLocationId ? [input.scopeLocationId] : []), ...input.rates.map((rate) => rate.locationId)])];
    const rows = ids.length ? await tx.locations.findMany({ where: { id: { in: ids }, society_id: societyId }, select: { id: true, path: true } }) : [];
    if (rows.length !== ids.length) throw bad('location_not_found', 'Unknown location');
    const scope = input.scopeLocationId ? rows.find((row) => row.id === input.scopeLocationId)!.path : null;
    if (scope) {
      const paths = new Map(rows.map((row) => [row.id, row.path]));
      if (input.rates.some((rate) => !paths.get(rate.locationId)!.startsWith(scope))) {
        throw bad('rate_outside_scope', 'A rate is for a place outside the schedule’s area');
      }
    }
  }

  private async writeRates(tx: Tx, scheduleId: string, input: ScheduleInput): Promise<void> {
    if (input.rates.length === 0) return;
    await tx.charge_schedule_rates.createMany({
      data: input.rates.map((rate) => ({ schedule_id: scheduleId, location_id: rate.locationId, amount: new Prisma.Decimal(rate.amount) })),
    });
  }

  private async toSchedules(societyId: string, rows: Row[]): Promise<Schedule[]> {
    const paths = rows.flatMap((row) => [...(row.locations ? [row.locations.path] : []), ...row.rates.map((rate) => rate.locations.path)]);
    const names = await this.tree.addressNames(societyId, paths);
    const ref = (loc: { id: string; name: string; path: string }) => ({ id: loc.id, name: loc.name, address: addressOf(loc.path, names) });
    return rows.map((row) => ({
      id: row.id,
      nameBn: row.name_bn,
      nameEn: row.name_en,
      chargeType: {
        id: row.charge_types.id,
        nameBn: row.charge_types.name_bn,
        nameEn: row.charge_types.name_en,
        kind: toKind(row.charge_types.kind),
        archived: row.charge_types.archived_at !== null,
      },
      fund: toFundOption(row.charge_types.funds),
      amount: row.amount.toFixed(2),
      rates: row.rates.map((rate) => ({ location: ref(rate.locations), amount: rate.amount.toFixed(2) })),
      frequencyMonths: toFrequency(row.frequency_months),
      generation: toGeneration(row.generation),
      scope: row.locations ? ref(row.locations) : null,
      unitTypes: row.unit_types,
      startMonth: monthOfDay(isoDate(row.starts_on)),
      endMonth: row.ends_on ? monthOfDay(isoDate(row.ends_on)) : null,
      nextRunOn: row.next_run_on ? isoDate(row.next_run_on) : null,
      dueDays: row.due_days,
      status: toStatus(row.status),
      billed: row._count.invoice_lines > 0,
    }));
  }
}

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** A new schedule starts this month or later; dues from before are entered as earlier arrears. */
function notInPast(startMonth: string): void {
  if (startMonth < monthOfDay(isoDate(todayDate()))) throw bad('start_in_past', 'A schedule can’t start in a past month');
}

function toData(input: ScheduleInput) {
  return {
    name_bn: input.nameBn,
    name_en: input.nameEn,
    charge_type_id: input.chargeTypeId,
    amount: new Prisma.Decimal(input.amount),
    frequency_months: input.frequencyMonths,
    generation: input.generation,
    scope_location_id: input.scopeLocationId,
    unit_types: [...new Set(input.unitTypes)],
    starts_on: day(monthStart(input.startMonth)),
    ends_on: input.endMonth ? day(periodEndOf(monthStart(input.endMonth), 1)) : null,
    due_days: input.dueDays,
  };
}

const auditOf = (actor: Actor, action: string, entityId: string) => ({
  societyId: actor.societyId,
  userId: actor.userId,
  action,
  entityType: 'charge_schedule',
  entityId,
  ip: actor.ip,
});
