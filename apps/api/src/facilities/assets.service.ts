import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  asciiDigits,
  assetNumberOf,
  assetStatusMoves,
  dueBy,
  digitVariants,
  formatDocumentNo,
  isAssetGone,
  toAssetStatus,
  type AssetCreateInput,
  type AssetCsvQuery,
  type AssetDetail,
  type AssetEventDetail,
  type AssetEventKind,
  type AssetList,
  type AssetListQuery,
  type AssetOptions,
  type AssetPlaceInput,
  type AssetRow,
  type AssetStatusInput,
  type AssetUpdateInput,
  type CustodianList,
  type CustodianQuery,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { mediaUrl, thumbKey } from '../common/media.js';
import { ENV, type Env } from '../config/env.js';
import { NumberingService } from '../finance/numbering.service.js';
import { placeSelect, MemberRowsService } from '../members/member-rows.service.js';
import { auditOf, dayOf } from '../members/parties.service.js';
import { scopeWhere } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beyondPermissions, pathIds } from '../property/tree.service.js';
import { staffNotFound } from '../staff/staff.service.js';
import { MediaService } from '../storage/media.service.js';
import { ACTIVE_ASSET, FacilitiesService, facilityArchived } from './facilities.service.js';

type Tx = Prisma.TransactionClient;

export const assetNotFound = () => new NotFoundException({ code: 'asset_not_found', message: 'Asset not found' });
export const assetGone = () => new ConflictException({ code: 'asset_gone', message: 'This asset is retired or lost' });
export const futureDate = () => new BadRequestException({ code: 'future_date', message: 'That day has not come yet' });
const vendorNotFound = () => new NotFoundException({ code: 'vendor_not_found', message: 'Vendor not found' });
const expenseNotFound = () => new NotFoundException({ code: 'expense_not_found', message: 'No paid expense has this voucher number' });

/** Most rows a CSV carries; most history events a detail shows; most custodians a search returns. */
const CSV_LIMIT = 5000;
const HISTORY_LIMIT = 100;
const CUSTODIAN_LIMIT = 20;

const userName = { select: { id: true, phone: true, persons: { select: { full_name: true } } } } as const;
const staffName = { select: { id: true, staff_no: true, persons: { select: { full_name: true, full_name_en: true } } } } as const;

const assetSelect = {
  id: true,
  asset_no: true,
  name_bn: true,
  name_en: true,
  category: true,
  status: true,
  photo_url: true,
  facilities: { select: { id: true, name_bn: true, name_en: true } },
  locations: { select: placeSelect },
  staff: staffName,
  plans: { where: { archived_at: null }, select: { next_due_on: true }, orderBy: { next_due_on: 'asc' }, take: 1 },
} satisfies Prisma.assetsSelect;
type Selected = Prisma.assetsGetPayload<{ select: typeof assetSelect }>;

const detailSelect = {
  ...assetSelect,
  purchased_on: true,
  purchase_cost: true,
  warranty_until: true,
  retired_on: true,
  retired_reason: true,
  note: true,
  created_at: true,
  vendors: { select: { id: true, name: true } },
  expenses: { select: { id: true, voucher_no: true, amount: true } },
} satisfies Prisma.assetsSelect;
export type AssetDetailRow = Prisma.assetsGetPayload<{ select: typeof detailSelect }>;

type StaffName = Prisma.staffGetPayload<typeof staffName>;
const custodianOf = (row: StaffName | null) =>
  row ? { id: row.id, staffNo: row.staff_no, name: row.persons.full_name, nameEn: row.persons.full_name_en } : null;

/** Where an asset goes, resolved and checked. */
type ResolvedPlace = { facilityId: string | null; locationId: string; label: string };

/** What an audit row keeps of an asset. */
const snapshot = (row: AssetDetailRow) => ({
  assetNo: row.asset_no,
  nameBn: row.name_bn,
  nameEn: row.name_en,
  category: row.category,
  facilityId: row.facilities?.id ?? null,
  locationId: row.locations.id,
  custodianStaffId: row.staff?.id ?? null,
  purchasedOn: row.purchased_on ? isoDate(row.purchased_on) : null,
  purchaseCost: row.purchase_cost?.toFixed(2) ?? null,
  vendorId: row.vendors?.id ?? null,
  expenseId: row.expenses?.id ?? null,
  warrantyUntil: row.warranty_until ? isoDate(row.warranty_until) : null,
  status: row.status,
  note: row.note,
});

