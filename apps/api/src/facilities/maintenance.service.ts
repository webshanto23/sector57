import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  dueBy,
  MAX_ASSET_PLANS,
  monthsAfter,
  toAssetStatus,
  type AssetDetail,
  type MaintenanceDoneInput,
  type MaintenanceDue,
  type MaintenanceDueQuery,
  type MaintenancePlanCreateInput,
  type MaintenancePlanUpdateInput,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { placeSelect, MemberRowsService } from '../members/member-rows.service.js';
import { auditOf, dayOf } from '../members/parties.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { locationNotFound } from '../property/tree.service.js';
import { AssetsService, futureDate } from './assets.service.js';
import { ACTIVE_ASSET } from './facilities.service.js';

const planNotFound = () => new NotFoundException({ code: 'plan_not_found', message: 'Upkeep plan not found' });

/** Most rows the "maintenance due" list carries. */
const DUE_LIMIT = 500;

const planSelect = { id: true, asset_id: true, task_bn: true, task_en: true, every_months: true, next_due_on: true, last_done_on: true } satisfies Prisma.asset_maintenance_plansSelect;
type PlanRow = Prisma.asset_maintenance_plansGetPayload<{ select: typeof planSelect }>;

const toPlan = (row: PlanRow) => ({
  id: row.id,
  task: { bn: row.task_bn, en: row.task_en },
  everyMonths: row.every_months,
  nextDueOn: isoDate(row.next_due_on),
  lastDoneOn: row.last_done_on ? isoDate(row.last_done_on) : null,
});

const snapshot = (row: PlanRow) => ({
  assetId: row.asset_id,
  taskBn: row.task_bn,
  taskEn: row.task_en,
  everyMonths: row.every_months,
  nextDueOn: isoDate(row.next_due_on),
  lastDoneOn: row.last_done_on ? isoDate(row.last_done_on) : null,
});

/**
 * Upkeep plans of assets: a task every few months. Changing them needs `facilities.edit`
 * where the asset is kept (and the asset in use or under repair). Done moves the next due
 * day on from the day it was done; a plan never done may be removed, one done is stopped.
 */
