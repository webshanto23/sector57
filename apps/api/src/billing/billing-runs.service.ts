import { BadRequestException, HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  addMoney,
  addMonths,
  duePeriods,
  MAX_BILL_AHEAD_MONTHS,
  formatDate,
  monthOfDay,
  monthStart,
  nextRunAfter,
  periodEndOf,
  periodMonths,
  PREVIEW_LIMIT,
  rateFor,
  skippedUnitSchema,
  type BillAheadPreview,
  type BillAheadResult,
  type BillingRun,
  type BillingRunList,
  type BillingRunPreview,
  type BillingRunTrigger,
  type Pagination,
  type ScheduleBlock,
  type SkippedUnit,
  type SkipReason,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { NumberingService } from '../finance/numbering.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addressOf, beyondPermissions, pathIds, TreeService } from '../property/tree.service.js';
import { BillToService, type BillableUnit, type BillToChoice } from './bill-to.service.js';
import { lockBillingRun, societyWideBilling } from './schedules.service.js';

type Tx = Prisma.TransactionClient;
type Client = Tx | PrismaService;

/** A whole run is one transaction; a society's run may make thousands of bills. */
const RUN_TIMEOUT_MS = 5 * 60_000;

type PlannedSchedule = {
  id: string;
  nameBn: string;
  nameEn: string | null;
  chargeTypeId: string;
  fundId: string;
  frequencyMonths: number | null;
  endsOn: string | null;
  nextRunOn: string;
  dueDays: number;
  periods: string[];
  blocked: ScheduleBlock | null;
};

type PlannedLine = {
  unit: BillableUnit;
  choice: BillToChoice;
  schedule: PlannedSchedule;
  periodStart: string;
  periodEnd: string;
  amount: string;
  rateFrom: string | null;
};

type Plan = {
  month: string;
  schedules: PlannedSchedule[];
  lines: PlannedLine[];
  skipped: SkippedUnit[];
  /** Location names (for addresses and where a rate came from), by id. */
  names: Map<string, string>;
};

/** A run bills every unit (`auto`: only auto schedules); bill ahead bills one unit from every schedule. */
type PlanFor = { trigger: BillingRunTrigger; unitId?: string };

const skippedList = z.array(skippedUnitSchema);
const nameOf = (user: { phone: string; persons: { full_name: string } | null } | null) => (user ? (user.persons?.full_name ?? user.phone) : null);

/**
 * Billing runs: for one month, every active schedule that is due makes one bill per unit per
 * fund, with one line per schedule and period. A preview first; confirming writes everything
 * in one transaction. Running twice never bills twice: the schedules move on, and
 * `invoice_lines_once_uq` refuses a second line for the same schedule, unit and period.
 */
@Injectable()
export class BillingRunsService {
  private readonly logger = new Logger(BillingRunsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tree: TreeService,
    private readonly billTo: BillToService,
    private readonly numbering: NumberingService,
  ) {}

  async preview(actor: Actor, month: string): Promise<BillingRunPreview> {
    societyWideBilling(actor, 'create');
    notFuture(month);
    const plan = await this.plan(this.prisma, actor.societyId, month, { trigger: 'manual' });
    const parties = await this.billTo.parties(plan.lines.map((line) => line.choice.payer));
    const bySchedule = new Map<string, PlannedLine[]>();
    for (const line of plan.lines) bySchedule.set(line.schedule.id, [...(bySchedule.get(line.schedule.id) ?? []), line]);
    const counts = { no_bill_to: 0, inactive: 0, already_billed: 0 } satisfies Record<SkipReason, number>;
    for (const skip of plan.skipped) counts[skip.reason] += 1;

    return {
      month,
      invoiceCount: groupInvoices(plan.lines).size,
      lineCount: plan.lines.length,
      total: addMoney('0', ...plan.lines.map((line) => line.amount)),
      schedules: plan.schedules.map((schedule) => {
        const lines = bySchedule.get(schedule.id) ?? [];
        return {
          id: schedule.id,
          nameBn: schedule.nameBn,
          nameEn: schedule.nameEn,
          periods: schedule.periods,
          lines: lines.length,
          total: addMoney('0', ...lines.map((line) => line.amount)),
          blocked: schedule.blocked,
        };
      }),
      lines: plan.lines.slice(0, PREVIEW_LIMIT).map((line) => ({
        unitId: line.unit.id,
        unitName: line.unit.name,
        address: addressOf(line.unit.path, plan.names),
        billTo: parties.get(line.choice.payer.id)?.name ?? '',
        scheduleId: line.schedule.id,
        periodStart: line.periodStart,
        periodEnd: line.periodEnd,
        amount: line.amount,
        rateFrom: line.rateFrom ? (plan.names.get(line.rateFrom) ?? null) : null,
      })),
      skipped: plan.skipped.slice(0, PREVIEW_LIMIT),
      skippedCounts: counts,
    };
  }

  /** Confirms a run for `month` from the dashboard. */
  async runManual(actor: Actor, month: string): Promise<BillingRun> {
    societyWideBilling(actor, 'create');
    notFuture(month);
    const id = await this.run(actor.societyId, month, 'manual', actor.userId, actor.ip);
    return this.get(actor.societyId, id!);
  }

  /**
   * The nightly job: every society's auto schedules due this month (missed months included).
   * A society with nothing due gets no run row. One failing society doesn't stop the others.
   */
  async runAutoForAll(): Promise<void> {
    const month = monthOfDay(isoDate(todayDate()));
    const societies = await this.prisma.societies.findMany({ select: { id: true } });
    for (const society of societies) {
      try {
        const id = await this.runAuto(society.id, month);
        if (id) this.logger.log(`Billing run ${id} for society ${society.id}, ${month}`);
      } catch (error) {
        this.logger.error(`Automatic billing run failed for society ${society.id}: ${(error as Error).message}`);
      }
    }
  }

  /** One society's automatic run for `month`; null when nothing was due. */
  runAuto(societyId: string, month: string): Promise<string | null> {
    return this.run(societyId, month, 'auto', null, null);
  }

  async list(actor: Actor, query: Pagination): Promise<BillingRunList> {
    societyWideBilling(actor, 'view');
    const where = { society_id: actor.societyId };
    const [total, rows] = await Promise.all([
      this.prisma.billing_runs.count({ where }),
      this.prisma.billing_runs.findMany({
        where,
        select: runSelect,
        orderBy: [{ started_at: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toRun), total, page: query.page, pageSize: query.pageSize };
  }

  async get(societyId: string, id: string): Promise<BillingRun> {
    const row = await this.prisma.billing_runs.findFirstOrThrow({ where: { id, society_id: societyId }, select: runSelect });
    return toRun(row);
  }

  // -------------------------------------------------------------------------
  // Billing one unit ahead
  // -------------------------------------------------------------------------

  /** What billing one unit up to `month` would make. Writes nothing. */
  async billAheadPreview(actor: Actor, unitId: string, month: string): Promise<BillAheadPreview> {
    aheadRange(month);
    await this.billableUnit(this.prisma, actor, unitId);
    const plan = await this.plan(this.prisma, actor.societyId, month, { trigger: 'manual', unitId });
    const first = plan.lines[0];
    const nobody = plan.skipped.some((skip) => skip.reason === 'no_bill_to');
    const billTo = first
      ? ((await this.billTo.parties([first.choice.payer])).get(first.choice.payer.id)?.name ?? null)
      : nobody
        ? null
        : await this.currentBillTo(actor.societyId, unitId);
    return {
      month,
      billTo,
      invoiceCount: groupInvoices(plan.lines).size,
      total: addMoney('0', ...plan.lines.map((line) => line.amount)),
      lines: plan.lines.map((line) => ({
        scheduleId: line.schedule.id,
        nameBn: line.schedule.nameBn,
        nameEn: line.schedule.nameEn,
        periodStart: line.periodStart,
        periodEnd: line.periodEnd,
        amount: line.amount,
      })),
    };
  }

  /**
   * Bills one unit's schedules up to `month`, for someone paying ahead. The schedules stay
   * where they are: a later run finds those months already billed for this unit.
   */
  async billAhead(actor: Actor, unitId: string, month: string): Promise<BillAheadResult> {
    aheadRange(month);
    const invoices = await this.prisma.$transaction(async (tx) => {
      await lockBillingRun(tx, actor.societyId);
      const unit = await this.billableUnit(tx, actor, unitId);
      if (!unit.isActive) throw new BadRequestException({ code: 'unit_inactive', message: 'This unit is inactive' });
      const plan = await this.plan(tx, actor.societyId, month, { trigger: 'manual', unitId });
      if (plan.skipped.some((skip) => skip.reason === 'no_bill_to')) {
        throw new BadRequestException({ code: 'no_bill_to', message: 'Nobody owns or rents this unit, so there is no one to bill' });
      }
      if (plan.lines.length === 0) throw new BadRequestException({ code: 'nothing_to_bill', message: 'Nothing is due for this unit up to that month' });
      const made = await this.writeInvoices(tx, actor.societyId, plan.lines, actor.userId, null);
      await this.audit.record(
        {
          societyId: actor.societyId,
          userId: actor.userId,
          action: 'bill_ahead',
          entityType: 'unit',
          entityId: unitId,
          ip: actor.ip,
          after: {
            month,
            invoices: made.map((invoice) => invoice.invoiceNo),
            lines: plan.lines.map((line) => ({ scheduleId: line.schedule.id, periodStart: line.periodStart, amount: line.amount })),
          },
        },
        tx,
      );
      return made;
    });
    return { invoices };
  }

  /** The unit, if the caller may bill it: 404 outside their billing view, 403 without create there. */
  private async billableUnit(client: Client, actor: Actor, unitId: string): Promise<BillableUnit> {
    const row = await client.units.findFirst({
      where: { location_id: unitId, society_id: actor.societyId },
      select: { location_id: true, locations: { select: { name: true, code: true, path: true, is_active: true } } },
    });
    if (!row || !actor.access.can('view', 'billing', { path: row.locations.path })) {
      throw new NotFoundException({ code: 'unit_not_found', message: 'Unit not found' });
    }
    if (!actor.access.can('create', 'billing', { path: row.locations.path })) throw beyondPermissions();
    return { id: row.location_id, name: row.locations.name, code: row.locations.code, path: row.locations.path, isActive: row.locations.is_active };
  }

  /** Who the unit's bills go to now, by name (for a preview with nothing to bill). */
  private async currentBillTo(societyId: string, unitId: string): Promise<string | null> {
    const unit = await this.prisma.locations.findFirst({ where: { id: unitId, society_id: societyId }, select: { path: true } });
    if (!unit) return null;
    const choice = (await this.billTo.choose(societyId, [{ id: unitId, path: unit.path }])).get(unitId);
    if (!choice) return null;
    return (await this.billTo.parties([choice.payer])).get(choice.payer.id)?.name ?? null;
  }

  // -------------------------------------------------------------------------

  /**
   * Bills what is due in one transaction and records the run. Returns the run's id, or null
   * for an automatic run with nothing due. An unexpected failure rolls everything back and
   * is recorded as a failed run.
   */
  private async run(societyId: string, month: string, trigger: BillingRunTrigger, userId: string | null, ip: string | null): Promise<string | null> {
    const startedAt = new Date();
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await lockBillingRun(tx, societyId);
          const plan = await this.plan(tx, societyId, month, { trigger });
          const billable = plan.schedules.filter((schedule) => !schedule.blocked);
          if (trigger === 'auto' && billable.length === 0) return null;

          const runId = randomUUID();
          await tx.billing_runs.create({
            data: { id: runId, society_id: societyId, period: day(monthStart(month)), trigger, status: 'done', started_by: userId, started_at: startedAt },
          });
          const made = await this.writeInvoices(tx, societyId, plan.lines, userId, runId);
          const total = addMoney('0', ...plan.lines.map((line) => line.amount));

          for (const schedule of billable) {
            const next = nextRunAfter(schedule, schedule.periods);
            await tx.charge_schedules.update({
              where: { id: schedule.id },
              data: next === null ? { next_run_on: null, status: 'ended' } : { next_run_on: day(next) },
            });
          }
          await tx.billing_runs.update({
            where: { id: runId },
            data: { invoice_count: made.length, total: new Prisma.Decimal(total), skipped: plan.skipped, finished_at: new Date() },
          });
          await this.audit.record(
            {
              societyId,
              userId,
              action: 'run',
              entityType: 'billing_run',
              entityId: runId,
              ip,
              after: {
                month,
                trigger,
                invoices: made.length,
                total,
                schedules: billable.map((schedule) => ({ id: schedule.id, periods: schedule.periods })),
                skipped: plan.skipped.length,
              },
            },
            tx,
          );
          return runId;
        },
        { timeout: RUN_TIMEOUT_MS, maxWait: RUN_TIMEOUT_MS },
      );
    } catch (error) {
      // Refusals (bad month, no permission) are answers, not failed runs.
      if (error instanceof HttpException) throw error;
      const failed = await this.prisma.billing_runs.create({
        data: {
          society_id: societyId,
          period: day(monthStart(month)),
          trigger,
          status: 'failed',
          started_by: userId,
          started_at: startedAt,
          finished_at: new Date(),
          error: (error as Error).message.slice(0, 2000) || 'Unknown error',
        },
        select: { id: true },
      });
      this.logger.error(`Billing run ${failed.id} failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Writes planned lines as bills: one per unit and fund, dated today and due after the
   * smallest `due_days` among its lines, bill-to as on the day, numbers reserved as a block.
   */
  private async writeInvoices(tx: Tx, societyId: string, lines: PlannedLine[], userId: string | null, runId: string | null) {
    const today = isoDate(todayDate());
    const invoices = [...groupInvoices(lines).values()];
    const snapshots = await this.billTo.snapshots(
      tx,
      societyId,
      invoices.map((group) => ({ unit: group[0]!.unit, choice: group[0]!.choice })),
    );
    const numbers = await this.numbering.reserve(tx, societyId, 'invoice', today, invoices.length);
    const invoiceRows: (Prisma.invoicesCreateManyInput & { id: string; total: Prisma.Decimal })[] = [];
    const lineRows: Prisma.invoice_linesCreateManyInput[] = [];
    invoices.forEach((group, index) => {
      const first = group[0]!;
      const snapshot = snapshots.get(first.unit.id)!;
      const id = randomUUID();
      const dueDays = Math.min(...group.map((line) => line.schedule.dueDays));
      invoiceRows.push({
        id,
        society_id: societyId,
        invoice_no: numbers[index]!.formatted,
        kind: 'regular',
        unit_id: first.unit.id,
        bill_to_person_id: snapshot.kind === 'person' ? snapshot.id : null,
        bill_to_organisation_id: snapshot.kind === 'organisation' ? snapshot.id : null,
        bill_to_snapshot: snapshot,
        fund_id: first.schedule.fundId,
        billing_run_id: runId,
        period_start: day(group.map((line) => line.periodStart).sort()[0]!),
        period_end: day(group.map((line) => line.periodEnd).sort().at(-1)!),
        issue_date: day(today),
        due_date: day(addDays(today, dueDays)),
        total: new Prisma.Decimal(addMoney(...group.map((line) => line.amount))),
        status: 'unpaid',
        created_by: userId,
      });
      group.forEach((line, position) =>
        lineRows.push({
          invoice_id: id,
          charge_type_id: line.schedule.chargeTypeId,
          schedule_id: line.schedule.id,
          unit_id: line.unit.id,
          period_start: day(line.periodStart),
          description: `${line.schedule.nameBn} (${periodLabel(line, 'bn')})`,
          description_en: `${line.schedule.nameEn ?? line.schedule.nameBn} (${periodLabel(line, 'en')})`,
          amount: new Prisma.Decimal(line.amount),
          position,
        }),
      );
    });
    if (invoiceRows.length) await tx.invoices.createMany({ data: invoiceRows });
    if (lineRows.length) await tx.invoice_lines.createMany({ data: lineRows });
    return invoiceRows.map((row) => ({ id: row.id, invoiceNo: row.invoice_no, total: row.total.toFixed(2) }));
  }

  /** What a run for `month` would bill now, and what it would leave out. Reads only. */
  private async plan(client: Client, societyId: string, month: string, { trigger, unitId }: PlanFor): Promise<Plan> {
    const upTo = monthStart(month);
    // Flat queries, one after another: inside a transaction they share one connection, and
    // nested relations would be loaded in parallel on it.
    const rows = await client.charge_schedules.findMany({
      where: {
        society_id: societyId,
        status: 'active',
        next_run_on: { lte: day(upTo) },
        ...(trigger === 'auto' ? { generation: 'auto' } : {}),
      },
      select: {
        id: true,
        name_bn: true,
        name_en: true,
        amount: true,
        frequency_months: true,
        unit_types: true,
        ends_on: true,
        next_run_on: true,
        due_days: true,
        charge_type_id: true,
        scope_location_id: true,
      },
      orderBy: [{ name_bn: 'asc' }, { id: 'asc' }],
    });
    const scheduleIds = rows.map((row) => row.id);
    const rateRows = scheduleIds.length
      ? await client.charge_schedule_rates.findMany({ where: { schedule_id: { in: scheduleIds } }, select: { schedule_id: true, location_id: true, amount: true } })
      : [];
    const types = new Map(
      (scheduleIds.length
        ? await client.charge_types.findMany({ where: { id: { in: rows.map((row) => row.charge_type_id) } }, select: { id: true, archived_at: true, fund_id: true } })
        : []
      ).map((type) => [type.id, type]),
    );
    const closedFunds = new Set(
      (types.size
        ? await client.funds.findMany({ where: { id: { in: [...types.values()].map((type) => type.fund_id) }, closed_at: { not: null } }, select: { id: true } })
        : []
      ).map((fund) => fund.id),
    );
    const scopes = new Map(
      (rows.some((row) => row.scope_location_id)
        ? await client.locations.findMany({ where: { id: { in: rows.flatMap((row) => row.scope_location_id ?? []) } }, select: { id: true, path: true } })
        : []
      ).map((loc) => [loc.id, loc.path]),
    );

    const schedules: (PlannedSchedule & { scopePath: string | null; unitTypes: string[]; amount: string; rates: Map<string, string> })[] = rows
      .map((row) => {
        const timing = { nextRunOn: isoDate(row.next_run_on!), frequencyMonths: row.frequency_months, endsOn: row.ends_on ? isoDate(row.ends_on) : null };
        return {
          id: row.id,
          nameBn: row.name_bn,
          nameEn: row.name_en,
          chargeTypeId: row.charge_type_id,
          fundId: types.get(row.charge_type_id)!.fund_id,
          ...timing,
          dueDays: row.due_days,
          periods: duePeriods(timing, upTo),
          blocked: types.get(row.charge_type_id)!.archived_at
            ? ('charge_type_archived' as const)
            : closedFunds.has(types.get(row.charge_type_id)!.fund_id)
              ? ('fund_closed' as const)
              : null,
          scopePath: row.scope_location_id ? (scopes.get(row.scope_location_id) ?? null) : null,
          unitTypes: row.unit_types,
          amount: row.amount.toFixed(2),
          rates: new Map(rateRows.filter((rate) => rate.schedule_id === row.id).map((rate) => [rate.location_id, rate.amount.toFixed(2)])),
        };
      })
      .filter((schedule) => schedule.periods.length > 0 || schedule.blocked);

    const active = schedules.filter((schedule) => !schedule.blocked);
    if (active.length === 0) return { month, schedules, lines: [], skipped: [], names: new Map() };

    const units = await client.units.findMany({
      where: { society_id: societyId, ...(unitId ? { location_id: unitId } : {}) },
      select: { location_id: true, unit_type: true, locations: { select: { name: true, code: true, path: true, is_active: true } } },
      orderBy: [{ locations: { path: 'asc' } }],
    });
    const billable: (BillableUnit & { unitType: string })[] = units.map((unit) => ({
      id: unit.location_id,
      name: unit.locations.name,
      code: unit.locations.code,
      path: unit.locations.path,
      isActive: unit.locations.is_active,
      unitType: unit.unit_type,
    }));
    const matches = (schedule: (typeof active)[number]) =>
      billable.filter(
        (unit) =>
          (schedule.scopePath === null || unit.path.startsWith(schedule.scopePath)) &&
          (schedule.unitTypes.length === 0 || schedule.unitTypes.includes(unit.unitType)),
      );
    const candidates = new Map(active.flatMap((schedule) => matches(schedule).map((unit) => [unit.id, unit] as const)));
    const live = [...candidates.values()].filter((unit) => unit.isActive);

    // One after another: inside a transaction they share one connection.
    const choices = await this.billTo.choose(societyId, live, client as Tx);
    const names = await this.tree.addressNames(societyId, [...candidates.values()].map((unit) => unit.path));
    const billed = await client.invoice_lines.findMany({
      where: {
        schedule_id: { in: active.map((schedule) => schedule.id) },
        period_start: { in: [...new Set(active.flatMap((schedule) => schedule.periods))].map(day) },
        unit_id: { in: live.map((unit) => unit.id) },
      },
      select: { schedule_id: true, unit_id: true, period_start: true },
    });
    // Rates may name locations outside any unit's address (the unit itself, a top level).
    const rateIds = [...new Set(active.flatMap((schedule) => [...schedule.rates.keys()]))].filter((id) => !names.has(id));
    if (rateIds.length) {
      for (const row of await client.locations.findMany({ where: { id: { in: rateIds } }, select: { id: true, name: true } })) names.set(row.id, row.name);
    }
    const done = new Set(billed.map((line) => `${line.schedule_id}|${line.unit_id}|${isoDate(line.period_start!)}`));

    const lines: PlannedLine[] = [];
    const skipped: SkippedUnit[] = [];
    const skip = (unit: BillableUnit, schedule: PlannedSchedule, reason: SkipReason) =>
      skipped.push({ unitId: unit.id, name: unit.name, address: addressOf(unit.path, names), reason, scheduleId: schedule.id });

    for (const schedule of active) {
      for (const unit of matches(schedule)) {
        if (!unit.isActive) {
          skip(unit, schedule, 'inactive');
          continue;
        }
        const choice = choices.get(unit.id);
        if (!choice) {
          skip(unit, schedule, 'no_bill_to');
          continue;
        }
        const rate = rateFor(pathIds(unit.path), schedule.rates, schedule.amount);
        let already = false;
        for (const periodStart of schedule.periods) {
          if (done.has(`${schedule.id}|${unit.id}|${periodStart}`)) {
            already = true;
            continue;
          }
          lines.push({
            unit,
            choice,
            schedule,
            periodStart,
            periodEnd: periodEndOf(periodStart, periodMonths(schedule.frequencyMonths)),
            amount: rate.amount,
            rateFrom: rate.from,
          });
        }
        if (already) skip(unit, schedule, 'already_billed');
      }
    }
    return { month, schedules, lines, skipped, names };
  }
}

const runSelect = {
  id: true,
  period: true,
  trigger: true,
  status: true,
  started_at: true,
  finished_at: true,
  invoice_count: true,
  total: true,
  skipped: true,
  error: true,
  users: { select: { phone: true, persons: { select: { full_name: true } } } },
} satisfies Prisma.billing_runsSelect;

function toRun(row: Prisma.billing_runsGetPayload<{ select: typeof runSelect }>): BillingRun {
  const skipped = skippedList.safeParse(row.skipped);
  return {
    id: row.id,
    month: monthOfDay(isoDate(row.period)),
    trigger: row.trigger === 'auto' ? 'auto' : 'manual',
    status: row.status === 'done' ? 'done' : 'failed',
    startedBy: nameOf(row.users),
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at?.toISOString() ?? null,
    invoiceCount: row.invoice_count,
    total: row.total.toFixed(2),
    skipped: skipped.success ? skipped.data : [],
    error: row.error,
  };
}

/** One bill per unit and fund, lines in schedule then period order. */
function groupInvoices(lines: PlannedLine[]): Map<string, PlannedLine[]> {
  const groups = new Map<string, PlannedLine[]>();
  for (const line of lines) {
    const key = `${line.unit.id}|${line.schedule.fundId}`;
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  return groups;
}

/** "অক্টো ২০২৬" or "অক্টো ২০২৬ – ডিসে ২০২৬", for the line's stored text. */
function periodLabel(line: Pick<PlannedLine, 'periodStart' | 'periodEnd'>, locale: 'bn' | 'en'): string {
  const from = formatDate(line.periodStart, locale, 'monthYear');
  const to = formatDate(line.periodEnd, locale, 'monthYear');
  return from === to ? from : `${from} – ${to}`;
}

/** Bill ahead goes from this month up to `MAX_BILL_AHEAD_MONTHS` after it. */
function aheadRange(month: string): void {
  const thisMonth = monthOfDay(isoDate(todayDate()));
  if (month < thisMonth || month > monthOfDay(addMonths(monthStart(thisMonth), MAX_BILL_AHEAD_MONTHS))) {
    throw new BadRequestException({ code: 'bill_ahead_range', message: `Only this month up to ${MAX_BILL_AHEAD_MONTHS} months ahead` });
  }
}

function notFuture(month: string): void {
  if (month > monthOfDay(isoDate(todayDate()))) throw new BadRequestException({ code: 'future_month', message: 'Only this month or earlier can be billed' });
}

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
