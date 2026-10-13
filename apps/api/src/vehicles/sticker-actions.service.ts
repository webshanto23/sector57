import { ConflictException, ForbiddenException, HttpException, Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  formatStickerNo,
  renewalValidUntil,
  stickerValidUntil,
  type StickerIssueInput,
  type StickerReason,
  type StickerRenewResult,
  type StickerRevokeInput,
  type StickerRow,
  type StickerSettings,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { InvoicesService } from '../billing/invoices.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { NumberingService } from '../finance/numbering.service.js';
import { auditOf } from '../members/parties.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beyondPermissions } from '../property/tree.service.js';
import { stickerPlace, type StickerSelected } from './sticker-rows.js';
import { StickersService } from './stickers.service.js';
import { vehicleRemoved, VehiclesService } from './vehicles.service.js';

type Tx = Prisma.TransactionClient;
type Mint = { reason: StickerReason; replacesId: string | null; validUntil: string };
type Owner = { id: string; unitId: string; personId: string; regNo: string; path: string };

const conflict = (code: string, message: string) => new ConflictException({ code, message });
const stickerInForce = () => conflict('sticker_in_force', 'This vehicle already has a sticker; renew or replace it');
const stickerNotActive = () => conflict('sticker_not_active', 'This sticker has been revoked or replaced');
const stickerExpired = () => conflict('sticker_expired', 'This sticker has run out; renew it instead');
const feeNeedsBilling = () =>
  new ForbiddenException({ code: 'sticker_fee_needs_billing', message: 'Stickers carry a fee here, so issuing one needs permission to make bills at this unit' });

/** The last day of the month `day` falls in: when a sticker fee bill is due. */
const monthEnd = (day: string): string => {
  const [y, m] = day.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/**
 * Issuing, renewing, replacing and revoking stickers (`vehicles.create`, revoking `vehicles.edit`,
 * where the vehicle's unit is). A sticker goes only to a vehicle on file whose person still owns,
 * rents or lives in the unit. Each new sticker gets the next number under the society's prefix;
 * when the society charges a fee, the unit is billed in the same transaction.
 */
@Injectable()
export class StickerActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly invoices: InvoicesService,
    private readonly vehicles: VehiclesService,
    private readonly stickers: StickersService,
  ) {}

  /** A first sticker, or a new one after the last was revoked. 409 `sticker_in_force`, `vehicle_removed`, `vehicle_person_not_at_unit`. */
  async issue(actor: Actor, input: StickerIssueInput): Promise<StickerRow> {
    const vehicle = await this.vehicles.visible(actor, input.vehicleId);
    const owner: Owner = { id: vehicle.id, unitId: vehicle.units.locations.id, personId: vehicle.persons.id, regNo: vehicle.reg_no, path: vehicle.units.locations.path };
    if (!actor.access.can('create', 'vehicles', { path: owner.path })) throw beyondPermissions();
    if (vehicle.removed_at) throw vehicleRemoved();
    await this.vehicles.checkPerson(actor.societyId, { id: owner.unitId, path: owner.path }, owner.personId);
    const id = await this.write(actor, async (tx, settings, fiscalStartMonth) => {
      if (await tx.stickers.findFirst({ where: { vehicle_id: owner.id, status: 'active' }, select: { id: true } })) throw stickerInForce();
      const validUntil = stickerValidUntil(isoDate(todayDate()), settings.validity, fiscalStartMonth, input.nextYear);
      return this.mint(tx, actor, owner, settings, { reason: 'new', replacesId: null, validUntil });
    });
    return this.stickers.get(actor, id);
  }

  /** Next year's sticker for each one asked for; those that can't be renewed are skipped with the reason. */
  async renew(actor: Actor, stickerIds: string[]): Promise<StickerRenewResult> {
    const result: StickerRenewResult = { renewed: [], skipped: [] };
    for (const stickerId of new Set(stickerIds)) {
      try {
        result.renewed.push(await this.renewOne(actor, stickerId));
      } catch (error) {
        if (!(error instanceof HttpException)) throw error;
        const body = error.getResponse() as { code?: string };
        result.skipped.push({ stickerId, code: body.code ?? 'error' });
      }
    }
    return result;
  }

  /** Lost or damaged: the old one is marked replaced and a new number goes on to the same last day. 409 `sticker_expired`. */
  async replace(actor: Actor, id: string): Promise<StickerRow> {
    const old = await this.takeable(actor, id);
    if (isoDate(old.valid_until) < isoDate(todayDate())) throw stickerExpired();
    const newId = await this.write(actor, (tx, settings) => this.takeOver(tx, actor, old, settings, { reason: 'replacement', replacesId: old.id, validUntil: isoDate(old.valid_until) }));
    return this.stickers.get(actor, newId);
  }

  /** 409 `sticker_not_active`. */
  async revoke(actor: Actor, id: string, input: StickerRevokeInput): Promise<StickerRow> {
    const row = await this.stickers.visible(actor, id);
    if (!actor.access.can('edit', 'vehicles', { path: stickerPlace(row).path })) throw beyondPermissions();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.stickers.updateMany({ where: { id, status: 'active' }, data: { status: 'revoked', revoked_at: new Date(), revoke_reason: input.reason } });
      if (count === 0) throw stickerNotActive();
      await this.audit.record({ ...auditOf(actor, 'sticker', 'revoke', id), before: { status: 'active' }, after: { status: 'revoked', reason: input.reason } }, tx);
    });
    return this.stickers.get(actor, id);
  }

  private async renewOne(actor: Actor, id: string): Promise<StickerRow> {
    const old = await this.takeable(actor, id);
    const newId = await this.write(actor, (tx, settings, fiscalStartMonth) => {
      const validUntil = renewalValidUntil(isoDate(old.valid_until), isoDate(todayDate()), settings.validity, fiscalStartMonth);
      return this.takeOver(tx, actor, old, settings, { reason: 'renewal', replacesId: old.id, validUntil });
    });
    return this.stickers.get(actor, newId);
  }

  /** A sticker the caller may take over (renew or replace): seen, `vehicles.create` there, still active, its vehicle on file and its person still at the unit. */
  private async takeable(actor: Actor, id: string): Promise<StickerSelected> {
    const row = await this.stickers.visible(actor, id);
    const unit = stickerPlace(row);
    if (!actor.access.can('create', 'vehicles', { path: unit.path })) throw beyondPermissions();
    if (row.status !== 'active') throw stickerNotActive();
    if (row.vehicles.removed_at) throw vehicleRemoved();
    await this.vehicles.checkPerson(actor.societyId, { id: unit.id, path: unit.path }, row.vehicles.person_id);
    return row;
  }

  /** Marks the old sticker replaced (only if still active) and mints the one that takes over. */
  private async takeOver(tx: Tx, actor: Actor, old: StickerSelected, settings: StickerSettings, mint: Mint): Promise<string> {
    const { count } = await tx.stickers.updateMany({ where: { id: old.id, status: 'active' }, data: { status: 'replaced' } });
    if (count === 0) throw stickerNotActive();
    const unit = stickerPlace(old);
    const owner: Owner = { id: old.vehicles.id, unitId: unit.id, personId: old.vehicles.person_id, regNo: old.vehicles.reg_no, path: unit.path };
    return this.mint(tx, actor, owner, settings, mint);
  }

  /** Numbers, bills (when there is a fee) and saves one new sticker, with its audit row. */
  private async mint(tx: Tx, actor: Actor, vehicle: Owner, settings: StickerSettings, mint: Mint): Promise<string> {
    const today = isoDate(todayDate());
    if (settings.fee && !actor.access.can('create', 'billing', { path: vehicle.path })) throw feeNeedsBilling();
    const number = await this.numbering.next(tx, actor.societyId, 'sticker', today);
    const stickerNo = formatStickerNo(settings.prefix, number.no);
    const invoice = settings.fee
      ? await this.invoices.issueUnitBillIn(tx, actor, vehicle.unitId, monthEnd(today), [
          {
            chargeTypeId: settings.fee.chargeTypeId,
            amount: settings.fee.amount,
            description: `গাড়ির স্টিকার ${stickerNo} (${vehicle.regNo})`,
            descriptionEn: `Vehicle sticker ${stickerNo} (${vehicle.regNo})`,
          },
        ])
      : null;
    const made = await tx.stickers.create({
      data: {
        society_id: actor.societyId,
        sticker_no: stickerNo,
        vehicle_id: vehicle.id,
        valid_until: new Date(`${mint.validUntil}T00:00:00.000Z`),
        reason: mint.reason,
        replaces_id: mint.replacesId,
        invoice_id: invoice?.id ?? null,
        issued_by: actor.userId,
      },
      select: { id: true },
    });
    await this.audit.record(
      {
        ...auditOf(actor, 'sticker', mint.reason === 'new' ? 'issue' : mint.reason === 'renewal' ? 'renew' : 'replace', made.id),
        after: { stickerNo, vehicleId: vehicle.id, validUntil: mint.validUntil, replacesId: mint.replacesId, invoiceNo: invoice?.invoiceNo ?? null },
      },
      tx,
    );
    return made.id;
  }

  /** Runs a sticker write with the settings in force; two stickers in force for one vehicle at once is 409 `sticker_in_force`. */
  private async write(actor: Actor, work: (tx: Tx, settings: StickerSettings, fiscalStartMonth: number) => Promise<string>): Promise<string> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { settings, fiscalStartMonth } = await this.stickers.config(actor.societyId, tx);
        return work(tx, settings, fiscalStartMonth);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw stickerInForce();
      throw error;
    }
  }
}
