import { Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  addMoney,
  groupByDay,
  monthBounds,
  REGISTER_DONATION,
  splitAcrossLines,
  sumRows,
  TIME_ZONE,
  type BillToRole,
  type CollectionRegister,
  type CollectionRegisterQuery,
  type PaymentMethod,
  type RegisterLine,
  type RegisterRow,
} from '@s57/shared';
import { isoDate, todayDate } from '../common/dates.js';
import type { CallerAccess } from '../permissions/caller-access.js';
import { SettingsService } from '../finance/settings.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { locationNotFound, pathIds, TreeService } from '../property/tree.service.js';
import { inScope, reaches } from './area-tree.js';

type ReceiptRow = {
  id: string;
  receipt_no: string;
  received_at: Date;
  day: string;
  payer: string | null;
  amount: string;
  method: PaymentMethod;
  void: boolean;
  collector_id: string;
  collector: string;
  path: string | null;
  donation: boolean;
};

type AllocationRow = {
  payment_id: string;
  invoice_id: string;
  amount: string;
  before: string;
  kind: string;
  role: BillToRole | null;
  membership_id: string | null;
  period_start: Date | null;
};

type LineRow = { invoice_id: string; charge_type_id: string; amount: string; period_start: Date | null };

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(key(item));
    if (list) list.push(item);
    else groups.set(key(item), [item]);
  }
  return groups;
}

const monthOf = (date: Date | null): string | null => (date ? isoDate(date).slice(0, 7) : null);

/**
 * Step 33: the collection register, one month of receipts day by day with one column per
 * charge type plus donations. Bill receipts follow the caller's `payments` area; donations
 * (no place) need `donations` access and drop out once a place is picked.
 */
