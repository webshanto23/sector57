import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  addMoney,
  isZeroMoney,
  subtractMoney,
  type Fund,
  type FundInput,
  type FundList,
  type FundOption,
  type LedgerAccount,
  type OpeningInput,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { lockFinanceSetup } from './numbering.service.js';
import { SettingsService } from './settings.service.js';

type Tx = Prisma.TransactionClient;
type Client = Pick<PrismaService, 'funds' | 'ledger_entries'>;

export const fundNotFound = () => new NotFoundException({ code: 'fund_not_found', message: 'Fund not found' });
const nameTaken = () => new ConflictException({ code: 'fund_name_taken', message: 'Another fund has this name' });

const fundSelect = { id: true, name_bn: true, name_en: true, is_default: true, closed_at: true } satisfies Prisma.fundsSelect;
type FundRow = Prisma.fundsGetPayload<{ select: typeof fundSelect }>;

export const toFundOption = (row: Pick<FundRow, 'id' | 'name_bn' | 'name_en' | 'is_default'>): FundOption => ({
  id: row.id,
  nameBn: row.name_bn,
  nameEn: row.name_en,
  isDefault: row.is_default,
});

/** Opening rows still in force: not a reversal themselves and not reversed since. */
const liveOpening = { source_type: 'opening', reverses_id: null, reversed_by: { is: null } } satisfies Prisma.ledger_entriesWhereInput;

/**
 * Funds (`funds`) and what the ledger says they hold. The default fund always exists
 * (seeded); others exist only while the society keeps separate facility funds. A fund
 * is never deleted: it is closed once it holds nothing.
 */
@Injectable()
export class FundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  async list(societyId: string): Promise<FundList> {
    const [rows, separateFunds] = await Promise.all([
      this.prisma.funds.findMany({
        where: { society_id: societyId },
        select: fundSelect,
        orderBy: [{ is_default: 'desc' }, { closed_at: { sort: 'desc', nulls: 'first' } }, { name_bn: 'asc' }],
      }),
      this.settings.separateFunds(societyId),
    ]);
    const ids = rows.map((row) => row.id);
    const [balances, openings, others] = await Promise.all([
      this.prisma.ledger_entries.groupBy({
        by: ['fund_id', 'account', 'direction'],
        where: { society_id: societyId, fund_id: { in: ids } },
        _sum: { amount: true },
      }),
      this.prisma.ledger_entries.findMany({
        where: { society_id: societyId, fund_id: { in: ids }, ...liveOpening },
        select: { fund_id: true, account: true, amount: true, entry_date: true },
      }),
      this.prisma.ledger_entries.groupBy({
        by: ['fund_id'],
        where: { society_id: societyId, fund_id: { in: ids }, source_type: { not: 'opening' } },
        _count: { _all: true },
      }),
    ]);

