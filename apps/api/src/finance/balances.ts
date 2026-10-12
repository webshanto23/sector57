import type { Prisma } from '@s57/db';
import type { LedgerAccount } from '@s57/shared';

type Client = Pick<Prisma.TransactionClient, '$queryRaw'>;

/**
 * What a fund holds per account: its `in` minus its `out` rows. Inside a money-out
 * transaction, call it only after `lockFinanceSetup`, so two writers never see the same balance.
 */
export async function fundBalances(client: Client, fundId: string): Promise<Record<LedgerAccount, string>> {
  const rows = await client.$queryRaw<{ account: string; balance: string }[]>`
    SELECT account, coalesce(sum(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)::numeric(16,2)::text AS balance
    FROM ledger_entries WHERE fund_id = ${fundId}::uuid GROUP BY account`;
  const of = (account: LedgerAccount) => rows.find((row) => row.account === account)?.balance ?? '0.00';
  return { cash: of('cash'), bank: of('bank') };
}
