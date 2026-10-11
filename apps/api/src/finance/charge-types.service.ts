import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import { CHARGE_KINDS, type ChargeKind, type ChargeType, type ChargeTypeInput, type ChargeTypeList, type PermissionAction } from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { onlySocietyWide } from '../members/parties.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { fundClosed, toFundOption } from './funds.service.js';
import { lockFinanceSetup } from './numbering.service.js';
import { SettingsService } from './settings.service.js';

type Tx = Prisma.TransactionClient;

const select = {
  id: true,
  name_bn: true,
  name_en: true,
  kind: true,
  default_amount: true,
  archived_at: true,
  funds: { select: { id: true, name_bn: true, name_en: true, is_default: true } },
} satisfies Prisma.charge_typesSelect;
type Row = Prisma.charge_typesGetPayload<{ select: typeof select }>;

const toKind = (kind: string): ChargeKind => ((CHARGE_KINDS as readonly string[]).includes(kind) ? (kind as ChargeKind) : 'fee');

const toChargeType = (row: Row): ChargeType => ({
  id: row.id,
  nameBn: row.name_bn,
  nameEn: row.name_en,
  kind: toKind(row.kind),
  fund: toFundOption(row.funds),
  defaultAmount: row.default_amount?.toFixed(2) ?? null,
  archived: row.archived_at !== null,
});

/** What an audit row keeps of a charge type. */
const snapshot = (c: ChargeType) => ({ nameBn: c.nameBn, nameEn: c.nameEn, kind: c.kind, fundId: c.fund.id, defaultAmount: c.defaultAmount });

const notFound = () => new NotFoundException({ code: 'charge_type_not_found', message: 'Charge type not found' });

/**
 * What a bill line can be (`charge_types`): service charge, generator fee, a fine.
 * Society-wide setup: `billing` is an area-scoped module, so only a society-wide
 * billing role may change them. Never deleted, only retired.
 */
@Injectable()
export class ChargeTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  async list(societyId: string): Promise<ChargeTypeList> {
    const [rows, funds, separateFunds] = await Promise.all([
      this.prisma.charge_types.findMany({
        where: { society_id: societyId },
        select,
        orderBy: [{ archived_at: { sort: 'desc', nulls: 'first' } }, { name_bn: 'asc' }],
      }),
      this.prisma.funds.findMany({
        where: { society_id: societyId, closed_at: null },
        select: { id: true, name_bn: true, name_en: true, is_default: true },
        orderBy: [{ is_default: 'desc' }, { name_bn: 'asc' }],
      }),
      this.settings.separateFunds(societyId),
    ]);
    return {
      items: rows.map(toChargeType),
      funds: funds.filter((fund) => separateFunds || fund.is_default).map(toFundOption),
      separateFunds,
    };
  }

  async get(societyId: string, id: string, client: Pick<PrismaService, 'charge_types'> = this.prisma): Promise<ChargeType> {
    const row = await client.charge_types.findFirst({ where: { id, society_id: societyId }, select });
    if (!row) throw notFound();
    return toChargeType(row);
  }

  async create(actor: Actor, input: ChargeTypeInput): Promise<ChargeType> {
    societyWide(actor, 'create');
    const id = await this.write(async (tx) => {
      await lockFinanceSetup(tx, actor.societyId);
      await this.checkFund(tx, actor.societyId, input.fundId);
      const row = await tx.charge_types.create({ data: { ...toData(input), society_id: actor.societyId }, select: { id: true } });
      await this.audit.record({ ...auditOf(actor, 'create', row.id), after: input }, tx);
      return row.id;
    });
    return this.get(actor.societyId, id);
  }

  /** The whole charge type. Bills already made keep their own amounts and fund. */
  async update(actor: Actor, id: string, input: ChargeTypeInput): Promise<ChargeType> {
    societyWide(actor, 'edit');
    await this.write(async (tx) => {
      await lockFinanceSetup(tx, actor.societyId);
      const before = await this.get(actor.societyId, id, tx);
      if (input.fundId !== before.fund.id) await this.checkFund(tx, actor.societyId, input.fundId);
      await tx.charge_types.update({ where: { id }, data: toData(input) });
      await this.audit.record({ ...auditOf(actor, 'update', id), before: snapshot(before), after: input }, tx);
    });
    return this.get(actor.societyId, id);
  }

  /** Retires the charge type (no new bills use it) or brings it back. */
  async setArchived(actor: Actor, id: string, archived: boolean): Promise<ChargeType> {
    societyWide(actor, 'edit');
    await this.write(async (tx) => {
      await lockFinanceSetup(tx, actor.societyId);
      const before = await this.get(actor.societyId, id, tx);
      if (before.archived === archived) return;
      if (!archived) await this.checkFund(tx, actor.societyId, before.fund.id);
      await tx.charge_types.update({ where: { id }, data: { archived_at: archived ? new Date() : null } });
      await this.audit.record({ ...auditOf(actor, archived ? 'archive' : 'restore', id), before: snapshot(before) }, tx);
    });
    return this.get(actor.societyId, id);
  }

  /** The fund must be this society's, open, and the default one unless separate funds are on. */
  private async checkFund(tx: Tx, societyId: string, fundId: string): Promise<void> {
    const fund = await tx.funds.findFirst({ where: { id: fundId, society_id: societyId }, select: { is_default: true, closed_at: true } });
    if (!fund) throw new BadRequestException({ code: 'invalid_fund', message: 'Unknown fund' });
    if (fund.closed_at) throw fundClosed();
    if (!fund.is_default && !(await this.settings.separateFunds(societyId, tx))) {
      throw new BadRequestException({ code: 'invalid_fund', message: 'Only the default fund is in use' });
    }
  }

  private async write<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(work);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException({ code: 'charge_type_name_taken', message: 'Another charge type has this name' });
      throw error;
    }
  }
}

function societyWide(actor: Actor, action: PermissionAction) {
  if (actor.access.paths(action, 'billing') !== 'all') throw onlySocietyWide();
}

function toData(input: ChargeTypeInput) {
  return {
    name_bn: input.nameBn,
    name_en: input.nameEn,
    kind: input.kind,
    fund_id: input.fundId,
    default_amount: input.defaultAmount === null ? null : new Prisma.Decimal(input.defaultAmount),
  };
}

const auditOf = (actor: Actor, action: string, entityId: string) => ({
  societyId: actor.societyId,
  userId: actor.userId,
  action,
  entityType: 'charge_type',
  entityId,
  ip: actor.ip,
});