/**
 * Assets (`facilities` permission, area-scoped through where each one is kept). Numbered
 * `AST-NNNN` when saved; never deleted, only retired or lost (with `facilities.approve`).
 * Every change is audited and also written to the asset's own history (`asset_events`).
 */
@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly facilities: FacilitiesService,
    private readonly rows: MemberRowsService,
    private readonly numbering: NumberingService,
    private readonly media: MediaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async list(actor: Actor, query: AssetListQuery): Promise<AssetList> {
    const { page, pageSize } = query;
    const scope = this.scope(actor);
    const where = await this.where(actor, query);
    const soon = dayOf(dueBy(isoDate(todayDate())));
    const [rows, total, statuses, due, categories] = await Promise.all([
      this.prisma.assets.findMany({ where, select: assetSelect, orderBy: [{ asset_no: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.assets.count({ where }),
      this.prisma.assets.groupBy({ by: ['status'], where: { AND: [scope, ACTIVE_ASSET] }, _count: { _all: true } }),
      this.prisma.asset_maintenance_plans.count({ where: { archived_at: null, next_due_on: { lte: soon }, assets: { AND: [scope, ACTIVE_ASSET] } } }),
      this.categories(scope),
    ]);
    const count = (status: string) => statuses.find((row) => row.status === status)?._count._all ?? 0;
    return {
      items: await this.toRows(actor.societyId, rows),
      total,
      page,
      pageSize,
      counts: { inUse: count('in_use'), repair: count('repair'), due },
      categories,
      can: { create: actor.access.can('create', 'facilities'), export: actor.access.can('export', 'facilities') },
    };
  }

  /** The list's rows without paging (for the CSV), with purchase details. */
  async all(actor: Actor, query: AssetCsvQuery): Promise<{ rows: (AssetRow & { purchasedOn: string | null; purchaseCost: string | null })[]; truncated: boolean }> {
    const where = await this.where(actor, query);
    const rows = await this.prisma.assets.findMany({
      where,
      select: { ...assetSelect, purchased_on: true, purchase_cost: true },
      orderBy: [{ asset_no: 'asc' }],
      take: CSV_LIMIT + 1,
    });
    const kept = rows.slice(0, CSV_LIMIT);
    const shown = await this.toRows(actor.societyId, kept);
    return {
      rows: shown.map((row, i) => ({
        ...row,
        purchasedOn: kept[i]!.purchased_on ? isoDate(kept[i]!.purchased_on!) : null,
        purchaseCost: kept[i]!.purchase_cost?.toFixed(2) ?? null,
      })),
      truncated: rows.length > CSV_LIMIT,
    };
  }

  async get(actor: Actor, id: string): Promise<AssetDetail> {
    const row = await this.visible(actor, id);
    const { access } = actor;
    const at = { path: row.locations.path };
    const status = toAssetStatus(row.status);
    const [plans, events] = await Promise.all([
      this.prisma.asset_maintenance_plans.findMany({
        where: { asset_id: id, archived_at: null },
        select: { id: true, task_bn: true, task_en: true, every_months: true, next_due_on: true, last_done_on: true },
        orderBy: [{ next_due_on: 'asc' }, { created_at: 'asc' }],
      }),
      this.prisma.asset_events.findMany({
        where: { asset_id: id },
        select: { id: true, kind: true, detail: true, note: true, created_at: true, users: userName },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: HISTORY_LIMIT,
      }),
    ]);
    const [shown] = await this.toRows(actor.societyId, [row]);
    return {
      ...shown!,
      photoUrl: mediaUrl(row.photo_url, this.env.MEDIA_BASE_URL),
      purchasedOn: row.purchased_on ? isoDate(row.purchased_on) : null,
      purchaseCost: row.purchase_cost?.toFixed(2) ?? null,
      vendor: row.vendors,
      expense: row.expenses
        ? { id: row.expenses.id, voucherNo: row.expenses.voucher_no, amount: row.expenses.amount.toFixed(2), open: access.can('view', 'expenses') }
        : null,
      warrantyUntil: row.warranty_until ? isoDate(row.warranty_until) : null,
      retiredOn: row.retired_on ? isoDate(row.retired_on) : null,
      retiredReason: row.retired_reason,
      note: row.note,
      plans: plans.map((plan) => ({
        id: plan.id,
        task: { bn: plan.task_bn, en: plan.task_en },
        everyMonths: plan.every_months,
        nextDueOn: isoDate(plan.next_due_on),
        lastDoneOn: plan.last_done_on ? isoDate(plan.last_done_on) : null,
      })),
      history: events.map((event) => ({
        id: event.id,
        kind: event.kind as AssetEventKind,
        detail: (event.detail ?? {}) as AssetEventDetail,
        note: event.note,
        by: event.users ? { id: event.users.id, name: event.users.persons?.full_name ?? event.users.phone } : null,
        at: event.created_at.toISOString(),
      })),
      createdAt: row.created_at.toISOString(),
      can: {
        edit: access.can('edit', 'facilities', at) && !isAssetGone(status),
        statuses: assetStatusMoves(status)
          .filter((move) => access.can(move.needs, 'facilities', at))
          .map((move) => move.to),
      },
    };
  }

  /** 404 `facility_not_found`, `location_not_found`, `staff_not_found`, `vendor_not_found`, `expense_not_found`; 409 `facility_archived`. */
  async create(actor: Actor, input: AssetCreateInput): Promise<AssetDetail> {
    const place = await this.placeFor(actor, input.place, 'create');
    const custodian = input.custodianStaffId ? await this.custodian(actor, input.custodianStaffId) : null;
    if (input.vendorId) await this.checkVendor(actor.societyId, input.vendorId);
    const expenseId = input.expenseVoucherNo ? await this.expenseId(actor.societyId, input.expenseVoucherNo) : null;
    const id = await this.prisma.$transaction(async (tx) => {
      const number = await this.numbering.next(tx, actor.societyId, 'asset', isoDate(todayDate()));
      const made = await tx.assets.create({
        data: {
          society_id: actor.societyId,
          asset_no: number.formatted,
          name_bn: input.nameBn,
          name_en: input.nameEn,
          category: input.category,
          facility_id: place.facilityId,
          location_id: place.locationId,
          custodian_staff_id: custodian?.id ?? null,
          purchased_on: input.purchasedOn ? dayOf(input.purchasedOn) : null,
          purchase_cost: input.purchaseCost,
          vendor_id: input.vendorId,
          expense_id: expenseId,
          warranty_until: input.warrantyUntil ? dayOf(input.warrantyUntil) : null,
          note: input.note,
          created_by: actor.userId,
        },
        select: detailSelect,
      });
      await this.event(tx, actor, made.id, 'created', { place: place.label, ...(custodian ? { custodian: custodian.name } : {}) });
      await this.audit.record({ ...auditOf(actor, 'asset', 'create', made.id), after: snapshot(made) }, tx);
      return made.id;
    });
    return this.get(actor, id);
  }

  /** Not while retired or lost (409 `asset_gone`). A new place needs `facilities.edit` there too. */
  async update(actor: Actor, id: string, input: AssetUpdateInput): Promise<AssetDetail> {
    const before = await this.editable(actor, id);
    const moves =
      input.place !== undefined && (input.place.facilityId !== (before.facilities?.id ?? null) || (input.place.facilityId === null && input.place.locationId !== before.locations.id));
    const place = moves ? await this.placeFor(actor, input.place!, 'edit') : null;
    const changesCustodian = input.custodianStaffId !== undefined && input.custodianStaffId !== (before.staff?.id ?? null);
    const custodian = changesCustodian && input.custodianStaffId ? await this.custodian(actor, input.custodianStaffId) : null;
    if (input.vendorId && input.vendorId !== before.vendors?.id) await this.checkVendor(actor.societyId, input.vendorId);
    const expenseId =
      input.expenseVoucherNo === undefined ? undefined : input.expenseVoucherNo === null ? null : await this.expenseId(actor.societyId, input.expenseVoucherNo);
    const purchasedOn = input.purchasedOn !== undefined ? input.purchasedOn : before.purchased_on ? isoDate(before.purchased_on) : null;
    const warrantyUntil = input.warrantyUntil !== undefined ? input.warrantyUntil : before.warranty_until ? isoDate(before.warranty_until) : null;
    if (purchasedOn && warrantyUntil && warrantyUntil < purchasedOn) {
      throw new BadRequestException({ code: 'warranty_before_purchase', message: 'The warranty ends before the purchase' });
    }

    await this.prisma.$transaction(async (tx) => {
      const after = await tx.assets.update({
        where: { id },
        data: {
          name_bn: input.nameBn,
          name_en: input.nameEn,
          category: input.category,
          facility_id: place ? place.facilityId : undefined,
          location_id: place ? place.locationId : undefined,
          custodian_staff_id: changesCustodian ? (custodian?.id ?? null) : undefined,
          purchased_on: input.purchasedOn === undefined ? undefined : input.purchasedOn ? dayOf(input.purchasedOn) : null,
          purchase_cost: input.purchaseCost,
          vendor_id: input.vendorId,
          expense_id: expenseId,
          warranty_until: input.warrantyUntil === undefined ? undefined : input.warrantyUntil ? dayOf(input.warrantyUntil) : null,
          note: input.note,
        },
        select: detailSelect,
      });
      const was = snapshot(before);
      const now = snapshot(after);
      const fields = (Object.keys(now) as (keyof typeof now)[]).filter(
        (key) => !['facilityId', 'locationId', 'custodianStaffId', 'status', 'assetNo'].includes(key) && now[key] !== was[key],
      );
      if (place) await this.event(tx, actor, id, 'moved', { place: place.label });
      if (changesCustodian) await this.event(tx, actor, id, 'custodian', { custodian: custodian?.name ?? null });
      if (fields.length > 0) await this.event(tx, actor, id, 'updated', { fields });
      await this.audit.record({ ...auditOf(actor, 'asset', 'update', id), before: was, after: now }, tx);
    });
    return this.get(actor, id);
  }

  /**
   * In use ⇄ under repair with `facilities.edit`; retiring, losing, or putting a retired or lost
   * asset back with `facilities.approve`. 409 `asset_status_same`, `asset_status_invalid`;
   * 400 `future_date`.
   */
  async setStatus(actor: Actor, id: string, input: AssetStatusInput): Promise<AssetDetail> {
    const row = await this.visible(actor, id);
    const from = toAssetStatus(row.status);
    if (input.status === from) throw new ConflictException({ code: 'asset_status_same', message: 'The asset already has this status' });
    const move = assetStatusMoves(from).find((candidate) => candidate.to === input.status);
    if (!move) throw new ConflictException({ code: 'asset_status_invalid', message: 'A retired or lost asset can only be put back in use' });
    if (!actor.access.can(move.needs, 'facilities', { path: row.locations.path })) throw beyondPermissions();
    const gone = isAssetGone(input.status);
    if (gone && input.on! > isoDate(todayDate())) throw futureDate();

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.assets.updateMany({
        where: { id, status: from },
        data: { status: input.status, retired_on: gone ? dayOf(input.on!) : null, retired_reason: gone ? input.reason : null },
      });
      if (count === 0) throw new ConflictException({ code: 'asset_status_changed', message: 'Someone changed this asset just now; reload' });
      await this.event(tx, actor, id, 'status', { status: input.status, ...(gone ? { on: input.on! } : {}) }, input.reason);
      await this.audit.record(
        { ...auditOf(actor, 'asset', 'status', id), before: { status: from }, after: { status: input.status, on: gone ? input.on : null, reason: input.reason } },
        tx,
      );
    });
    return this.get(actor, id);
  }

  async setPhoto(actor: Actor, id: string, upload: Buffer): Promise<AssetDetail> {
    await this.editable(actor, id);
    const key = await this.media.saveImage(actor.societyId, 'assets', upload);
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

  async removePhoto(actor: Actor, id: string): Promise<AssetDetail> {
    await this.editable(actor, id);
    const old = await this.replacePhoto(actor, id, null);
    await this.media.removeQuietly(actor.societyId, [old]);
    return this.get(actor, id);
  }

  /** What the asset form offers: facilities in use in the caller's area, categories, vendors. */
  async options(actor: Actor): Promise<AssetOptions> {
    const [facilities, categories, vendors] = await Promise.all([
      this.prisma.facilities.findMany({
        where: { AND: [this.facilities.scope(actor), { archived_at: null }] },
        select: { id: true, name_bn: true, name_en: true, locations: { select: placeSelect } },
        orderBy: [{ name_bn: 'asc' }],
      }),
      this.categories(this.scope(actor)),
      this.prisma.vendors.findMany({ where: { society_id: actor.societyId, archived_at: null }, select: { id: true, name: true }, orderBy: [{ name: 'asc' }] }),
    ]);
    const place = await this.rows.places(actor.societyId, facilities.map((row) => row.locations));
    return {
      facilities: facilities.map((row) => {
        const shown = place(row.locations);
        return { id: row.id, name: { bn: row.name_bn, en: row.name_en }, place: [...shown.address, shown.name].join(', ') };
      }),
      categories,
      vendors,
    };
  }

  /**
   * Current staff the caller may hand assets to: posted inside the caller's `facilities`
   * create or edit area, or above it. Names and designations only.
   */
  async custodians(actor: Actor, query: CustodianQuery): Promise<CustodianList> {
    const filters: Prisma.staffWhereInput[] = [this.custodianScope(actor)];
    if (query.q) {
      const terms = digitVariants(query.q);
      const numbers = [...new Set(terms.map((term) => asciiDigits(term)))].filter((term) => /^\d{1,9}$/.test(term));
      filters.push({
        OR: [
          ...terms.flatMap((term) => [
            { persons: { full_name: { contains: term, mode: 'insensitive' as const } } },
            { persons: { full_name_en: { contains: term, mode: 'insensitive' as const } } },
            { designation_bn: { contains: term, mode: 'insensitive' as const } },
          ]),
          ...numbers.map((value) => ({ staff_no: Number(value) })),
        ],
      });
    }
    const rows = await this.prisma.staff.findMany({
      where: { AND: filters },
      select: { ...staffName.select, designation_bn: true, designation_en: true },
      orderBy: [{ staff_no: 'asc' }],
      take: CUSTODIAN_LIMIT,
    });
    return { items: rows.map((row) => ({ ...custodianOf(row)!, designation: { bn: row.designation_bn, en: row.designation_en } })) };
  }

  /**
   * What the caller may do with an asset's papers in the documents library: see them
   * (`facilities.view` where it is kept) and change them (`facilities.edit` there). Null when
   * the asset is not in the society.
   */
  async paperRights(actor: Actor, id: string): Promise<{ view: boolean; edit: boolean } | null> {
    const row = await this.prisma.assets.findFirst({ where: { id, society_id: actor.societyId }, select: { locations: { select: { path: true } } } });
    if (!row) return null;
    const at = { path: row.locations.path };
    return { view: actor.access.can('view', 'facilities', at), edit: actor.access.can('edit', 'facilities', at) };
  }

  /** An asset the caller may see where it is kept, or 404. */
  async visible(actor: Actor, id: string): Promise<AssetDetailRow> {
    const row = await this.prisma.assets.findFirst({ where: { id, society_id: actor.societyId }, select: detailSelect });
    if (!row || !actor.access.can('view', 'facilities', { path: row.locations.path })) throw assetNotFound();
    return row;
  }

  /** An asset the caller may change: seen (404), `facilities.edit` there (403), not retired or lost (409 `asset_gone`). */
  async editable(actor: Actor, id: string): Promise<AssetDetailRow> {
    const row = await this.visible(actor, id);
    if (!actor.access.can('edit', 'facilities', { path: row.locations.path })) throw beyondPermissions();
    if (isAssetGone(toAssetStatus(row.status))) throw assetGone();
    return row;
  }

  /** Asset rows in the caller's `facilities.view` area. */
  scope(actor: Actor): Prisma.assetsWhereInput {
    return { society_id: actor.societyId, locations: scopeWhere(actor.access, 'view', 'facilities', (prefix) => ({ path: { startsWith: prefix } })) };
  }

  /** Writes one history event (inside the change's transaction). */
  async event(tx: Tx, actor: Actor, assetId: string, kind: AssetEventKind, detail: AssetEventDetail, note: string | null = null): Promise<void> {
    await tx.asset_events.create({ data: { society_id: actor.societyId, asset_id: assetId, kind, detail, note, created_by: actor.userId } });
  }

  async toRows(societyId: string, rows: Selected[]): Promise<AssetRow[]> {
    const place = await this.rows.places(societyId, rows.map((row) => row.locations));
    return rows.map((row) => ({
      id: row.id,
      assetNo: row.asset_no,
      name: { bn: row.name_bn, en: row.name_en },
      category: row.category,
      facility: row.facilities ? { id: row.facilities.id, name: { bn: row.facilities.name_bn, en: row.facilities.name_en } } : null,
      place: place(row.locations),
      custodian: custodianOf(row.staff),
      status: toAssetStatus(row.status),
      thumbUrl: mediaUrl(thumbKey(row.photo_url), this.env.MEDIA_BASE_URL),
      nextDueOn: row.plans[0] ? isoDate(row.plans[0].next_due_on) : null,
    }));
  }

  private async where(actor: Actor, query: AssetCsvQuery): Promise<Prisma.assetsWhereInput> {
    const filters: Prisma.assetsWhereInput[] = [this.scope(actor)];
    if (query.state === 'active') filters.push(ACTIVE_ASSET);
    else if (query.state !== 'all') filters.push({ status: query.state });
    if (query.category) filters.push({ category: query.category });
    if (query.facilityId) {
      await this.facilities.visible(actor, query.facilityId);
      filters.push({ facility_id: query.facilityId });
    }
    if (query.areaId) {
      const area = await this.prisma.locations.findFirst({ where: { id: query.areaId, society_id: actor.societyId }, select: { path: true } });
      if (!area || !actor.access.can('view', 'facilities', area)) throw new NotFoundException({ code: 'location_not_found', message: 'Location not found' });
      filters.push({ locations: { path: { startsWith: area.path } } });
    }
    if (query.q) {
      const terms = digitVariants(query.q);
      const numbers = [...new Set(terms.map((term) => assetNumberOf(asciiDigits(term))))].filter((no): no is number => no !== null);
      filters.push({
        OR: [
          ...terms.flatMap((term) => [
            { name_bn: { contains: term, mode: 'insensitive' as const } },
            { name_en: { contains: term, mode: 'insensitive' as const } },
            { category: { contains: term, mode: 'insensitive' as const } },
          ]),
          ...numbers.map((no) => ({ asset_no: formatDocumentNo('asset', '', no) })),
        ],
      });
    }
    return { AND: filters };
  }

  private async categories(scope: Prisma.assetsWhereInput): Promise<string[]> {
    const rows = await this.prisma.assets.groupBy({ by: ['category'], where: scope, orderBy: { category: 'asc' } });
    return rows.map((row) => row.category);
  }

  /** Resolves where an asset goes: a facility in use that the caller may `action` at, or a place. */
  private async placeFor(actor: Actor, input: AssetPlaceInput, action: 'create' | 'edit'): Promise<ResolvedPlace> {
    if (input.facilityId) {
      const facility = await this.facilities.visible(actor, input.facilityId);
      if (facility.archived_at) throw facilityArchived();
      if (!actor.access.can(action, 'facilities', { path: facility.locations.path })) throw beyondPermissions();
      return { facilityId: facility.id, locationId: facility.locations.id, label: await this.facilities.label(actor.societyId, facility.locations) };
    }
    const place = await this.facilities.placeAt(actor, input.locationId!, action);
    return { facilityId: null, locationId: place.id, label: await this.facilities.label(actor.societyId, place) };
  }

  /** Current staff posted inside the caller's create or edit area, or above it. */
  private custodianScope(actor: Actor): Prisma.staffWhereInput {
    const create = actor.access.paths('create', 'facilities');
    const edit = actor.access.paths('edit', 'facilities');
    const base: Prisma.staffWhereInput = { society_id: actor.societyId, left_on: null };
    if (create === 'all' || edit === 'all') return base;
    const paths = [...new Set([...create, ...edit])];
    const above = [...new Set(paths.flatMap((path) => pathIds(path).slice(0, -1)))];
    return { ...base, OR: [...paths.map((path) => ({ locations: { path: { startsWith: path } } })), { posted_location_id: { in: above } }] };
  }

  /** A custodian the caller may pick (404 `staff_not_found` otherwise). */
  private async custodian(actor: Actor, staffId: string): Promise<{ id: string; name: string }> {
    const row = await this.prisma.staff.findFirst({ where: { AND: [this.custodianScope(actor), { id: staffId }] }, select: staffName.select });
    if (!row) throw staffNotFound();
    return { id: row.id, name: row.persons.full_name };
  }

  private async checkVendor(societyId: string, vendorId: string): Promise<void> {
    const vendor = await this.prisma.vendors.findFirst({ where: { id: vendorId, society_id: societyId, archived_at: null }, select: { id: true } });
    if (!vendor) throw vendorNotFound();
  }

  /** The paid expense with this voucher number (404 `expense_not_found`). */
  private async expenseId(societyId: string, voucherNo: string): Promise<string> {
    const expense = await this.prisma.expenses.findFirst({
      where: { society_id: societyId, voucher_no: asciiDigits(voucherNo).toUpperCase().replace(/\s+/g, ''), status: 'paid' },
      select: { id: true },
    });
    if (!expense) throw expenseNotFound();
    return expense.id;
  }

  private replacePhoto(actor: Actor, id: string, key: string | null): Promise<string | null> {
    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.assets.findUniqueOrThrow({ where: { id }, select: { photo_url: true } });
      await tx.assets.update({ where: { id }, data: { photo_url: key } });
      await this.event(tx, actor, id, 'photo', {});
      await this.audit.record({ ...auditOf(actor, 'asset', key ? 'photo' : 'remove_photo', id) }, tx);
      return asset.photo_url;
    });
  }
}
