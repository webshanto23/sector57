import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  digitVariants,
  toFacilityKind,
  type FacilityCreateInput,
  type FacilityDetail,
  type FacilityFunds,
  type FacilityList,
  type FacilityListQuery,
  type FacilityRow,
  type FacilityUpdateInput,
  type PermissionAction,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { fundClosed, fundNotFound } from '../finance/funds.service.js';
import { SettingsService } from '../finance/settings.service.js';
import { placeSelect, MemberRowsService } from '../members/member-rows.service.js';
import { auditOf } from '../members/parties.service.js';
import { scopeWhere } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beyondPermissions, locationNotFound, TreeService, type LocationRow } from '../property/tree.service.js';

type Tx = Prisma.TransactionClient;

export const facilityNotFound = () => new NotFoundException({ code: 'facility_not_found', message: 'Facility not found' });
export const facilityArchived = () => new ConflictException({ code: 'facility_archived', message: 'This facility is archived' });
const nameTaken = () => new ConflictException({ code: 'facility_name_taken', message: 'Another facility in use has this name' });
const separateFundsOff = () => new ConflictException({ code: 'separate_funds_off', message: 'Turn on separate facility funds first' });
const fundDefault = () => new ConflictException({ code: 'fund_default', message: 'The default fund is not a facility fund' });

/** Assets that still count at a facility: in use or under repair. */
export const ACTIVE_ASSET = { status: { in: ['in_use', 'repair'] } } satisfies Prisma.assetsWhereInput;

const facilitySelect = {
  id: true,
  name_bn: true,
  name_en: true,
  kind: true,
  bookable: true,
  note: true,
  archived_at: true,
  created_at: true,
  locations: { select: placeSelect },
  funds: { select: { id: true, name_bn: true, name_en: true } },
  _count: { select: { assets: { where: ACTIVE_ASSET } } },
} satisfies Prisma.facilitiesSelect;
type Selected = Prisma.facilitiesGetPayload<{ select: typeof facilitySelect }>;

const snapshot = (row: Selected) => ({
  nameBn: row.name_bn,
  nameEn: row.name_en,
  kind: row.kind,
  locationId: row.locations.id,
  bookable: row.bookable,
  fundId: row.funds?.id ?? null,
  note: row.note,
});

/**
 * Facilities (`facilities` permission, area-scoped through where each one is). Archived,
 * never deleted; a facility moved elsewhere takes the assets kept there along. Its own fund
 * only while separate facility funds are on. Every change is audited here.
 */
