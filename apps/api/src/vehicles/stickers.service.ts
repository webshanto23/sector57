import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  digitVariants,
  regNoKey,
  stickerSettingsOf,
  VEHICLE_STICKERS_KEY,
  type StickerCsvQuery,
  type StickerList,
  type StickerListQuery,
  type StickerRow,
  type StickerSettings,
  type StickerSettingsView,
  type StickerSheet,
  type VehicleKind,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { SettingsService } from '../finance/settings.service.js';
import { MemberRowsService } from '../members/member-rows.service.js';
import { auditOf } from '../members/parties.service.js';
import { scopeWhere } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { stickerPlace, stickerRowOf, stickerSelect, type StickerSelected } from './sticker-rows.js';

type Client = Pick<PrismaService, 'society_settings' | 'societies'>;

const CSV_LIMIT = 5000;

export const stickerNotFound = () => new NotFoundException({ code: 'sticker_not_found', message: 'Sticker not found' });

/**
 * Stickers as read (`vehicles` permission where the vehicle's unit is): lists, the CSV, the A4
 * sheet, and the `vehicle_stickers` setting. Issuing and the rest are in `StickerActionsService`.
 */
@Injectable()
export class StickersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rows: MemberRowsService,
    private readonly settings: SettingsService,
  ) {}

  async list(actor: Actor, query: StickerListQuery): Promise<StickerList> {
    const { page, pageSize } = query;
    const today = todayDate();
    const scope = this.scope(actor);
    const where: Prisma.stickersWhereInput = { AND: [scope, ...this.filters(query, today)] };
    const [rows, total, active, expired] = await Promise.all([
      this.prisma.stickers.findMany({ where, select: stickerSelect, orderBy: [{ issued_at: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.stickers.count({ where }),
      this.prisma.stickers.count({ where: { AND: [scope, { status: 'active', valid_until: { gte: today } }] } }),
      this.prisma.stickers.count({ where: { AND: [scope, { status: 'active', valid_until: { lt: today } }] } }),
    ]);
    return {
      items: await this.toRows(actor.societyId, rows),
      total,
      page,
      pageSize,
      counts: { active, expired },
      can: { issue: actor.access.can('create', 'vehicles'), export: actor.access.can('export', 'vehicles') },
    };
  }

  /** Every sticker the list's filters match, by number, for the CSV. */
  async all(actor: Actor, query: StickerCsvQuery): Promise<{ rows: StickerRow[]; truncated: boolean }> {
    const where: Prisma.stickersWhereInput = { AND: [this.scope(actor), ...this.filters(query, todayDate())] };
    const rows = await this.prisma.stickers.findMany({ where, select: stickerSelect, orderBy: [{ sticker_no: 'asc' }], take: CSV_LIMIT + 1 });
    return { rows: await this.toRows(actor.societyId, rows.slice(0, CSV_LIMIT)), truncated: rows.length > CSV_LIMIT };
  }

  async get(actor: Actor, id: string): Promise<StickerRow> {
    const [row] = await this.toRows(actor.societyId, [await this.visible(actor, id)]);
    return row!;
  }

  /** The stickers asked for that the caller sees and that are in force today, by number, with the society's header. */
  async sheet(actor: Actor, ids: string[]): Promise<StickerSheet> {
    const [header, rows] = await Promise.all([
      this.settings.receiptHeader(actor.societyId),
      this.prisma.stickers.findMany({
        where: { AND: [this.scope(actor), { id: { in: ids }, status: 'active', valid_until: { gte: todayDate() } }] },
        select: stickerSelect,
        orderBy: [{ sticker_no: 'asc' }],
      }),
    ]);
    const place = await this.rows.places(actor.societyId, rows.map(stickerPlace));
    return {
      header,
      items: rows.map((row) => ({
        stickerNo: row.sticker_no,
        regNo: row.vehicles.reg_no,
        kind: row.vehicles.kind as VehicleKind,
        place: place(stickerPlace(row)),
        validUntil: isoDate(row.valid_until),
      })),
    };
  }

  /** The sticker setting in force and the society's fiscal year start. */
  async config(societyId: string, client: Client = this.prisma): Promise<{ settings: StickerSettings; fiscalStartMonth: number }> {
    // One after the other: inside a transaction they share one connection.
    const row = await client.society_settings.findUnique({ where: { society_id_key: { society_id: societyId, key: VEHICLE_STICKERS_KEY } }, select: { value: true } });
    const society = await client.societies.findUniqueOrThrow({ where: { id: societyId }, select: { fiscal_year_start_month: true } });
    return { settings: stickerSettingsOf(row?.value), fiscalStartMonth: society.fiscal_year_start_month };
  }

  async settingsView(actor: Actor): Promise<StickerSettingsView> {
    return { settings: (await this.config(actor.societyId)).settings, can: { edit: actor.access.can('edit', 'settings') } };
  }

  /** Saves the prefix, validity and fee; stickers already issued keep theirs. 400 `invalid_charge_type`, `charge_type_archived`. */
  async setSettings(actor: Actor, input: StickerSettings): Promise<StickerSettingsView> {
    if (input.fee) {
      const type = await this.prisma.charge_types.findFirst({ where: { id: input.fee.chargeTypeId, society_id: actor.societyId }, select: { archived_at: true } });
      if (!type) throw new BadRequestException({ code: 'invalid_charge_type', message: 'Unknown charge type' });
      if (type.archived_at) throw new BadRequestException({ code: 'charge_type_archived', message: 'This charge type is no longer used' });
    }
    await this.prisma.$transaction(async (tx) => {
      const before = (await this.config(actor.societyId, tx)).settings;
      await tx.society_settings.upsert({
        where: { society_id_key: { society_id: actor.societyId, key: VEHICLE_STICKERS_KEY } },
        update: { value: input, updated_by: actor.userId, updated_at: new Date() },
        create: { society_id: actor.societyId, key: VEHICLE_STICKERS_KEY, value: input, updated_by: actor.userId },
      });
      await this.audit.record({ ...auditOf(actor, 'setting', 'update', null), before: { [VEHICLE_STICKERS_KEY]: before }, after: { [VEHICLE_STICKERS_KEY]: input } }, tx);
    });
    return this.settingsView(actor);
  }

  /** A sticker the caller may see where its vehicle's unit is, or 404. */
  async visible(actor: Actor, id: string): Promise<StickerSelected> {
    const row = await this.prisma.stickers.findFirst({ where: { id, society_id: actor.societyId }, select: stickerSelect });
    if (!row || !actor.access.can('view', 'vehicles', { path: stickerPlace(row).path })) throw stickerNotFound();
    return row;
  }

  /** Sticker rows in the caller's `vehicles.view` area. */
  scope(actor: Actor): Prisma.stickersWhereInput {
    return {
      society_id: actor.societyId,
      vehicles: { units: { locations: scopeWhere(actor.access, 'view', 'vehicles', (prefix) => ({ path: { startsWith: prefix } })) } },
    };
  }

  async toRows(societyId: string, rows: StickerSelected[]): Promise<StickerRow[]> {
    const place = await this.rows.places(societyId, rows.map(stickerPlace));
    const today = isoDate(todayDate());
    return rows.map((row) => stickerRowOf(row, place(stickerPlace(row)), today));
  }

  private filters(query: StickerCsvQuery, today: Date): Prisma.stickersWhereInput[] {
    const filters: Prisma.stickersWhereInput[] = [];
    if (query.state === 'active') filters.push({ status: 'active', valid_until: { gte: today } });
    if (query.state === 'expired') filters.push({ status: 'active', valid_until: { lt: today } });
    if (query.state === 'revoked' || query.state === 'replaced') filters.push({ status: query.state });
    if (query.validUntilBy) filters.push({ valid_until: { lte: new Date(`${query.validUntilBy}T00:00:00.000Z`) } });
    if (query.locationId) filters.push({ vehicles: { units: { locations: { path: { contains: `/${query.locationId}/` } } } } });
    if (query.q) {
      const key = regNoKey(query.q);
      filters.push({
        OR: [
          ...digitVariants(query.q).map((term) => ({ sticker_no: { contains: term, mode: 'insensitive' as const } })),
          ...(key.length >= 2 ? [{ vehicles: { reg_key: { contains: key } } }] : []),
        ],
      });
    }
    return filters;
  }
}
