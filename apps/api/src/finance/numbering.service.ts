import { Injectable } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import { documentPeriod, formatDocumentNo, type DocumentKind } from '@s57/shared';

type Tx = Prisma.TransactionClient;

export type DocumentNo = { period: string; no: number; formatted: string };

/**
 * Invoice, receipt and voucher numbers without gaps or duplicates.
 *
 * Call `next` inside the transaction that saves the record. The counter row stays
 * locked until that transaction ends: a second collector waits for the first, and a
 * rollback gives the number back. Never call it outside a transaction.
 */
@Injectable()
export class NumberingService {
  /** `day` is the record's calendar date (Dhaka), `YYYY-MM-DD`; it picks the counter (month or fiscal year). */
  async next(tx: Tx, societyId: string, kind: DocumentKind, day: string): Promise<DocumentNo> {
    const society = await tx.societies.findUniqueOrThrow({ where: { id: societyId }, select: { fiscal_year_start_month: true } });
    const period = documentPeriod(kind, day, society.fiscal_year_start_month);
    const [row] = await tx.$queryRaw<{ no: number }[]>`
      INSERT INTO document_sequences (society_id, kind, period, next_no)
      VALUES (${societyId}::uuid, ${kind}, ${period}, 2)
      ON CONFLICT (society_id, kind, period) DO UPDATE SET next_no = document_sequences.next_no + 1
      RETURNING next_no - 1 AS no`;
    const no = row!.no;
    return { period, no, formatted: formatDocumentNo(kind, period, no) };
  }
}

/**
 * Serialises changes to one society's finance setup (settings, funds, charge types,
 * opening balances) so a check and the write that relies on it can't interleave with
 * another change, e.g. turning separate funds off while a fund is being added.
 * Held until the transaction ends.
 */
export async function lockFinanceSetup(tx: Tx, societyId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`finance-setup:${societyId}`}, 0))`;
}