    const items = rows.map((row): Fund => {
      const sum = (account: LedgerAccount) => {
        const of = (direction: string) =>
          balances.find((b) => b.fund_id === row.id && b.account === account && b.direction === direction)?._sum.amount?.toFixed(2) ?? '0';
        return subtractMoney(of('in'), of('out'));
      };
      const cash = sum('cash');
      const bank = sum('bank');
      const opening = openings.filter((entry) => entry.fund_id === row.id);
      const openingOf = (account: LedgerAccount) => addMoney(...opening.filter((e) => e.account === account).map((e) => e.amount.toFixed(2)));
      return {
        ...toFundOption(row),
        closedAt: row.closed_at?.toISOString() ?? null,
        balance: { cash, bank, total: addMoney(cash, bank) },
        opening: opening.length ? { date: isoDate(opening[0]!.entry_date), cash: openingOf('cash'), bank: openingOf('bank') } : null,
        openingEditable: row.closed_at === null && !others.some((group) => group.fund_id === row.id),
      };
    });
    return { items, separateFunds };
  }

  async get(societyId: string, id: string): Promise<Fund> {
    const fund = (await this.list(societyId)).items.find((item) => item.id === id);
    if (!fund) throw fundNotFound();
    return fund;
  }

  /** A new fund, only while separate facility funds are on. */
  async create(actor: Actor, input: FundInput): Promise<Fund> {
    const id = await this.write(async (tx) => {
      await lockFinanceSetup(tx, actor.societyId);
      if (!(await this.settings.separateFunds(actor.societyId, tx))) {
        throw new ConflictException({ code: 'separate_funds_off', message: 'Turn on separate facility funds first' });
      }
      const row = await tx.funds.create({
        data: { society_id: actor.societyId, name_bn: input.nameBn, name_en: input.nameEn },
        select: { id: true },
      });
      await this.audit.record({ ...auditOf(actor, 'create', row.id), after: input }, tx);
      return row.id;
    });
    return this.get(actor.societyId, id);
  }

  async rename(actor: Actor, id: string, input: FundInput): Promise<Fund> {
    const before = await this.row(this.prisma, actor.societyId, id);
    await this.write(async (tx) => {
      await tx.funds.update({ where: { id }, data: { name_bn: input.nameBn, name_en: input.nameEn } });
      await this.audit.record({ ...auditOf(actor, 'update', id), before: { nameBn: before.name_bn, nameEn: before.name_en }, after: input }, tx);
    });
    return this.get(actor.societyId, id);
  }

  /** Closes a fund that holds nothing and that no active charge type still bills into. */
  async close(actor: Actor, id: string): Promise<Fund> {
    await this.write(async (tx) => {
      await lockFinanceSetup(tx, actor.societyId);
      const fund = await this.row(tx, actor.societyId, id);
      if (fund.is_default) throw new ConflictException({ code: 'fund_default', message: 'The default fund stays open' });
      if (fund.closed_at) throw fundClosed();
      if (!(await this.isEmpty(tx, id))) throw new ConflictException({ code: 'fund_not_empty', message: 'The fund still holds money' });
      const charges = await tx.charge_types.count({ where: { fund_id: id, archived_at: null } });
      if (charges > 0) throw new ConflictException({ code: 'fund_in_use', message: 'Charge types still bill into this fund' });
      await tx.funds.update({ where: { id }, data: { closed_at: new Date() } });
      await this.audit.record({ ...auditOf(actor, 'close', id), before: { nameBn: fund.name_bn } }, tx);
    });
    return this.get(actor.societyId, id);
  }

  /**
   * Sets what the fund held when the society started using the system: one `opening`
   * row per account above zero. It can be corrected until any other entry reaches the
   * fund; a correction writes reversing rows for the earlier opening, never edits it.
   */
  async setOpening(actor: Actor, id: string, input: OpeningInput): Promise<Fund> {
    if (input.date > isoDate(todayDate())) throw new BadRequestException({ code: 'future_date', message: 'The date is in the future' });
    await this.write(async (tx) => {
      await lockFinanceSetup(tx, actor.societyId);
      const fund = await this.row(tx, actor.societyId, id);
      if (fund.closed_at) throw fundClosed();
      const others = await tx.ledger_entries.count({ where: { fund_id: id, source_type: { not: 'opening' } } });
      if (others > 0) throw new ConflictException({ code: 'opening_locked', message: 'The fund already has other entries' });

      const current = await tx.ledger_entries.findMany({
        where: { fund_id: id, ...liveOpening },
        select: { id: true, account: true, amount: true, entry_date: true },
      });
      const base = { society_id: actor.societyId, fund_id: id, source_type: 'opening', source_id: id, created_by: actor.userId };
      for (const entry of current) {
        await tx.ledger_entries.create({
          data: {
            ...base,
            account: entry.account,
            amount: entry.amount,
            entry_date: entry.entry_date,
            direction: 'out',
            reverses_id: entry.id,
            memo: 'Opening balance corrected',
          },
        });
      }
      const accounts: [LedgerAccount, string][] = [
        ['cash', input.cash],
        ['bank', input.bank],
      ];
      for (const [account, amount] of accounts) {
        if (isZeroMoney(amount)) continue;
        await tx.ledger_entries.create({
          data: { ...base, account, amount: new Prisma.Decimal(amount), entry_date: new Date(`${input.date}T00:00:00Z`), direction: 'in', memo: 'Opening balance' },
        });
      }
      await this.audit.record(
        {
          ...auditOf(actor, current.length ? 'update' : 'create', id),
          entityType: 'fund_opening',
          before: current.map((entry) => ({ account: entry.account, amount: entry.amount.toFixed(2), date: isoDate(entry.entry_date) })),
          after: input,
        },
        tx,
      );
    });
    return this.get(actor.societyId, id);
  }

  private async row(client: Client | Tx, societyId: string, id: string): Promise<FundRow> {
    const row = await client.funds.findFirst({ where: { id, society_id: societyId }, select: fundSelect });
    if (!row) throw fundNotFound();
    return row;
  }

  /** Nothing in the cash box or the bank for this fund. */
  private async isEmpty(tx: Tx, id: string): Promise<boolean> {
    const sums = await tx.ledger_entries.groupBy({ by: ['account', 'direction'], where: { fund_id: id }, _sum: { amount: true } });
    const of = (account: string, direction: string) =>
      sums.find((s) => s.account === account && s.direction === direction)?._sum.amount?.toFixed(2) ?? '0';
    return ['cash', 'bank'].every((account) => isZeroMoney(subtractMoney(of(account, 'in'), of(account, 'out'))));
  }

  private async write<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(work);
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken();
      throw error;
    }
  }
}

export const fundClosed = () => new ConflictException({ code: 'fund_closed', message: 'The fund is closed' });

const auditOf = (actor: Actor, action: string, entityId: string) => ({
  societyId: actor.societyId,
  userId: actor.userId,
  action,
  entityType: 'fund',
  entityId,
  ip: actor.ip,
});