@Injectable()
export class FacilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tree: TreeService,
    private readonly rows: MemberRowsService,
    private readonly settings: SettingsService,
  ) {}

  async list(actor: Actor, query: FacilityListQuery): Promise<FacilityList> {
    const { page, pageSize } = query;
    const filters: Prisma.facilitiesWhereInput[] = [this.scope(actor), { archived_at: query.state === 'archived' ? { not: null } : null }];
    if (query.kind) filters.push({ kind: query.kind });
    if (query.q) {
      filters.push({
        OR: digitVariants(query.q).flatMap((term) => [
          { name_bn: { contains: term, mode: 'insensitive' as const } },
          { name_en: { contains: term, mode: 'insensitive' as const } },
        ]),
      });
    }
    const where: Prisma.facilitiesWhereInput = { AND: filters };
    const [rows, total] = await Promise.all([
      this.prisma.facilities.findMany({ where, select: facilitySelect, orderBy: [{ name_bn: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.facilities.count({ where }),
    ]);
    return { items: await this.toRows(actor.societyId, rows), total, page, pageSize, can: { create: actor.access.can('create', 'facilities') } };
  }

  async get(actor: Actor, id: string): Promise<FacilityDetail> {
    const row = await this.visible(actor, id);
    const at = { path: row.locations.path };
    const edit = actor.access.can('edit', 'facilities', at);
    const [shown] = await this.toRows(actor.societyId, [row]);
    return {
      ...shown!,
      note: row.note,
      createdAt: row.created_at.toISOString(),
      can: {
        edit: edit && row.archived_at === null,
        archive: edit,
        addAsset: actor.access.can('create', 'facilities', at) && row.archived_at === null,
      },
    };
  }

  /** 409 `facility_name_taken`, `separate_funds_off`, `fund_default`, `fund_closed`. */
  async create(actor: Actor, input: FacilityCreateInput): Promise<FacilityDetail> {
    const place = await this.placeAt(actor, input.locationId, 'create');
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        if (input.fundId) await this.checkFund(tx, actor.societyId, input.fundId);
        const made = await tx.facilities.create({
          data: {
            society_id: actor.societyId,
            location_id: place.id,
            name_bn: input.nameBn,
            name_en: input.nameEn,
            kind: input.kind,
            bookable: input.bookable,
            fund_id: input.fundId,
            note: input.note,
            created_by: actor.userId,
          },
          select: facilitySelect,
        });
        await this.audit.record({ ...auditOf(actor, 'facility', 'create', made.id), after: snapshot(made) }, tx);
        return made.id;
      });
      return this.get(actor, id);
    } catch (error) {
      throw isUniqueViolation(error) ? nameTaken() : error;
    }
  }

  /**
   * Not while archived (409 `facility_archived`). A new place needs `facilities.edit` there
   * too, and the assets kept at the facility move with it (each gets a "moved" event).
   */
  async update(actor: Actor, id: string, input: FacilityUpdateInput): Promise<FacilityDetail> {
    const before = await this.editable(actor, id);
    if (before.archived_at) throw facilityArchived();
    const place = input.locationId && input.locationId !== before.locations.id ? await this.placeAt(actor, input.locationId, 'edit') : null;
    const label = place ? await this.label(actor.societyId, place) : null;
    try {
      await this.prisma.$transaction(async (tx) => {
        if (input.fundId && input.fundId !== before.funds?.id) await this.checkFund(tx, actor.societyId, input.fundId);
        const after = await tx.facilities.update({
          where: { id },
          data: {
            location_id: place?.id,
            name_bn: input.nameBn,
            name_en: input.nameEn,
            kind: input.kind,
            bookable: input.bookable,
            fund_id: input.fundId,
            note: input.note,
          },
          select: facilitySelect,
        });
        if (place && label !== null) {
          const moved = await tx.assets.findMany({ where: { facility_id: id }, select: { id: true } });
          await tx.assets.updateMany({ where: { facility_id: id }, data: { location_id: place.id } });
          if (moved.length > 0) {
            await tx.asset_events.createMany({
              data: moved.map((asset) => ({
                society_id: actor.societyId,
                asset_id: asset.id,
                kind: 'moved',
                detail: { place: label },
                created_by: actor.userId,
              })),
            });
          }
        }
        await this.audit.record({ ...auditOf(actor, 'facility', 'update', id), before: snapshot(before), after: snapshot(after) }, tx);
      });
    } catch (error) {
      throw isUniqueViolation(error) ? nameTaken() : error;
    }
    return this.get(actor, id);
  }

  /**
   * Archive (`archived: true`) or bring back. Archiving needs every asset there retired, lost
   * or moved first (409 `facility_has_assets`); bringing back fails on a name now in use.
   */
  async archive(actor: Actor, id: string, archived: boolean): Promise<FacilityDetail> {
    await this.editable(actor, id);
    try {
      await this.prisma.$transaction(async (tx) => {
        if (archived) {
          const kept = await tx.assets.count({ where: { facility_id: id, ...ACTIVE_ASSET } });
          if (kept > 0) throw new ConflictException({ code: 'facility_has_assets', message: 'Move or retire the assets kept here first' });
        }
        const { count } = await tx.facilities.updateMany({
          where: { id, archived_at: archived ? null : { not: null } },
          data: { archived_at: archived ? new Date() : null },
        });
        if (count === 0) {
          throw archived
            ? facilityArchived()
            : new ConflictException({ code: 'facility_not_archived', message: 'This facility is not archived' });
        }
        await this.audit.record({ ...auditOf(actor, 'facility', archived ? 'archive' : 'restore', id) }, tx);
      });
    } catch (error) {
      throw isUniqueViolation(error) ? nameTaken() : error;
    }
    return this.get(actor, id);
  }

  /** Funds a facility may take: open, not the default, and only while separate funds are on. */
  async funds(actor: Actor): Promise<FacilityFunds> {
    const separateFunds = await this.settings.separateFunds(actor.societyId);
    if (!separateFunds) return { separateFunds, funds: [] };
    const rows = await this.prisma.funds.findMany({
      where: { society_id: actor.societyId, is_default: false, closed_at: null },
      select: { id: true, name_bn: true, name_en: true },
      orderBy: [{ name_bn: 'asc' }],
    });
    return { separateFunds, funds: rows.map((row) => ({ id: row.id, name: { bn: row.name_bn, en: row.name_en } })) };
  }

  /** A facility the caller may see at its place, or 404. */
  async visible(actor: Actor, id: string): Promise<Selected> {
    const row = await this.prisma.facilities.findFirst({ where: { id, society_id: actor.societyId }, select: facilitySelect });
    if (!row || !actor.access.can('view', 'facilities', { path: row.locations.path })) throw facilityNotFound();
    return row;
  }

  /** Facilities rows in the caller's `facilities.view` area. */
  scope(actor: Actor, action: PermissionAction = 'view'): Prisma.facilitiesWhereInput {
    return { society_id: actor.societyId, locations: scopeWhere(actor.access, action, 'facilities', (prefix) => ({ path: { startsWith: prefix } })) };
  }

  /**
   * A place something goes on: one the caller sees (404) and may `action` facilities at (403).
   * Shared with assets kept straight on a location.
   */
  async placeAt(actor: Actor, locationId: string, action: 'create' | 'edit'): Promise<LocationRow> {
    const place = await this.tree.find(actor.societyId, locationId);
    if (!place || !(actor.access.can('view', 'facilities', { path: place.path }) || actor.access.can('view', 'locations', { path: place.path }))) {
      throw locationNotFound();
    }
    if (!actor.access.can(action, 'facilities', { path: place.path })) throw beyondPermissions();
    return place;
  }

  /** A place as one line, top first ("ব্লক সি, রোড ৪"), for asset history. */
  async label(societyId: string, place: { id: string; name: string; path: string }): Promise<string> {
    const shown = await this.rows.places(societyId, [{ ...place, location_levels: { is_unit_level: false } }]);
    const { address, name } = shown({ ...place, location_levels: { is_unit_level: false } });
    return [...address, name].join(', ');
  }

  private async editable(actor: Actor, id: string): Promise<Selected> {
    const row = await this.visible(actor, id);
    if (!actor.access.can('edit', 'facilities', { path: row.locations.path })) throw beyondPermissions();
    return row;
  }

  private async checkFund(tx: Tx, societyId: string, fundId: string): Promise<void> {
    if (!(await this.settings.separateFunds(societyId, tx))) throw separateFundsOff();
    const fund = await tx.funds.findFirst({ where: { id: fundId, society_id: societyId }, select: { is_default: true, closed_at: true } });
    if (!fund) throw fundNotFound();
    if (fund.is_default) throw fundDefault();
    if (fund.closed_at) throw fundClosed();
  }

  private async toRows(societyId: string, rows: Selected[]): Promise<FacilityRow[]> {
    const place = await this.rows.places(societyId, rows.map((row) => row.locations));
    return rows.map((row) => ({
      id: row.id,
      name: { bn: row.name_bn, en: row.name_en },
      kind: toFacilityKind(row.kind),
      place: place(row.locations),
      bookable: row.bookable,
      fund: row.funds ? { id: row.funds.id, name: { bn: row.funds.name_bn, en: row.funds.name_en } } : null,
      assets: row._count.assets,
      archivedAt: row.archived_at?.toISOString() ?? null,
    }));
  }
}
