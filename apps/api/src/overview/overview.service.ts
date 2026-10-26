import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  ACTIVE_TICKET_STATUSES,
  FORM_KEYS,
  isTicketOverdue,
  lastMonths,
  monthOfDay,
  monthStart,
  OPEN_FORM_STATUSES,
  OVERVIEW_ITEMS,
  OVERVIEW_MONTHS,
  percentOf,
  TIME_ZONE,
  type FormKey,
  type Overview,
  type PermissionAction,
  type PermissionModule,
  type TicketPriority,
  type TicketStatus,
} from '@s57/shared';
import { isoDate, todayDate } from '../common/dates.js';
import { ENV, type Env } from '../config/env.js';
import type { CallerAccess } from '../permissions/caller-access.js';
import { scopeWhere } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { payrollWaiting } from '../payroll/payroll-waiting.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AreaReportsService } from '../reports/area-reports.service.js';
import { TtlCache } from './ttl-cache.js';

const userName = { select: { id: true, phone: true, persons: { select: { full_name: true } } } } as const;
type UserName = { id: string; phone: string; persons: { full_name: string } | null };
const userRef = (user: UserName) => ({ id: user.id, name: user.persons?.full_name ?? user.phone });
const toFormKey = (key: string): FormKey => ((FORM_KEYS as readonly string[]).includes(key) ? (key as FormKey) : 'membership');

/** SQL: `l.path` (the row's location, maybe null) lies in the caller's area for `action` on `module`. */
function inScope(access: CallerAccess, action: PermissionAction, module: PermissionModule): Prisma.Sql {
  const scope = access.paths(action, module);
  if (scope === 'all') return Prisma.sql`TRUE`;
  if (scope.length === 0) return Prisma.sql`FALSE`;
  return Prisma.sql`(${Prisma.join(
    scope.map((path) => Prisma.sql`starts_with(l.path, ${path})`),
    ' OR ',
  )})`;
}

/**
 * The dashboard overview (`GET /overview`): a few sums for the cards the caller may see,
 * each limited to their area for that card's grant. Results are kept for
 * `OVERVIEW_CACHE_SECONDS` per caller and their current access, so a changed role is
 * never served from the cache, but new rows can take that long to show.
 */
