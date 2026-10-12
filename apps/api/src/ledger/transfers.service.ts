import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  compareMoney,
  transferKind,
  type LedgerAccount,
  type Transfer,
  type TransferInput,
  type TransferList,
  type TransferListQuery,
  type TransferVoid,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { fundBalances } from '../finance/balances.js';
import { fundClosed } from '../finance/funds.service.js';
import { lockFinanceSetup } from '../finance/numbering.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Tx = Prisma.TransactionClient;

const userName = { select: { phone: true, persons: { select: { full_name: true } } } } as const;
const nameOf = (user: { phone: string; persons: { full_name: string } | null }) => user.persons?.full_name ?? user.phone;
const fundName = { select: { id: true, name_bn: true, name_en: true } } as const;

const transferSelect = {
  id: true,
  from_fund_id: true,
  from_account: true,
  to_fund_id: true,
  to_account: true,
  amount: true,
  transfer_date: true,
  memo: true,
  created_at: true,
  voided_at: true,
  void_reason: true,
  from_fund: fundName,
  to_fund: fundName,
  users_created: userName,
  users_voided: userName,
} satisfies Prisma.fund_transfersSelect;
type Row = Prisma.fund_transfersGetPayload<{ select: typeof transferSelect }>;

export const transferNotFound = () => new NotFoundException({ code: 'transfer_not_found', message: 'Transfer not found' });
const insufficient = (balance: string) =>
  new ConflictException({ code: 'fund_insufficient', message: 'The fund does not hold enough in that account', details: { balance } });
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/**
 * Fund transfers and bank deposits (`ledger.*`, society-wide). A transfer writes an `out` row
 * from the source and an `in` row to the destination, dated today, under the finance setup
 * lock; it is refused when the source holds less. A void (`ledger.approve`) writes the two
 * reversing rows, and is refused when the destination no longer holds the money.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: Actor, query: TransferListQuery): Promise<TransferList> {
    const { page, pageSize } = query;
    const where: Prisma.fund_transfersWhereInput = {
      society_id: actor.societyId,
      ...(query.fundId ? { OR: [{ from_fund_id: query.fundId }, { to_fund_id: query.fundId }] } : {}),
      ...(query.from || query.to
        ? { transfer_date: { ...(query.from ? { gte: day(query.from) } : {}), ...(query.to ? { lte: day(query.to) } : {}) } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.fund_transfers.findMany({
        where,
        select: transferSelect,
        orderBy: [{ transfer_date: 'desc' }, { created_at: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.fund_transfers.count({ where }),
    ]);
    return { items: rows.map((row) => toTransfer(actor, row)), total, page, pageSize };
  }

  async get(actor: Actor, id: string): Promise<Transfer> {
    const row = await this.prisma.fund_transfers.findFirst({ where: { id, society_id: actor.societyId }, select: transferSelect });
    if (!row) throw transferNotFound();
    return toTransfer(actor, row);
  }

  async create(actor: Actor, input: TransferInput): Promise<Transfer> {
    const today = isoDate(todayDate());
    const id = await this.prisma.$transaction(async (tx) => {
      await lockFinanceSetup(tx, actor.societyId);
      const funds = await tx.funds.findMany({
        where: { society_id: actor.societyId, id: { in: [input.fromFundId, input.toFundId] } },
        select: { id: true, closed_at: true },
      });
      for (const fundId of [input.fromFundId, input.toFundId]) {
        const fund = funds.find((row) => row.id === fundId);
        if (!fund) throw new BadRequestException({ code: 'invalid_fund', message: 'Unknown fund' });
        if (fund.closed_at) throw fundClosed();
      }
      const balance = (await fundBalances(tx, input.fromFundId))[input.fromAccount];
      if (compareMoney(balance, input.amount) < 0) throw insufficient(balance);

      const amount = new Prisma.Decimal(input.amount);
      const row = await tx.fund_transfers.create({
        data: {
          society_id: actor.societyId,
          from_fund_id: input.fromFundId,
          from_account: input.fromAccount,
          to_fund_id: input.toFundId,
          to_account: input.toAccount,
          amount,
          transfer_date: day(today),
          memo: input.memo,
          created_by: actor.userId,
        },
        select: { id: true },
      });
      const entry = {
        society_id: actor.societyId,
        entry_date: day(today),
        amount,
        source_type: 'transfer',
        source_id: row.id,
        memo: input.memo,
        created_by: actor.userId,
      };
      await tx.ledger_entries.create({ data: { ...entry, fund_id: input.fromFundId, account: input.fromAccount, direction: 'out' } });
      await tx.ledger_entries.create({ data: { ...entry, fund_id: input.toFundId, account: input.toAccount, direction: 'in' } });
      await this.audit.record({ ...auditOf(actor, 'create', row.id), after: { ...input, balanceBefore: balance } }, tx);
      return row.id;
    });
    return this.get(actor, id);
  }

  async void(actor: Actor, id: string, input: TransferVoid): Promise<Transfer> {
    const today = isoDate(todayDate());
    await this.prisma.$transaction(async (tx) => {
      await lockFinanceSetup(tx, actor.societyId);
      const row = await this.locked(tx, actor.societyId, id);
      if (row.voided_at) throw new ConflictException({ code: 'transfer_already_void', message: 'The transfer is already void' });
      // Undoing it takes the money back out of the destination, so the destination must still hold it.
      const balance = (await fundBalances(tx, row.to_fund_id))[row.to_account as LedgerAccount];
      if (compareMoney(balance, row.amount.toFixed(2)) < 0) throw insufficient(balance);

      const entries = await tx.ledger_entries.findMany({
        where: { society_id: actor.societyId, source_type: 'transfer', source_id: id, reverses_id: null, reversed_by: { is: null } },
        select: { id: true, fund_id: true, account: true, amount: true, direction: true },
        orderBy: { id: 'asc' },
      });
      for (const entry of entries) {
        await tx.ledger_entries.create({
          data: {
            society_id: actor.societyId,
            fund_id: entry.fund_id,
            entry_date: day(today),
            direction: entry.direction === 'in' ? 'out' : 'in',
            amount: entry.amount,
            account: entry.account,
            source_type: 'transfer',
            source_id: id,
            reverses_id: entry.id,
            memo: 'void',
            created_by: actor.userId,
          },
        });
      }
      await tx.fund_transfers.update({ where: { id }, data: { voided_at: new Date(), voided_by: actor.userId, void_reason: input.reason } });
      await this.audit.record({ ...auditOf(actor, 'void', id), before: { amount: row.amount.toFixed(2) }, after: { reason: input.reason } }, tx);
    });
    return this.get(actor, id);
  }

  /** The transfer row, locked for the rest of the transaction. */
  private async locked(tx: Tx, societyId: string, id: string) {
    await tx.$queryRaw`SELECT id FROM fund_transfers WHERE id = ${id}::uuid AND society_id = ${societyId}::uuid FOR UPDATE`;
    const row = await tx.fund_transfers.findFirst({
      where: { id, society_id: societyId },
      select: { to_fund_id: true, to_account: true, amount: true, voided_at: true },
    });
    if (!row) throw transferNotFound();
    return row;
  }
}

