import { ConflictException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import { compareMoney, type LedgerAccount } from '@s57/shared';
import type { AuditService } from '../audit/audit.service.js';
import { fundBalances } from '../finance/balances.js';
import { fundClosed } from '../finance/funds.service.js';
import type { NumberingService } from '../finance/numbering.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { auditOf, day } from './expense-rows.js';

type Tx = Prisma.TransactionClient;

/** What paying and voiding write besides the expense row. */
export interface ExpenseMoneyDeps {
audit: AuditService;
numbering: NumberingService;
}

/** Pays an approved expense: the balance check, a voucher number and the `out` ledger row. */
export async function settleIn(tx: Tx, deps: ExpenseMoneyDeps, actor: Actor, id: string, row: { fund_id: string; amount: Prisma.Decimal }, account: LedgerAccount, today: string): Promise<string> {
  const fund = await tx.funds.findUniqueOrThrow({ where: { id: row.fund_id }, select: { closed_at: true } });
  if (fund.closed_at) throw fundClosed();
  const balance = (await fundBalances(tx, row.fund_id))[account];
  const amount = row.amount.toFixed(2);
  if (compareMoney(balance, amount) < 0) {
    throw new ConflictException({ code: 'fund_insufficient', message: 'The fund does not hold enough in that account', details: { balance } });
  }
  const number = await deps.numbering.next(tx, actor.societyId, 'voucher', today);
  await tx.expenses.update({
    where: { id },
    data: { status: 'paid', voucher_no: number.formatted, paid_at: new Date(), paid_by: actor.userId, paid_account: account, updated_at: new Date() },
  });
  await tx.ledger_entries.create({
    data: {
      society_id: actor.societyId,
      fund_id: row.fund_id,
      entry_date: day(today),
      direction: 'out',
      amount: row.amount,
      account: account,
      source_type: 'expense',
      source_id: id,
      memo: number.formatted,
      created_by: actor.userId,
    },
  });
  await deps.audit.record(
    { ...auditOf(actor, 'pay', id), before: { status: 'approved', balance }, after: { status: 'paid', voucherNo: number.formatted, account: account, amount } },
    tx,
  );
  return number.formatted;
}

/** Voids an approved or paid expense, reversing its ledger rows on today's date. */
export async function reverseIn(tx: Tx, deps: Pick<ExpenseMoneyDeps, 'audit'>, actor: Actor, id: string, row: { status: string; voucher_no: string | null }, reason: string, today: string): Promise<void> {
  const entries = await tx.ledger_entries.findMany({
    where: { source_type: 'expense', source_id: id, reverses_id: null, reversed_by: { is: null } },
    select: { id: true, fund_id: true, account: true, amount: true },
  });
  for (const entry of entries) {
    await tx.ledger_entries.create({
      data: {
        society_id: actor.societyId,
        fund_id: entry.fund_id,
        entry_date: day(today),
        direction: 'in',
        amount: entry.amount,
        account: entry.account,
        source_type: 'expense',
        source_id: id,
        reverses_id: entry.id,
        memo: `${row.voucher_no ?? ''} void`.trim(),
        created_by: actor.userId,
      },
    });
  }
  await tx.expenses.update({ where: { id }, data: { status: 'void', voided_at: new Date(), voided_by: actor.userId, void_reason: reason, updated_at: new Date() } });
  await deps.audit.record({ ...auditOf(actor, 'void', id), before: { status: row.status, voucherNo: row.voucher_no }, after: { status: 'void', reason } }, tx);
}