@Injectable()
export class OverviewService {
  private readonly cache: TtlCache<Overview>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly areaReports: AreaReportsService,
    @Inject(ENV) env: Env,
  ) {
    this.cache = new TtlCache(env.OVERVIEW_CACHE_SECONDS * 1000);
  }

  get(actor: Actor): Promise<Overview> {
    const today = isoDate(todayDate());
    const key = [actor.societyId, actor.userId, today, JSON.stringify(actor.access.toJSON())].join('|');
    return this.cache.get(key, () => this.build(actor, today));
  }

  async build(actor: Actor, today: string): Promise<Overview> {
    const { access, societyId } = actor;
    const can = (action: PermissionAction, module: PermissionModule) => access.can(action, module);
    const canCollected = can('view', 'payments');
    const canBilled = can('view', 'billing');
    const months = lastMonths(today, OVERVIEW_MONTHS);
    const thisMonth = monthOfDay(today);

    const [collectedBy, billedBy, arrears, occupancy, forms, areas, approvals, helpdesk] = await Promise.all([
      canCollected ? this.collectedByMonth(access, societyId, months[0]!) : null,
      canBilled ? this.billedByMonth(access, societyId, months[0]!) : null,
      canBilled ? this.arrears(access, societyId, today) : null,
      can('view', 'units') ? this.occupancy(access, societyId) : null,
      can('view', 'forms') ? this.openForms(access, societyId) : null,
      canBilled ? this.areas(access, societyId, today) : null,
      this.approvals(actor),
      can('view', 'helpdesk') ? this.helpdesk(actor) : null,
    ]);

    const collected = collectedBy?.get(thisMonth) ?? '0.00';
    const billed = billedBy?.get(thisMonth) ?? '0.00';
    return {
      asOf: today,
      month: thisMonth,
      collected: collectedBy
        ? { amount: collected, billed: billedBy ? billed : null, percent: billedBy ? percentOf(collected, billed) : null }
        : null,
      arrears,
      occupancy,
      forms,
      months:
        collectedBy || billedBy
          ? months.map((month) => ({
              month,
              billed: billedBy ? (billedBy.get(month) ?? '0.00') : null,
              collected: collectedBy ? (collectedBy.get(month) ?? '0.00') : null,
            }))
          : null,
      areas,
      helpdesk,
      approvals,
    };
  }

  /** Bill receipts (not donations, not voided) per Dhaka month from `from` on. One with no unit counts only society-wide. */
  private async collectedByMonth(access: CallerAccess, societyId: string, from: string): Promise<Map<string, string>> {
    const rows = await this.prisma.$queryRaw<{ month: string; amount: string }[]>`
      SELECT to_char(p.received_at AT TIME ZONE ${TIME_ZONE}, 'YYYY-MM') AS month, sum(p.amount)::numeric(16,2)::text AS amount
      FROM payments p LEFT JOIN locations l ON l.id = p.unit_id
      WHERE p.society_id = ${societyId}::uuid AND p.voided_at IS NULL
        AND p.received_at >= (${monthStart(from)}::date::timestamp AT TIME ZONE ${TIME_ZONE})
        AND NOT EXISTS (SELECT 1 FROM donations d WHERE d.payment_id = p.id)
        AND ${inScope(access, 'view', 'payments')}
      GROUP BY 1`;
    return new Map(rows.map((row) => [row.month, row.amount]));
  }

  /** Bills issued per month from `from` on, not void, earlier arrears left out. A membership bill counts only society-wide. */
  private async billedByMonth(access: CallerAccess, societyId: string, from: string): Promise<Map<string, string>> {
    const rows = await this.prisma.$queryRaw<{ month: string; amount: string }[]>`
      SELECT to_char(i.issue_date, 'YYYY-MM') AS month, sum(i.total)::numeric(16,2)::text AS amount
      FROM invoices i LEFT JOIN locations l ON l.id = i.unit_id
      WHERE i.society_id = ${societyId}::uuid AND i.kind <> 'opening' AND i.status <> 'void'
        AND i.issue_date >= ${monthStart(from)}::date AND ${inScope(access, 'view', 'billing')}
      GROUP BY 1`;
    return new Map(rows.map((row) => [row.month, row.amount]));
  }

  /** The same figures as the arrears report's totals. */
  private async arrears(access: CallerAccess, societyId: string, today: string): Promise<Overview['arrears']> {
    const [row] = await this.prisma.$queryRaw<{ units: number; bills: number; owed: string }[]>`
      SELECT count(DISTINCT i.unit_id)::int AS units, count(*)::int AS bills,
             coalesce(sum(i.total - i.paid), 0)::numeric(16,2)::text AS owed
      FROM invoices i JOIN locations l ON l.id = i.unit_id
      WHERE i.society_id = ${societyId}::uuid AND i.status IN ('unpaid', 'partial') AND i.due_date < ${today}::date
        AND ${inScope(access, 'view', 'billing')}`;
    return row!;
  }

  private async occupancy(access: CallerAccess, societyId: string): Promise<Overview['occupancy']> {
    const [row] = await this.prisma.$queryRaw<{ units: number; vacant: number }[]>`
      SELECT count(*)::int AS units, count(*) FILTER (WHERE u.occupancy = 'vacant')::int AS vacant
      FROM units u JOIN locations l ON l.id = u.location_id
      WHERE u.society_id = ${societyId}::uuid AND l.is_active AND ${inScope(access, 'view', 'units')}`;
    return { units: row!.units, occupied: row!.units - row!.vacant, vacant: row!.vacant };
  }

  private async openForms(access: CallerAccess, societyId: string): Promise<Overview['forms']> {
    const open = await this.prisma.form_submissions.count({
      where: {
        society_id: societyId,
        status: { in: [...OPEN_FORM_STATUSES] },
        ...scopeWhere(access, 'view', 'forms', (prefix) => ({ locations: { path: { startsWith: prefix } } })),
      },
    });
    return { open };
  }

  /**
   * Collection by area for this month's bills, under the deepest place that holds every area
   * the caller reaches: a block's coordinator sees its roads rather than one lone block.
   */
  private async areas(access: CallerAccess, societyId: string, today: string): Promise<Overview['areas']> {
    const range = { from: monthStart(monthOfDay(today)), to: today };
    let report = await this.areaReports.collection(access, societyId, range);
    for (let depth = 0; depth < 10 && report.areas.length === 1 && !report.areas[0]!.isUnit; depth++) {
      report = await this.areaReports.collection(access, societyId, { ...range, parentId: report.areas[0]!.id });
    }
    return {
      parent: report.parent,
      // An area with no bills this month has no rate to show.
      items: report.areas.filter((area) => area.bills > 0).map((area) => ({ id: area.id, name: area.name, billed: area.billed, collected: area.collected, percent: area.percent })),
    };
  }

  /** Active tickets in the caller's `helpdesk.view` area: counts and the soonest due. */
  private async helpdesk(actor: Actor): Promise<Overview['helpdesk']> {
    const now = new Date();
    const where: Prisma.ticketsWhereInput = {
      society_id: actor.societyId,
      status: { in: [...ACTIVE_TICKET_STATUSES] },
      locations: scopeWhere(actor.access, 'view', 'helpdesk', (prefix) => ({ path: { startsWith: prefix } })),
    };
    const [active, overdue, rows] = await Promise.all([
      this.prisma.tickets.count({ where }),
      this.prisma.tickets.count({ where: { AND: [where, { due_at: { lt: now } }] } }),
      this.prisma.tickets.findMany({
        where,
        select: { id: true, ticket_no: true, title: true, priority: true, status: true, due_at: true },
        orderBy: [{ due_at: 'asc' }, { id: 'asc' }],
        take: OVERVIEW_ITEMS,
      }),
    ]);
    return {
      active,
      overdue,
      items: rows.map((row) => ({
        id: row.id,
        ticketNo: row.ticket_no,
        title: row.title,
        priority: row.priority as TicketPriority,
        status: row.status as TicketStatus,
        dueAt: row.due_at.toISOString(),
        overdue: isTicketOverdue(row.status as TicketStatus, row.due_at, now),
      })),
    };
  }

  private async approvals(actor: Actor): Promise<Overview['approvals']> {
    const { access } = actor;
    const expenses = access.can('approve', 'expenses');
    const handovers = access.can('approve', 'payments');
    const forms = access.can('approve', 'forms');
    const [e, h, f, p] = await Promise.all([
      expenses ? this.pendingExpenses(actor) : null,
      handovers ? this.pendingHandovers(actor) : null,
      forms ? this.openFormItems(actor) : null,
      payrollWaiting(this.prisma, actor),
    ]);
    if (!e && !h && !f && !p) return null;
    return { expenses: e, handovers: h, forms: f, payroll: p };
  }

  /** Pending expenses someone else asked for (nobody approves their own). */
  private async pendingExpenses(actor: Actor) {
    const where: Prisma.expensesWhereInput = {
      society_id: actor.societyId,
      status: 'pending',
      OR: [{ requested_by: null }, { requested_by: { not: actor.userId } }],
    };
    const [count, rows] = await Promise.all([
      this.prisma.expenses.count({ where }),
      this.prisma.expenses.findMany({
        where,
        select: {
          id: true,
          title: true,
          amount: true,
          created_at: true,
          expense_lines: { select: { description: true }, orderBy: { position: 'asc' }, take: 1 },
          users_expenses_requested_byTousers: userName,
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: OVERVIEW_ITEMS,
      }),
    ]);
    return {
      count,
      items: rows.map((row) => ({
        id: row.id,
        description: row.title ?? row.expense_lines[0]?.description ?? '',
        amount: row.amount.toFixed(2),
        requestedBy: row.users_expenses_requested_byTousers ? userRef(row.users_expenses_requested_byTousers) : null,
        at: row.created_at.toISOString(),
      })),
    };
  }

  /** Unconfirmed handovers by others whose payments all lie in the caller's `payments.approve` area. */
  private async pendingHandovers(actor: Actor) {
    const scope = actor.access.paths('approve', 'payments');
    const inside =
      scope === 'all'
        ? Prisma.sql`TRUE`
        : Prisma.sql`NOT EXISTS (
            SELECT 1 FROM payments p LEFT JOIN locations l ON l.id = p.unit_id
            WHERE p.handover_id = h.id AND (l.path IS NULL OR NOT ${inScope(actor.access, 'approve', 'payments')}))`;
    const where = Prisma.sql`h.society_id = ${actor.societyId}::uuid AND h.confirmed_at IS NULL
      AND h.collector_id <> ${actor.userId}::uuid AND ${inside}`;
    const [[{ count }], rows] = await Promise.all([
      this.prisma.$queryRaw<[{ count: number }]>`SELECT count(*)::int AS count FROM cash_handovers h WHERE ${where}`,
      this.prisma.$queryRaw<{ id: string; collector_id: string; created_at: Date; payments: number; amount: string }[]>`
        SELECT h.id, h.collector_id, h.created_at,
               (SELECT count(*)::int FROM payments p WHERE p.handover_id = h.id AND p.voided_at IS NULL) AS payments,
               (SELECT coalesce(sum(p.amount), 0)::numeric(16,2)::text FROM payments p WHERE p.handover_id = h.id AND p.voided_at IS NULL) AS amount
        FROM cash_handovers h WHERE ${where}
        ORDER BY h.created_at DESC, h.id DESC
        LIMIT ${OVERVIEW_ITEMS}`,
    ]);
    const collectors = await this.prisma.users.findMany({ where: { id: { in: rows.map((row) => row.collector_id) } }, ...userName });
    const byId = new Map(collectors.map((user) => [user.id, userRef(user)]));
    return {
      count,
      items: rows.map((row) => ({
        id: row.id,
        collector: byId.get(row.collector_id) ?? { id: row.collector_id, name: '' },
        amount: row.amount,
        payments: row.payments,
        at: row.created_at.toISOString(),
      })),
    };
  }

  /** Open applications in the caller's `forms.approve` area. */
  private async openFormItems(actor: Actor) {
    const where: Prisma.form_submissionsWhereInput = {
      society_id: actor.societyId,
      status: { in: [...OPEN_FORM_STATUSES] },
      ...scopeWhere(actor.access, 'approve', 'forms', (prefix) => ({ locations: { path: { startsWith: prefix } } })),
    };
    const [count, rows] = await Promise.all([
      this.prisma.form_submissions.count({ where }),
      this.prisma.form_submissions.findMany({
        where,
        select: { id: true, reference: true, form_key: true, submitted_at: true, locations: { select: { name: true } } },
        orderBy: [{ submitted_at: 'desc' }, { id: 'desc' }],
        take: OVERVIEW_ITEMS,
      }),
    ]);
    return {
      count,
      items: rows.map((row) => ({
        id: row.id,
        reference: row.reference,
        formKey: toFormKey(row.form_key),
        place: row.locations?.name ?? null,
        at: row.submitted_at.toISOString(),
      })),
    };
  }
}