function toTransfer(actor: Actor, row: Row): Transfer {
  const ref = (fund: Row['from_fund']) => ({ id: fund.id, nameBn: fund.name_bn, nameEn: fund.name_en });
  const sides = { fromFundId: row.from_fund_id, fromAccount: row.from_account, toFundId: row.to_fund_id, toAccount: row.to_account };
  return {
    id: row.id,
    kind: transferKind(sides),
    from: { fund: ref(row.from_fund), account: row.from_account as LedgerAccount },
    to: { fund: ref(row.to_fund), account: row.to_account as LedgerAccount },
    amount: row.amount.toFixed(2),
    date: isoDate(row.transfer_date),
    memo: row.memo,
    created: { at: row.created_at.toISOString(), by: nameOf(row.users_created) },
    void:
      row.voided_at && row.void_reason
        ? { at: row.voided_at.toISOString(), by: row.users_voided ? nameOf(row.users_voided) : null, reason: row.void_reason }
        : null,
    can: { void: row.voided_at === null && actor.access.can('approve', 'ledger') },
  };
}

const auditOf = (actor: Actor, action: string, entityId: string) => ({
  societyId: actor.societyId,
  userId: actor.userId,
  action,
  entityType: 'fund_transfer',
  entityId,
  ip: actor.ip,
});