@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly assets: AssetsService,
    private readonly rows: MemberRowsService,
  ) {}

  /** 409 `too_many_plans`. */
  async add(actor: Actor, assetId: string, input: MaintenancePlanCreateInput): Promise<AssetDetail> {
    await this.assets.editable(actor, assetId);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${`asset-plans:${assetId}`}, 0))`;
      const open = await tx.asset_maintenance_plans.count({ where: { asset_id: assetId, archived_at: null } });
      if (open >= MAX_ASSET_PLANS) throw new ConflictException({ code: 'too_many_plans', message: `At most ${MAX_ASSET_PLANS} upkeep plans per asset` });
      const made = await tx.asset_maintenance_plans.create({
        data: {
          society_id: actor.societyId,
          asset_id: assetId,
          task_bn: input.taskBn,
          task_en: input.taskEn,
          every_months: input.everyMonths,
          next_due_on: dayOf(input.nextDueOn),
          created_by: actor.userId,
        },
        select: planSelect,
      });
      await this.audit.record({ ...auditOf(actor, 'asset_plan', 'create', made.id), after: snapshot(made) }, tx);
    });
    return this.assets.get(actor, assetId);
  }

  async update(actor: Actor, planId: string, input: MaintenancePlanUpdateInput): Promise<AssetDetail> {
    const before = await this.editable(actor, planId);
    await this.prisma.$transaction(async (tx) => {
      const after = await tx.asset_maintenance_plans.update({
        where: { id: planId },
        data: {
          task_bn: input.taskBn,
          task_en: input.taskEn,
          every_months: input.everyMonths,
          next_due_on: input.nextDueOn ? dayOf(input.nextDueOn) : undefined,
        },
        select: planSelect,
      });
      await this.audit.record({ ...auditOf(actor, 'asset_plan', 'update', planId), before: snapshot(before), after: snapshot(after) }, tx);
    });
    return this.assets.get(actor, before.asset_id);
  }

  /** Removes a plan never done; stops (archives) one that was, so its history stays. */
  async remove(actor: Actor, planId: string): Promise<AssetDetail> {
    const plan = await this.editable(actor, planId);
    await this.prisma.$transaction(async (tx) => {
      if (plan.last_done_on) await tx.asset_maintenance_plans.update({ where: { id: planId }, data: { archived_at: new Date() } });
      else await tx.asset_maintenance_plans.delete({ where: { id: planId } });
      await this.audit.record({ ...auditOf(actor, 'asset_plan', plan.last_done_on ? 'stop' : 'delete', planId), before: snapshot(plan) }, tx);
    });
    return this.assets.get(actor, plan.asset_id);
  }

  /**
   * Done on a day: not in the future (400 `future_date`), not before the last time
   * (400 `done_before_last`). The next due day becomes `everyMonths` after it.
   */
  async done(actor: Actor, planId: string, input: MaintenanceDoneInput): Promise<AssetDetail> {
    const plan = await this.editable(actor, planId);
    if (input.doneOn > isoDate(todayDate())) throw futureDate();
    if (plan.last_done_on && input.doneOn < isoDate(plan.last_done_on)) {
      throw new BadRequestException({ code: 'done_before_last', message: 'It was last done after that day' });
    }
    const next = monthsAfter(input.doneOn, plan.every_months);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.asset_maintenance_plans.updateMany({
        where: { id: planId, archived_at: null, next_due_on: plan.next_due_on },
        data: { last_done_on: dayOf(input.doneOn), next_due_on: dayOf(next) },
      });
      if (count === 0) throw new ConflictException({ code: 'plan_changed', message: 'Someone changed this plan just now; reload' });
      await this.assets.event(tx, actor, plan.asset_id, 'maintenance', { task: plan.task_bn, doneOn: input.doneOn }, input.note);
      await this.audit.record(
        { ...auditOf(actor, 'asset_plan', 'done', planId), before: snapshot(plan), after: { doneOn: input.doneOn, nextDueOn: next, note: input.note } },
        tx,
      );
    });
    return this.assets.get(actor, plan.asset_id);
  }

  /** Open plans of assets in use or under repair, due within `within` days or overdue, soonest first. */
  async due(actor: Actor, query: MaintenanceDueQuery): Promise<MaintenanceDue> {
    const today = isoDate(todayDate());
    const assetWhere: Prisma.assetsWhereInput[] = [this.assets.scope(actor), ACTIVE_ASSET];
    if (query.areaId) {
      const area = await this.prisma.locations.findFirst({ where: { id: query.areaId, society_id: actor.societyId }, select: { path: true } });
      if (!area || !actor.access.can('view', 'facilities', area)) throw locationNotFound();
      assetWhere.push({ locations: { path: { startsWith: area.path } } });
    }
    const rows = await this.prisma.asset_maintenance_plans.findMany({
      where: { archived_at: null, next_due_on: { lte: dayOf(dueBy(today, query.within)) }, assets: { AND: assetWhere } },
      select: {
        ...planSelect,
        assets: {
          select: {
            id: true,
            asset_no: true,
            name_bn: true,
            name_en: true,
            status: true,
            facilities: { select: { name_bn: true, name_en: true } },
            locations: { select: placeSelect },
            staff: { select: { id: true, staff_no: true, persons: { select: { full_name: true, full_name_en: true } } } },
          },
        },
      },
      orderBy: [{ next_due_on: 'asc' }, { id: 'asc' }],
      take: DUE_LIMIT + 1,
    });
    const kept = rows.slice(0, DUE_LIMIT);
    const place = await this.rows.places(actor.societyId, kept.map((row) => row.assets.locations));
    return {
      today,
      items: kept.map((row) => {
        const asset = row.assets;
        return {
          plan: toPlan(row),
          asset: {
            id: asset.id,
            assetNo: asset.asset_no,
            name: { bn: asset.name_bn, en: asset.name_en },
            status: toAssetStatus(asset.status),
            facility: asset.facilities ? { bn: asset.facilities.name_bn, en: asset.facilities.name_en } : null,
            place: place(asset.locations),
            custodian: asset.staff
              ? { id: asset.staff.id, staffNo: asset.staff.staff_no, name: asset.staff.persons.full_name, nameEn: asset.staff.persons.full_name_en }
              : null,
          },
          canMark: actor.access.can('edit', 'facilities', { path: asset.locations.path }),
        };
      }),
      truncated: rows.length > DUE_LIMIT,
    };
  }

  /** An open plan whose asset the caller may change (404 otherwise; 403, 409 `asset_gone` from the asset). */
  private async editable(actor: Actor, planId: string): Promise<PlanRow> {
    const plan = await this.prisma.asset_maintenance_plans.findFirst({ where: { id: planId, society_id: actor.societyId, archived_at: null }, select: planSelect });
    if (!plan) throw planNotFound();
    await this.assets.visible(actor, plan.asset_id).catch(() => {
      throw planNotFound();
    });
    await this.assets.editable(actor, plan.asset_id);
    return plan;
  }
}