@Injectable()
export class CollectionRegisterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tree: TreeService,
    private readonly settings: SettingsService,
  ) {}

  /** 404 `location_not_found` for a place outside the caller's area. */
  async build(access: CallerAccess, societyId: string, query: CollectionRegisterQuery, withDonations: boolean): Promise<CollectionRegister> {
    const month = query.month ?? isoDate(todayDate()).slice(0, 7);
    const under = query.locationId ? await this.place(access, societyId, query.locationId) : null;
    const receipts = await this.receipts(access, societyId, month, query, under, withDonations && !under);
    const allocations = await this.allocations(receipts.filter((row) => !row.donation).map((row) => row.id));
    const lines = await this.lines([...new Set(allocations.map((row) => row.invoice_id))]);

    const byPayment = groupBy(allocations, (row) => row.payment_id);
    const used = new Set<string>();
    const members = new Set<string>();
    const rows: Omit<RegisterRow, 'places'>[] = receipts.map((receipt) => {
      if (receipt.donation) return this.row(receipt, { [REGISTER_DONATION]: receipt.amount }, null, []);
      const own = byPayment.get(receipt.id) ?? [];
      const parts = own.flatMap((allocation) => {
        const billLines: RegisterLine[] = (lines.get(allocation.invoice_id) ?? []).map((line) => ({
          key: line.charge_type_id,
          amount: line.amount,
          month: monthOf(line.period_start) ?? monthOf(allocation.period_start),
        }));
        return billLines.length > 0 ? splitAcrossLines(billLines, allocation.before, allocation.amount) : [];
      });
      const amounts: Record<string, string> = {};
      for (const part of parts) {
        amounts[part.key] = addMoney(amounts[part.key] ?? '0', part.amount);
        used.add(part.key);
      }
      if (!receipt.void) for (const allocation of own) if (allocation.kind === 'membership' && allocation.membership_id) members.add(allocation.membership_id);
      const months = [...new Set(parts.flatMap((part) => (part.month ? [part.month] : [])))].sort();
      return this.row(receipt, amounts, own[0]?.role ?? null, months);
    });

    const [{ levels, placesOf }, header] = await Promise.all([this.levels(societyId, receipts), this.settings.receiptHeader(societyId)]);
    const withPlaces: RegisterRow[] = rows.map((row, index) => ({ ...row, places: placesOf(receipts[index]!.path) }));
    const days = groupByDay(withPlaces);
    return {
      month,
      levels,
      columns: await this.columns(societyId, used, withDonations && !under),
      days,
      totals: sumRows(withPlaces),
      activeDays: days.filter((day) => day.receipts > 0).length,
      newMembers: members.size,
      header,
    };
  }

  private row(receipt: ReceiptRow, amounts: Record<string, string>, role: BillToRole | null, months: string[]): Omit<RegisterRow, 'places'> {
    return {
      id: receipt.id,
      receiptNo: receipt.receipt_no,
      at: receipt.received_at.toISOString(),
      day: receipt.day,
      payer: receipt.payer?.trim() ? receipt.payer : null,
      role,
      months,
      amounts,
      total: receipt.amount,
      method: receipt.method,
      collector: { id: receipt.collector_id, name: receipt.collector },
      void: receipt.void,
    };
  }

  private async place(access: CallerAccess, societyId: string, id: string): Promise<string> {
    const row = await this.tree.find(societyId, id);
    if (!row || !reaches(access, row.path, 'payments')) throw locationNotFound();
    return row.path;
  }

  /** The month's receipts: bill receipts in the caller's area (and under `under`), donations when allowed. */
  private receipts(
    access: CallerAccess,
    societyId: string,
    month: string,
    query: CollectionRegisterQuery,
    under: string | null,
    donations: boolean,
  ): Promise<ReceiptRow[]> {
    const { first, last } = monthBounds(month);
    const bills = Prisma.sql`${inScope(access, 'payments')} AND ${under ? Prisma.sql`starts_with(l.path, ${under})` : Prisma.sql`TRUE`}`;
    return this.prisma.$queryRaw<ReceiptRow[]>`
      SELECT p.id, p.receipt_no, p.received_at, (p.received_at AT TIME ZONE ${TIME_ZONE})::date::text AS day,
             p.payer_snapshot->>'name' AS payer, p.amount::text AS amount, p.method, p.voided_at IS NOT NULL AS void,
             p.received_by AS collector_id, coalesce(pe.full_name, u.phone) AS collector, l.path, d.id IS NOT NULL AS donation
      FROM payments p
        JOIN users u ON u.id = p.received_by LEFT JOIN persons pe ON pe.id = u.person_id
        LEFT JOIN locations l ON l.id = p.unit_id LEFT JOIN donations d ON d.payment_id = p.id
      WHERE p.society_id = ${societyId}::uuid
        AND (p.received_at AT TIME ZONE ${TIME_ZONE})::date BETWEEN ${first}::date AND ${last}::date
        AND ${query.collectorId ? Prisma.sql`p.received_by = ${query.collectorId}::uuid` : Prisma.sql`TRUE`}
        AND ${query.method ? Prisma.sql`p.method = ${query.method}` : Prisma.sql`TRUE`}
        AND ${query.voided ? Prisma.sql`TRUE` : Prisma.sql`p.voided_at IS NULL`}
        AND (CASE WHEN d.id IS NOT NULL THEN ${donations} ELSE ${bills} END)
      ORDER BY p.received_at, p.receipt_no`;
  }

  /**
   * Each receipt's part of each bill, with what earlier unvoided receipts had paid on that
   * bill before it (`before`), so the split carries on where they stopped. Same order as the
   * income report's split (received time, then id), so the two always agree.
   */
  private async allocations(paymentIds: string[]): Promise<AllocationRow[]> {
    if (paymentIds.length === 0) return [];
    return this.prisma.$queryRaw<AllocationRow[]>`
      SELECT a.payment_id, a.invoice_id, a.amount::text AS amount, i.kind, i.bill_to_snapshot->>'role' AS role,
             i.membership_id, i.period_start,
             coalesce((
               SELECT sum(b.amount) FROM payment_allocations b JOIN payments q ON q.id = b.payment_id
               WHERE b.invoice_id = a.invoice_id AND q.voided_at IS NULL
                 AND (q.received_at, q.id) < (p.received_at, p.id)
             ), 0)::text AS before
      FROM payment_allocations a JOIN payments p ON p.id = a.payment_id JOIN invoices i ON i.id = a.invoice_id
      WHERE a.payment_id = ANY(${paymentIds}::uuid[])
      ORDER BY i.issue_date, i.created_at, i.id`;
  }

  /** The lines of the bills, in line order. */
  private async lines(invoiceIds: string[]): Promise<Map<string, LineRow[]>> {
    if (invoiceIds.length === 0) return new Map();
    const rows = await this.prisma.invoice_lines.findMany({
      where: { invoice_id: { in: invoiceIds } },
      select: { invoice_id: true, charge_type_id: true, amount: true, period_start: true },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    return groupBy(
      rows.map((row) => ({ ...row, amount: row.amount.toString() })),
      (row) => row.invoice_id,
    );
  }

  /** Active charge types and any archived one the month used, then donations. */
  private async columns(societyId: string, used: Set<string>, donations: boolean): Promise<CollectionRegister['columns']> {
    const types = await this.prisma.charge_types.findMany({
      where: { society_id: societyId, OR: [{ archived_at: null }, { id: { in: [...used] } }] },
      select: { id: true, name_bn: true, name_en: true },
      orderBy: { name_bn: 'asc' },
    });
    const columns: CollectionRegister['columns'] = types.map((type) => ({ key: type.id, kind: 'charge', nameBn: type.name_bn, nameEn: type.name_en }));
    if (donations) columns.push({ key: REGISTER_DONATION, kind: 'donation', nameBn: null, nameEn: null });
    return columns;
  }

  /**
   * The levels the receipts' units sit in (smallest first, without a single top level) and
   * each unit's place name per level.
   */
  private async levels(societyId: string, receipts: ReceiptRow[]) {
    const ids = [...new Set(receipts.flatMap((row) => (row.path ? pathIds(row.path) : [])))];
    const [places, levels, roots] = await Promise.all([
      ids.length > 0
        ? this.prisma.locations.findMany({ where: { id: { in: ids }, society_id: societyId }, select: { id: true, name: true, level_id: true, parent_id: true } })
        : [],
      this.prisma.location_levels.findMany({ where: { society_id: societyId }, select: { id: true, depth: true, name_bn: true, name_en: true } }),
      this.prisma.locations.count({ where: { society_id: societyId, parent_id: null } }),
    ]);
    const byId = new Map(places.map((place) => [place.id, place]));
    const shown = new Set(places.filter((place) => roots > 1 || place.parent_id !== null).map((place) => place.level_id));
    const columns = levels.filter((level) => shown.has(level.id)).sort((a, b) => b.depth - a.depth);
    const placesOf = (path: string | null): (string | null)[] => {
      const named = new Map((path ? pathIds(path) : []).flatMap((id) => (byId.has(id) ? [[byId.get(id)!.level_id, byId.get(id)!.name] as const] : [])));
      return columns.map((level) => named.get(level.id) ?? null);
    };
    return { levels: columns.map((level) => ({ id: level.id, nameBn: level.name_bn, nameEn: level.name_en })), placesOf };
  }
}
