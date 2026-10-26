import { Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import { addMoney, TIME_ZONE, type DayBook, type LedgerAccount, type PermissionModule } from '@s57/shared';
import { isoDate, todayDate } from '../common/dates.js';
import type { CallerAccess } from '../permissions/caller-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addressOf, TreeService } from '../property/tree.service.js';

/** Which sections the caller gets: `view` for the page, `view` and `export` for the CSV. */
export type Sections = (module: PermissionModule) => boolean;

/** The modules a day book section needs. */
export const DAY_BOOK_MODULES = ['payments', 'donations', 'expenses', 'ledger'] as const satisfies readonly PermissionModule[];

const nameRef = (id: string, nameBn: string, nameEn: string | null) => ({ id, nameBn, nameEn });
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

type ReceiptRow = {
  id: string;
  receipt_no: string;
  received_at: Date;
  payer: string | null;
  amount: string;
  void: boolean;
  collector_id: string;
  collector: string;
  path: string | null;
  unit: string | null;
};
type DonationRow = Omit<ReceiptRow, 'path' | 'unit'> & {
  donation_id: string;
  fund_id: string;
  fund_bn: string;
  fund_en: string | null;
  purpose: string | null;
};

/**
 * One day's money, section by section (`GET /reports/day-book`): bill receipts in the
 * caller's `payments` area, donations, paid expenses and transfers, cash per collector, and
 * each fund's balance moving through the day. Days are Dhaka days.
 */
@Injectable()
export class DayBookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tree: TreeService,
  ) {}

  async build(access: CallerAccess, societyId: string, date: string | undefined, sections: Sections): Promise<DayBook> {
    const on = date ?? isoDate(todayDate());
    const receivedOn = Prisma.sql`(p.received_at AT TIME ZONE ${TIME_ZONE})::date = ${on}::date`;
    const collector = Prisma.sql`p.received_by AS collector_id, coalesce(pe.full_name, u.phone) AS collector`;
    const collectorJoin = Prisma.sql`JOIN users u ON u.id = p.received_by LEFT JOIN persons pe ON pe.id = u.person_id`;

    const receipts = sections('payments') ? await this.receipts(access, societyId, receivedOn, collector, collectorJoin) : null;
    const donations = sections('donations')
      ? await this.prisma.$queryRaw<DonationRow[]>`
          SELECT p.id, p.receipt_no, p.received_at, p.payer_snapshot->>'name' AS payer, p.amount::text AS amount,
                 p.voided_at IS NOT NULL AS void, ${collector},
                 d.id AS donation_id, f.id AS fund_id, f.name_bn AS fund_bn, f.name_en AS fund_en, d.purpose
          FROM payments p JOIN donations d ON d.payment_id = p.id JOIN funds f ON f.id = d.fund_id ${collectorJoin}
          WHERE p.society_id = ${societyId}::uuid AND ${receivedOn}
          ORDER BY p.received_at, p.receipt_no`
      : null;
    const expenses = sections('expenses')
      ? await this.prisma.$queryRaw<
          { id: string; line_id: string; voucher_no: string; paid_at: Date; head_id: string; head_bn: string; head_en: string | null; description: string; account: string; amount: string; paid_by: string | null; void: boolean }[]
        >`
          SELECT e.id, l.id AS line_id, e.voucher_no, e.paid_at, h.id AS head_id, h.name_bn AS head_bn, h.name_en AS head_en, l.description,
                 e.paid_account AS account, l.amount::text AS amount, coalesce(pe.full_name, u.phone) AS paid_by, e.status = 'void' AS void
          FROM expenses e JOIN expense_lines l ON l.expense_id = e.id JOIN expense_heads h ON h.id = l.expense_head_id
          LEFT JOIN users u ON u.id = e.paid_by LEFT JOIN persons pe ON pe.id = u.person_id
          WHERE e.society_id = ${societyId}::uuid AND e.paid_at IS NOT NULL AND (e.paid_at AT TIME ZONE ${TIME_ZONE})::date = ${on}::date
          ORDER BY e.paid_at, e.voucher_no, l.position`
      : null;
    const ledger = sections('ledger');
    const transfers = ledger
      ? await this.prisma.fund_transfers.findMany({
          where: { society_id: societyId, transfer_date: day(on) },
          select: {
            id: true,
            amount: true,
            from_account: true,
            to_account: true,
            memo: true,
            voided_at: true,
            from_fund: { select: { id: true, name_bn: true, name_en: true } },
            to_fund: { select: { id: true, name_bn: true, name_en: true } },
          },
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        })
      : null;
    const funds = ledger ? await this.funds(societyId, on) : null;

    const live = <T extends { void: boolean; amount: string }>(rows: T[]) => addMoney('0', ...rows.filter((row) => !row.void).map((row) => row.amount));
    const byCollector = new Map<string, { collector: { id: string; name: string }; receipts: number; amount: string }>();
    for (const row of [...(receipts?.rows ?? []), ...(donations ?? [])]) {
      if (row.void) continue;
      const current = byCollector.get(row.collector_id) ?? { collector: { id: row.collector_id, name: row.collector }, receipts: 0, amount: '0.00' };
      byCollector.set(row.collector_id, { ...current, receipts: current.receipts + 1, amount: addMoney(current.amount, row.amount) });
    }

    return {
      date: on,
      receipts: receipts
        ? {
            items: receipts.rows.map((row) => ({
              id: row.id,
              receiptNo: row.receipt_no,
              at: row.received_at.toISOString(),
              payer: row.payer,
              unit: row.path && row.unit ? [...addressOf(row.path, receipts.names), row.unit] : null,
              amount: row.amount,
              collector: { id: row.collector_id, name: row.collector },
              void: row.void,
            })),
            total: live(receipts.rows),
          }
        : null,
      donations: donations
        ? {
            items: donations.map((row) => ({
              id: row.id,
              donationId: row.donation_id,
              receiptNo: row.receipt_no,
              at: row.received_at.toISOString(),
              payer: row.payer,
              fund: nameRef(row.fund_id, row.fund_bn, row.fund_en),
              purpose: row.purpose,
              amount: row.amount,
              collector: { id: row.collector_id, name: row.collector },
              void: row.void,
            })),
            total: live(donations),
          }
        : null,
      expenses: expenses
        ? {
            items: expenses.map((row) => ({
              id: row.id,
              lineId: row.line_id,
              voucherNo: row.voucher_no,
              at: row.paid_at.toISOString(),
              head: nameRef(row.head_id, row.head_bn, row.head_en),
              description: row.description,
              account: row.account as LedgerAccount,
              amount: row.amount,
              paidBy: row.paid_by,
              void: row.void,
            })),
            total: live(expenses),
          }
        : null,
      transfers: transfers
        ? {
            items: transfers.map((row) => ({
              id: row.id,
              from: { fund: nameRef(row.from_fund.id, row.from_fund.name_bn, row.from_fund.name_en), account: row.from_account as LedgerAccount },
              to: { fund: nameRef(row.to_fund.id, row.to_fund.name_bn, row.to_fund.name_en), account: row.to_account as LedgerAccount },
              amount: row.amount.toFixed(2),
              memo: row.memo,
              void: row.voided_at !== null,
            })),
          }
        : null,
      byCollector: [...byCollector.values()].sort((a, b) => a.collector.name.localeCompare(b.collector.name, 'bn')),
      funds,
    };
  }

  /** Bill receipts of the day in the caller's `payments` area (one with no unit needs the whole society). */
  private async receipts(access: CallerAccess, societyId: string, receivedOn: Prisma.Sql, collector: Prisma.Sql, collectorJoin: Prisma.Sql) {
    const scope = access.paths('view', 'payments');
    const inScope =
      scope === 'all'
        ? Prisma.sql`TRUE`
        : scope.length === 0
          ? Prisma.sql`FALSE`
          : Prisma.sql`(${Prisma.join(
              scope.map((path) => Prisma.sql`starts_with(l.path, ${path})`),
              ' OR ',
            )})`;
    const rows = await this.prisma.$queryRaw<ReceiptRow[]>`
      SELECT p.id, p.receipt_no, p.received_at, p.payer_snapshot->>'name' AS payer, p.amount::text AS amount,
             p.voided_at IS NOT NULL AS void, ${collector}, l.path, l.name AS unit
      FROM payments p LEFT JOIN locations l ON l.id = p.unit_id ${collectorJoin}
      WHERE p.society_id = ${societyId}::uuid AND ${receivedOn}
        AND NOT EXISTS (SELECT 1 FROM donations d WHERE d.payment_id = p.id) AND ${inScope}
      ORDER BY p.received_at, p.receipt_no`;
    const names = await this.tree.addressNames(
      societyId,
      rows.flatMap((row) => (row.path ? [row.path] : [])),
    );
    return { rows, names };
  }

  /** Each fund and account with any entry up to the day: the balance before it, in, out, after. */
  private async funds(societyId: string, on: string): Promise<NonNullable<DayBook['funds']>> {
    const rows = await this.prisma.$queryRaw<
      { fund_id: string; name_bn: string; name_en: string | null; account: string; opening: string; in: string; out: string; closing: string }[]
    >`
      SELECT f.id AS fund_id, f.name_bn, f.name_en, le.account,
             coalesce(sum(CASE WHEN le.direction = 'in' THEN le.amount ELSE -le.amount END) FILTER (WHERE le.entry_date < ${on}::date), 0)::numeric(16,2)::text AS opening,
             coalesce(sum(le.amount) FILTER (WHERE le.direction = 'in' AND le.entry_date = ${on}::date), 0)::numeric(16,2)::text AS in,
             coalesce(sum(le.amount) FILTER (WHERE le.direction = 'out' AND le.entry_date = ${on}::date), 0)::numeric(16,2)::text AS out,
             coalesce(sum(CASE WHEN le.direction = 'in' THEN le.amount ELSE -le.amount END), 0)::numeric(16,2)::text AS closing
      FROM ledger_entries le JOIN funds f ON f.id = le.fund_id
      WHERE le.society_id = ${societyId}::uuid AND le.entry_date <= ${on}::date
      GROUP BY f.id, f.name_bn, f.name_en, f.is_default, le.account
      ORDER BY f.is_default DESC, f.name_bn, le.account`;
    return rows.map((row) => ({
      fund: nameRef(row.fund_id, row.name_bn, row.name_en),
      account: row.account as LedgerAccount,
      opening: row.opening,
      in: row.in,
      out: row.out,
      closing: row.closing,
    }));
  }
}
