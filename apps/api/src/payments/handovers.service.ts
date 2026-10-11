import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import { compareMoney, subtractMoney, type Handover, type HandoverConfirm, type HandoverList, type HandoverListQuery } from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beyondPermissions } from '../property/tree.service.js';
import { allowed } from './payments.service.js';

type Tx = Prisma.TransactionClient;
type Client = Tx | PrismaService;

const userName = { select: { id: true, phone: true, persons: { select: { full_name: true } } } } as const;
const nameOf = (user: { phone: string; persons: { full_name: string } | null }) => user.persons?.full_name ?? user.phone;

const select = {
  id: true,
  collector_id: true,
  created_at: true,
  payment_count: true,
  amount_expected: true,
  amount_counted: true,
  note: true,
  confirmed_at: true,
  collector: userName,
  confirmer: userName,
} satisfies Prisma.cash_handoversSelect;
type Row = Prisma.cash_handoversGetPayload<{ select: typeof select }>;

export const handoverNotFound = () => new NotFoundException({ code: 'handover_not_found', message: 'Handover not found' });

/**
 * Cash handovers: a collector closes the day by handing their open payments to the
 * treasurer, who counts the cash and confirms. Nobody confirms their own; a difference is
 * recorded with a note, never hidden. A collector sees their own handovers; an approver sees
 * those whose payments all lie within their `payments.approve` area.
 */
@Injectable()
export class HandoversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: Actor, query: HandoverListQuery): Promise<HandoverList> {
    const { page, pageSize } = query;
    const and = [Prisma.sql`h.society_id = ${actor.societyId}::uuid`, this.visible(actor)];
    if (query.status === 'pending') and.push(Prisma.sql`h.confirmed_at IS NULL`);
    if (query.status === 'confirmed') and.push(Prisma.sql`h.confirmed_at IS NOT NULL`);
    const where = Prisma.join(and, ' AND ');
    const [ids, [{ count }]] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT h.id FROM cash_handovers h WHERE ${where}
        ORDER BY (h.confirmed_at IS NULL) DESC, h.created_at DESC, h.id DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      this.prisma.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM cash_handovers h WHERE ${where}`,
    ]);
    const items = await this.rows(
      actor,
      ids.map((row) => row.id),
    );
    return { items, total: count, page, pageSize };
  }

  async get(actor: Actor, id: string): Promise<Handover> {
    const [visible] = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT h.id FROM cash_handovers h WHERE h.id = ${id}::uuid AND h.society_id = ${actor.societyId}::uuid AND ${this.visible(actor)}`;
    if (!visible) throw handoverNotFound();
    return (await this.rows(actor, [id]))[0]!;
  }

  /** Hands over all the caller's payments not yet handed over and not void. */
  async create(actor: Actor): Promise<Handover> {
    const id = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`handover:${actor.societyId}:${actor.userId}`}, 0))`;
      const open = await tx.payments.findMany({
        where: { society_id: actor.societyId, received_by: actor.userId, handover_id: null, voided_at: null },
        select: { id: true },
      });
      if (open.length === 0) throw new BadRequestException({ code: 'nothing_to_hand_over', message: 'You have no cash to hand over' });
      const handover = await tx.cash_handovers.create({
        data: { society_id: actor.societyId, collector_id: actor.userId, payment_count: open.length },
        select: { id: true },
      });
      // A payment voided meanwhile drops out here (the update re-checks each row it waited for).
      const taken = await tx.payments.updateMany({
        where: { id: { in: open.map((row) => row.id) }, handover_id: null, voided_at: null },
        data: { handover_id: handover.id },
      });
      if (taken.count === 0) throw new BadRequestException({ code: 'nothing_to_hand_over', message: 'You have no cash to hand over' });
      if (taken.count !== open.length) await tx.cash_handovers.update({ where: { id: handover.id }, data: { payment_count: taken.count } });
      const [{ amount }] = await this.expected(tx, handover.id);
      await this.audit.record({ ...auditOf(actor, 'create', handover.id), after: { payments: taken.count, expected: amount } }, tx);
      return handover.id;
    });
    return this.get(actor, id);
  }

  /** The treasurer counts the cash. Not the collector; a difference needs a note. */
  async confirm(actor: Actor, id: string, input: HandoverConfirm): Promise<Handover> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM cash_handovers WHERE id = ${id}::uuid AND society_id = ${actor.societyId}::uuid FOR UPDATE`;
      const row = await tx.cash_handovers.findFirst({ where: { id, society_id: actor.societyId }, select: { collector_id: true, confirmed_at: true } });
      if (!row) throw handoverNotFound();
      const paths = await this.paths(tx, id);
      const mayApprove = paths.every((path) => allowed(actor.access, 'approve', path));
      if (row.collector_id !== actor.userId && !mayApprove) throw handoverNotFound();
      if (row.confirmed_at) throw new ConflictException({ code: 'already_confirmed', message: 'This handover is already confirmed' });
      if (row.collector_id === actor.userId) throw new ForbiddenException({ code: 'cannot_confirm_own', message: 'Someone else must confirm your cash' });
      if (!mayApprove) throw beyondPermissions();

      const [{ amount: expected }] = await this.expected(tx, id);
      const difference = subtractMoney(input.amountCounted, expected);
      if (compareMoney(difference, '0') !== 0 && !input.note) {
        throw new BadRequestException({ code: 'note_required', message: 'The count differs from what was expected; say why' });
      }
      const now = new Date();
      await tx.cash_handovers.update({
        where: { id },
        data: {
          amount_expected: new Prisma.Decimal(expected),
          amount_counted: new Prisma.Decimal(input.amountCounted),
          note: input.note,
          confirmed_by: actor.userId,
          confirmed_at: now,
        },
      });
      await tx.payments.updateMany({ where: { handover_id: id }, data: { handed_over_at: now } });
      await this.audit.record(
        { ...auditOf(actor, 'confirm', id), after: { expected, counted: input.amountCounted, difference, note: input.note } },
        tx,
      );
    });
    return this.get(actor, id);
  }

  // -------------------------------------------------------------------------

  /** SQL: the caller's own handovers, or ones whose payments all lie within their approve area. */
  private visible(actor: Actor): Prisma.Sql {
    const own = Prisma.sql`h.collector_id = ${actor.userId}::uuid`;
    const scope = actor.access.paths('approve', 'payments');
    if (scope === 'all') return Prisma.sql`true`;
    if (scope.length === 0) return own;
    const inside = Prisma.join(
      scope.map((prefix) => Prisma.sql`starts_with(l.path, ${prefix})`),
      ' OR ',
    );
    return Prisma.sql`(${own} OR NOT EXISTS (
      SELECT 1 FROM payments p LEFT JOIN locations l ON l.id = p.unit_id
      WHERE p.handover_id = h.id AND (l.path IS NULL OR NOT (${inside}))))`;
  }

  /** Where the handover's payments were taken: unit paths, null for one with no unit. */
  private async paths(client: Client, id: string): Promise<(string | null)[]> {
    const rows = await client.$queryRaw<{ path: string | null }[]>`
      SELECT DISTINCT l.path FROM payments p LEFT JOIN locations l ON l.id = p.unit_id WHERE p.handover_id = ${id}::uuid`;
    return rows.map((row) => row.path);
  }

  /** The sum of the handover's payments that aren't void. */
  private expected(client: Client, id: string) {
    return client.$queryRaw<[{ amount: string }]>`
      SELECT coalesce(sum(amount), 0)::numeric(16,2)::text AS amount FROM payments WHERE handover_id = ${id}::uuid AND voided_at IS NULL`;
  }

  private async rows(actor: Actor, ids: string[]): Promise<Handover[]> {
    if (ids.length === 0) return [];
    const [rows, live, places] = await Promise.all([
      this.prisma.cash_handovers.findMany({ where: { id: { in: ids } }, select }),
      this.prisma.$queryRaw<{ handover_id: string; amount: string; count: number }[]>`
        SELECT handover_id, coalesce(sum(amount), 0)::numeric(16,2)::text AS amount, count(*)::int AS count
        FROM payments WHERE handover_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) AND voided_at IS NULL
        GROUP BY handover_id`,
      this.prisma.$queryRaw<{ handover_id: string; path: string | null }[]>`
        SELECT DISTINCT p.handover_id, l.path FROM payments p LEFT JOIN locations l ON l.id = p.unit_id
        WHERE p.handover_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`,
    ]);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const liveBy = new Map(live.map((row) => [row.handover_id, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      if (!row) return [];
      const paths = places.filter((place) => place.handover_id === id).map((place) => place.path);
      return [toHandover(row, liveBy.get(id), actor.userId !== row.collector_id && paths.every((path) => allowed(actor.access, 'approve', path)))];
    });
  }
}

function toHandover(row: Row, live: { amount: string; count: number } | undefined, mayConfirm: boolean): Handover {
  const confirmed = row.confirmed_at !== null;
  const expected = confirmed ? row.amount_expected!.toFixed(2) : (live?.amount ?? '0.00');
  const counted = row.amount_counted?.toFixed(2) ?? null;
  return {
    id: row.id,
    collector: { id: row.collector.id, name: nameOf(row.collector) },
    createdAt: row.created_at.toISOString(),
    status: confirmed ? 'confirmed' : 'pending',
    paymentCount: confirmed ? row.payment_count : (live?.count ?? 0),
    expected,
    counted,
    difference: counted === null ? null : subtractMoney(counted, expected),
    note: row.note,
    confirmedBy: row.confirmer ? nameOf(row.confirmer) : null,
    confirmedAt: row.confirmed_at?.toISOString() ?? null,
    can: { confirm: !confirmed && mayConfirm },
  };
}

const auditOf = (actor: Actor, action: string, entityId: string) => ({
  societyId: actor.societyId,
  userId: actor.userId,
  action,
  entityType: 'cash_handover',
  entityId,
  ip: actor.ip,
});
