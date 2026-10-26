import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  addMoney,
  asciiDigits,
  billToSnapshotSchema,
  CHARGE_KINDS,
  digitVariants,
  isOverdue,
  OPEN_INVOICE_STATUSES,
  OPENING_LINE,
  periodDays,
  toInvoiceKind,
  toInvoiceStatus,
  type BillingLookup,
  type BillingLookupQuery,
  type BillToSnapshot,
  type ChargeKind,
  type InvoiceCreate,
  type InvoiceKind,
  type InvoiceDetail,
  type InvoiceList,
  type InvoiceListQuery,
  type InvoiceRow,
  type InvoiceTotals,
  type InvoiceVoidInput,
  type OpeningArrears,
  type PermissionAction,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { fundClosed, toFundOption } from '../finance/funds.service.js';
import { NumberingService } from '../finance/numbering.service.js';
import { SettingsService } from '../finance/settings.service.js';
import { onlySocietyWide } from '../members/parties.service.js';
import type { CallerAccess } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addressOf, beyondPermissions, TreeService } from '../property/tree.service.js';
import { BillToService, type BillableUnit } from './bill-to.service.js';
import { unitsDues } from './unit-dues.js';

type Tx = Prisma.TransactionClient;

type LineSpec = { chargeTypeId: string; amount: string; description: string | null; descriptionEn: string | null };

/** A bill to issue: for a unit, or for a member (`personId`). */
type BillSpec = {
  kind: InvoiceKind;
  unitId: string | null;
  personId: string | null;
  issueDate: string;
  dueDate: string;
  period: { start: string; end: string } | null;
  lines: LineSpec[];
};

const userName = { select: { phone: true, persons: { select: { full_name: true } } } } as const;

/** What a bill row reads; `toInvoiceRow` turns it into the contract. */
export const invoiceSelect = {
  id: true,
  invoice_no: true,
  kind: true,
  status: true,
  issue_date: true,
  due_date: true,
  period_start: true,
  period_end: true,
  total: true,
  paid: true,
  bill_to_snapshot: true,
  unit_id: true,
  created_at: true,
  void_reason: true,
  voided_at: true,
  units: { select: { locations: { select: { path: true } } } },
  funds: { select: { id: true, name_bn: true, name_en: true, is_default: true } },
  users: userName,
  users_voided: userName,
  invoice_lines: {
    select: {
      id: true,
      description: true,
      description_en: true,
      amount: true,
      charge_types: { select: { id: true, name_bn: true, name_en: true, kind: true } },
    },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.invoicesSelect;
export type InvoiceRowData = Prisma.invoicesGetPayload<{ select: typeof invoiceSelect }>;
type Row = InvoiceRowData;
const select = invoiceSelect;

const nameOf = (user: { phone: string; persons: { full_name: string } | null } | null) => (user ? (user.persons?.full_name ?? user.phone) : null);
const toKind = (kind: string): ChargeKind => ((CHARGE_KINDS as readonly string[]).includes(kind) ? (kind as ChargeKind) : 'fee');

export const invoiceNotFound = () => new NotFoundException({ code: 'invoice_not_found', message: 'Bill not found' });
const unitNotFound = () => new NotFoundException({ code: 'unit_not_found', message: 'Unit not found' });
const bad = (code: string, message: string) => new BadRequestException({ code, message });
const conflict = (code: string, message: string) => new ConflictException({ code, message });

/** `\`, `%` and `_` typed in a search mean themselves. */
const likeTerm = (term: string) => `%${term.replace(/[\\%_]/g, '\\$&')}%`;

/**
 * Bills (`invoices`): made by hand for a unit or a member, or as a unit's opening arrears.
 * Lines are fixed once issued; a wrong bill is voided while nothing is paid on it and made
 * again. Area-scoped through the unit's location; a membership bill has no unit, so only a
 * society-wide billing role sees or makes one. Nothing is ever deleted.
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tree: TreeService,
    private readonly billTo: BillToService,
    private readonly numbering: NumberingService,
    private readonly settings: SettingsService,
  ) {}

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  async list(actor: Actor, query: InvoiceListQuery): Promise<InvoiceList> {
    const { page, pageSize } = query;
    const today = isoDate(todayDate());
    const base = await this.baseFilters(actor, query);
    const where = Prisma.join([...base, ...this.listFilters(query, today)], ' AND ');
    const from = Prisma.sql`invoices i LEFT JOIN locations l ON l.id = i.unit_id`;

    const [ids, [{ count }], totals] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT i.id FROM ${from} WHERE ${where}
        ORDER BY i.issue_date DESC, i.invoice_no DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      this.prisma.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM ${from} WHERE ${where}`,
      this.totals(actor, query, today),
    ]);
    const rows = await this.prisma.invoices.findMany({ where: { id: { in: ids.map((row) => row.id) } }, select });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const items = ids.flatMap(({ id }) => {
      const row = byId.get(id);
      return row ? [toInvoiceRow(row, today)] : [];
    });
    return { items, total: count, page, pageSize, totals };
  }

  async get(actor: Actor, id: string): Promise<InvoiceDetail> {
    const row = await this.prisma.invoices.findFirst({ where: { id, society_id: actor.societyId }, select });
    if (!row || !canSeeBill(actor.access, row)) throw invoiceNotFound();
    const [detail] = await this.details(actor, [row]);
    return detail!;
  }

  /** Full bills for rows the caller may already see, in the same order, with one receipt header for all. */
  async details(actor: Actor, rows: InvoiceRowData[]): Promise<InvoiceDetail[]> {
    const today = isoDate(todayDate());
    const unitIds = [...new Set(rows.flatMap((row) => (row.unit_id ? [row.unit_id] : [])))];
    const [allocations, header, print, dues] = await Promise.all([
      this.prisma.payment_allocations.findMany({
        where: { invoice_id: { in: rows.map((row) => row.id) } },
        select: { invoice_id: true, amount: true, payments: { select: { id: true, receipt_no: true, received_at: true, voided_at: true } } },
        orderBy: [{ payments: { received_at: 'asc' } }, { payment_id: 'asc' }],
      }),
      this.settings.receiptHeader(actor.societyId),
      this.settings.billPrint(actor.societyId),
      unitsDues(this.prisma, actor.societyId, unitIds),
    ]);
    const otherDue = (row: Row) => {
      const unit = row.unit_id ? dues.get(row.unit_id) : undefined;
      if (!unit) return { owed: '0.00', bills: 0 };
      // The bill itself is in the unit's sum while it is unpaid or part-paid.
      const own = row.status === 'unpaid' || row.status === 'partial';
      return { owed: (own ? unit.owed.minus(row.total.minus(row.paid)) : unit.owed).toFixed(2), bills: unit.bills - (own ? 1 : 0) };
    };
    return rows.map((row) => ({
      ...toInvoiceRow(row, today),
      fund: toFundOption(row.funds),
      lines: row.invoice_lines.map((line) => ({
        id: line.id,
        chargeType: { id: line.charge_types.id, nameBn: line.charge_types.name_bn, nameEn: line.charge_types.name_en, kind: toKind(line.charge_types.kind) },
        description: line.description,
        descriptionEn: line.description_en,
        amount: line.amount.toFixed(2),
      })),
      createdAt: row.created_at.toISOString(),
      createdBy: nameOf(row.users),
      void: row.voided_at && row.void_reason ? { reason: row.void_reason, at: row.voided_at.toISOString(), by: nameOf(row.users_voided) } : null,
      payments: allocations
        .filter((allocation) => allocation.invoice_id === row.id)
        .map((allocation) => ({
          id: allocation.payments.id,
          receiptNo: allocation.payments.receipt_no,
          receivedDay: isoDate(todayDate(allocation.payments.received_at)),
          amount: allocation.amount.toFixed(2),
          voided: allocation.payments.voided_at !== null,
        })),
      header,
      otherDue: otherDue(row),
      print,
      can: { void: row.status === 'unpaid' && row.paid.isZero() && allowed(actor.access, 'approve', pathOf(row)) },
    }));
  }

  /** Units and members to bill, for the new-bill form. */
  async lookup(actor: Actor, query: BillingLookupQuery): Promise<BillingLookup> {
    const { q, unitId } = query;
    if (!q && !unitId) return { units: [], members: [] };
    const scope = actor.access.paths('create', 'billing');
    const and: Prisma.unitsWhereInput[] = [{ society_id: actor.societyId }];
    if (scope !== 'all') and.push({ OR: scope.map((prefix) => ({ locations: { path: { startsWith: prefix } } })) });
    if (unitId) and.push({ location_id: unitId });
    if (q) {
      and.push({
        OR: digitVariants(q).flatMap((term) => [
          { locations: { name: { contains: term, mode: 'insensitive' as const } } },
          { locations: { code: { contains: term, mode: 'insensitive' as const } } },
        ]),
      });
    }
    const units = await this.prisma.units.findMany({
      where: { AND: and },
      select: { location_id: true, locations: { select: { name: true, code: true, path: true, is_active: true } } },
      orderBy: [{ locations: { name: 'asc' } }, { location_id: 'asc' }],
      take: 10,
    });
    const unitRows = units.map((unit) => ({ id: unit.location_id, path: unit.locations.path }));
    const [choices, names, openings] = await Promise.all([
      this.billTo.choose(actor.societyId, unitRows),
      this.tree.addressNames(actor.societyId, unitRows.map((unit) => unit.path)),
      this.prisma.invoices.findMany({
        where: { society_id: actor.societyId, kind: 'opening', status: { not: 'void' }, unit_id: { in: unitRows.map((unit) => unit.id) } },
        select: { unit_id: true },
      }),
    ]);
    const parties = await this.billTo.parties([...choices.values()].flatMap((choice) => (choice ? [choice.payer] : [])));
    const withOpening = new Set(openings.map((row) => row.unit_id));

    const members =
      q && scope === 'all'
        ? await this.prisma.memberships.findMany({
            where: {
              society_id: actor.societyId,
              status: 'active',
              OR: [
                ...digitVariants(q).flatMap((term) => [
                  { persons: { full_name: { contains: term, mode: 'insensitive' as const } } },
                  { persons: { full_name_en: { contains: term, mode: 'insensitive' as const } } },
                ]),
                { persons: { phone: { contains: asciiDigits(q) } } },
                ...(/^\d{1,9}$/.test(asciiDigits(q)) ? [{ member_no: Number(asciiDigits(q)) }] : []),
              ],
            },
            select: { member_no: true, person_id: true },
            orderBy: { member_no: 'asc' },
            take: 10,
          })
        : [];
    const memberParties = await this.billTo.parties(members.map((m) => ({ kind: 'person' as const, id: m.person_id })));

    return {
      units: units.map((unit) => {
        const choice = choices.get(unit.location_id) ?? null;
        const party = choice ? parties.get(choice.payer.id) : undefined;
        return {
          id: unit.location_id,
          name: unit.locations.name,
          code: unit.locations.code,
          address: addressOf(unit.locations.path, names),
          isActive: unit.locations.is_active,
          billTo: choice && party ? { ...party, role: choice.role } : null,
          hasOpening: withOpening.has(unit.location_id),
        };
      }),
      members: members.flatMap((m) => {
        const party = memberParties.get(m.person_id);
        return party ? [{ ...party, memberNo: m.member_no }] : [];
      }),
    };
  }

  // -------------------------------------------------------------------------
  // Writing
  // -------------------------------------------------------------------------

  /** A bill for a unit or, with `personId`, a membership fee. Dated today. */
  async create(actor: Actor, input: InvoiceCreate): Promise<InvoiceDetail> {
    const today = isoDate(todayDate());
    return this.issue(actor, {
      kind: input.personId ? 'membership' : 'regular',
      unitId: input.unitId ?? null,
      personId: input.personId ?? null,
      issueDate: today,
      dueDate: input.dueDate,
      period: periodDays(input.periodFrom, input.periodTo),
      lines: input.lines,
    });
  }

  /** A unit's dues from before the system: one line, dated and due on `asOf`. */
  async createOpening(actor: Actor, input: OpeningArrears): Promise<InvoiceDetail> {
    const note = input.note ? ` (${input.note})` : '';
    return this.issue(actor, {
      kind: 'opening',
      unitId: input.unitId,
      personId: null,
      issueDate: input.asOf,
      dueDate: input.asOf,
      period: null,
      lines: [
        { chargeTypeId: input.chargeTypeId, amount: input.amount, description: `${OPENING_LINE.bn}${note}`, descriptionEn: `${OPENING_LINE.en}${note}` },
      ],
    });
  }

  private async issue(actor: Actor, spec: BillSpec): Promise<InvoiceDetail> {
    const today = isoDate(todayDate());
    const { issueDate, dueDate } = spec;
    if (issueDate > today) throw bad('future_date', 'The date is in the future');
    if (dueDate < issueDate) throw bad('due_before_issue', 'The due date is before the bill date');
    let id: string;
    try {
      id = (await this.prisma.$transaction((tx) => this.issueIn(tx, actor, spec))).id;
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('opening_exists', 'This unit already has its earlier arrears entered');
      throw error;
    }
    return this.get(actor, id);
  }

  /**
   * Writes a regular unit bill inside the caller's transaction (e.g. a sticker fee): the same
   * checks as `POST /invoices` (`billing.create` at the unit, someone to bill, one open fund).
   * Dated today. Returns its id and number.
   */
  async issueUnitBillIn(tx: Tx, actor: Actor, unitId: string, dueDate: string, lines: LineSpec[]): Promise<{ id: string; invoiceNo: string }> {
    const today = isoDate(todayDate());
    return this.issueIn(tx, actor, { kind: 'regular', unitId, personId: null, issueDate: today, dueDate: dueDate < today ? today : dueDate, period: null, lines });
  }

  /** A regular unit bill with its period, dated today, inside the caller's transaction (a batch). The same checks as `POST /invoices`. */
  async issueRegularIn(tx: Tx, actor: Actor, bill: Pick<BillSpec, 'dueDate' | 'period' | 'lines'> & { unitId: string }): Promise<{ id: string; invoiceNo: string }> {
    return this.issueIn(tx, actor, { kind: 'regular', personId: null, issueDate: isoDate(todayDate()), ...bill });
  }

  private async issueIn(tx: Tx, actor: Actor, spec: BillSpec): Promise<{ id: string; invoiceNo: string }> {
    const { kind, issueDate, dueDate, period, lines } = spec;
    const target = await this.target(tx, actor, spec);
    const fundId = await this.lineFund(tx, actor.societyId, lines.map((line) => line.chargeTypeId));
    const names = await tx.charge_types.findMany({
      where: { id: { in: lines.map((line) => line.chargeTypeId) } },
      select: { id: true, name_bn: true, name_en: true },
    });
    const nameOfType = new Map(names.map((row) => [row.id, row]));

    const number = await this.numbering.next(tx, actor.societyId, 'invoice', issueDate);
    const total = addMoney(...lines.map((line) => line.amount));
    const created = await tx.invoices.create({
      data: {
        society_id: actor.societyId,
        invoice_no: number.formatted,
        kind,
        unit_id: target.unit?.id ?? null,
        membership_id: target.membershipId,
        bill_to_person_id: target.snapshot.kind === 'person' ? target.snapshot.id : null,
        bill_to_organisation_id: target.snapshot.kind === 'organisation' ? target.snapshot.id : null,
        bill_to_snapshot: target.snapshot,
        fund_id: fundId,
        period_start: period ? day(period.start) : null,
        period_end: period ? day(period.end) : null,
        issue_date: day(issueDate),
        due_date: day(dueDate),
        total: new Prisma.Decimal(total),
        status: 'unpaid',
        created_by: actor.userId,
        invoice_lines: {
          create: lines.map((line, position) => ({
            charge_type_id: line.chargeTypeId,
            unit_id: target.unit?.id ?? null,
            period_start: period ? day(period.start) : null,
            description: line.description ?? nameOfType.get(line.chargeTypeId)!.name_bn,
            description_en: line.descriptionEn ?? (line.description ? null : nameOfType.get(line.chargeTypeId)!.name_en),
            amount: new Prisma.Decimal(line.amount),
            position,
          })),
        },
      },
      select: { id: true },
    });
    await this.audit.record(
      {
        ...auditOf(actor, 'create', created.id),
        after: {
          invoiceNo: number.formatted,
          kind,
          unitId: target.unit?.id ?? null,
          billTo: { kind: target.snapshot.kind, id: target.snapshot.id, role: target.snapshot.role },
          fundId,
          issueDate,
          dueDate,
          period,
          total,
          lines: lines.map((line) => ({ chargeTypeId: line.chargeTypeId, amount: line.amount, description: line.description ?? null })),
        },
      },
      tx,
    );
    return { id: created.id, invoiceNo: number.formatted };
  }

  /** Voids a bill nothing has been paid on. The lines stay as they were; the bill no longer counts. */
  async void(actor: Actor, id: string, input: InvoiceVoidInput): Promise<InvoiceDetail> {
    await this.prisma.$transaction(async (tx) => {
      // A payment locks the bill too, so it can't land between the check and the update.
      await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${id}::uuid AND society_id = ${actor.societyId}::uuid FOR UPDATE`;
      const row = await tx.invoices.findFirst({
        where: { id, society_id: actor.societyId },
        select: { status: true, paid: true, invoice_no: true, total: true, units: { select: { locations: { select: { path: true } } } } },
      });
      if (!row || !allowed(actor.access, 'view', pathOf(row))) throw invoiceNotFound();
      if (!allowed(actor.access, 'approve', pathOf(row))) throw beyondPermissions();
      if (row.status === 'void') throw conflict('already_void', 'This bill is already void');
      if (!row.paid.isZero() || row.status !== 'unpaid') throw conflict('invoice_has_payments', 'Money has been paid on this bill');
      await tx.invoices.update({
        where: { id },
        data: { status: 'void', void_reason: input.reason, voided_at: new Date(), voided_by: actor.userId },
      });
      await this.audit.record(
        {
          ...auditOf(actor, 'void', id),
          before: { invoiceNo: row.invoice_no, status: row.status, total: row.total.toFixed(2) },
          after: { status: 'void', reason: input.reason },
        },
        tx,
      );
    });
    return this.get(actor, id);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Who and what the bill is for: a unit in the caller's area with someone to bill, or an active member. */
  private async target(
    tx: Tx,
    actor: Actor,
    input: Pick<BillSpec, 'unitId' | 'personId'>,
  ): Promise<{ unit: BillableUnit | null; membershipId: string | null; snapshot: BillToSnapshot }> {
    if (input.personId) {
      if (actor.access.paths('create', 'billing') !== 'all') throw onlySocietyWide();
      const membership = await tx.memberships.findFirst({
        where: { society_id: actor.societyId, person_id: input.personId, status: 'active' },
        select: { id: true, member_no: true },
      });
      if (!membership) throw bad('no_membership', 'This person has no active membership');
      const snapshot = await this.billTo.snapshot(tx, actor.societyId, { kind: 'person', id: input.personId }, 'member', null, membership.member_no);
      return { unit: null, membershipId: membership.id, snapshot };
    }

    const row = await tx.units.findFirst({
      where: { location_id: input.unitId!, society_id: actor.societyId },
      select: { location_id: true, locations: { select: { name: true, code: true, path: true, is_active: true } } },
    });
    if (!row || !actor.access.can('view', 'billing', { path: row.locations.path })) throw unitNotFound();
    if (!actor.access.can('create', 'billing', { path: row.locations.path })) throw beyondPermissions();
    const unit: BillableUnit = {
      id: row.location_id,
      name: row.locations.name,
      code: row.locations.code,
      path: row.locations.path,
      isActive: row.locations.is_active,
    };
    if (!unit.isActive) throw bad('unit_inactive', 'This unit is inactive');
    const choice = (await this.billTo.choose(actor.societyId, [unit], tx)).get(unit.id);
    if (!choice) throw bad('no_bill_to', 'Nobody owns or rents this unit, so there is no one to bill');
    const snapshot = await this.billTo.snapshot(tx, actor.societyId, choice.payer, choice.role, unit);
    return { unit, membershipId: null, snapshot };
  }

  /** The one fund all these charge types pay into; each must be this society's and not archived, and the fund open. */
  private async lineFund(tx: Tx, societyId: string, chargeTypeIds: string[]): Promise<string> {
    const ids = [...new Set(chargeTypeIds)];
    const types = await tx.charge_types.findMany({
      where: { id: { in: ids }, society_id: societyId },
      select: { archived_at: true, fund_id: true, funds: { select: { closed_at: true } } },
    });
    if (types.length !== ids.length) throw bad('invalid_charge_type', 'Unknown charge type');
    if (types.some((type) => type.archived_at)) throw bad('charge_type_archived', 'This charge type is no longer used');
    const funds = new Set(types.map((type) => type.fund_id));
    if (funds.size > 1) throw bad('mixed_funds', 'All lines of one bill must pay into the same fund');
    if (types[0]!.funds.closed_at) throw fundClosed();
    return types[0]!.fund_id;
  }

  /** The caller's area and the area, month, unit and payer filters: what the totals respect. */
  private async baseFilters(actor: Actor, query: InvoiceListQuery, withMonth = true): Promise<Prisma.Sql[]> {
    const and = [Prisma.sql`i.society_id = ${actor.societyId}::uuid`];
    const scope = actor.access.paths('view', 'billing');
    // A scoped caller sees bills of units under their scope; membership bills have no unit.
    if (scope !== 'all') {
      and.push(scope.length ? Prisma.sql`(${Prisma.join(scope.map((prefix) => Prisma.sql`starts_with(l.path, ${prefix})`), ' OR ')})` : Prisma.sql`false`);
    }
    if (query.areaId) {
      const area = await this.tree.find(actor.societyId, query.areaId);
      // An unknown area matches nothing rather than everything.
      and.push(area ? Prisma.sql`starts_with(l.path, ${area.path})` : Prisma.sql`false`);
    }
    if (withMonth && query.month) {
      const month = periodDays(query.month, null)!;
      and.push(Prisma.sql`i.issue_date BETWEEN ${month.start}::date AND ${month.end}::date`);
    }
    if (query.unitId) and.push(Prisma.sql`i.unit_id = ${query.unitId}::uuid`);
    if (query.personId) and.push(Prisma.sql`i.bill_to_person_id = ${query.personId}::uuid`);
    if (query.organisationId) and.push(Prisma.sql`i.bill_to_organisation_id = ${query.organisationId}::uuid`);
    return and;
  }

  private listFilters(query: InvoiceListQuery, today: string): Prisma.Sql[] {
    const and: Prisma.Sql[] = [];
    if (query.q) {
      const terms = digitVariants(query.q).map((term) => {
        const like = likeTerm(term);
        return Prisma.sql`(i.invoice_no ILIKE ${like} OR l.name ILIKE ${like} OR l.code ILIKE ${like}
          OR i.bill_to_snapshot->>'name' ILIKE ${like} OR i.bill_to_snapshot->>'nameEn' ILIKE ${like})`;
      });
      and.push(Prisma.sql`(${Prisma.join(terms, ' OR ')})`);
    }
    if (query.status === 'overdue') {
      and.push(Prisma.sql`i.status IN ('unpaid', 'partial') AND i.due_date < ${today}::date`);
    } else if (query.status) {
      and.push(Prisma.sql`i.status = ${query.status}`);
    }
    if (query.kind) and.push(Prisma.sql`i.kind = ${query.kind}`);
    return and;
  }

  private async totals(actor: Actor, query: InvoiceListQuery, today: string): Promise<InvoiceTotals> {
    const from = Prisma.sql`invoices i LEFT JOIN locations l ON l.id = i.unit_id`;
    const open = Prisma.sql`i.status IN ('unpaid', 'partial')`;
    const [inMonth, anyMonth] = await Promise.all([this.baseFilters(actor, query), this.baseFilters(actor, query, false)]);
    const [[figures], [arrears]] = await Promise.all([
      this.prisma.$queryRaw<{ billed: string; billed_count: number; collected: string; outstanding: string; overdue_count: number }[]>`
        SELECT coalesce(sum(i.total) FILTER (WHERE i.status <> 'void'), 0)::numeric(16,2)::text AS billed,
               (count(*) FILTER (WHERE i.status <> 'void'))::int AS billed_count,
               coalesce(sum(i.paid) FILTER (WHERE i.status <> 'void'), 0)::numeric(16,2)::text AS collected,
               coalesce(sum(i.total - i.paid) FILTER (WHERE ${open}), 0)::numeric(16,2)::text AS outstanding,
               (count(*) FILTER (WHERE ${open} AND i.due_date < ${today}::date))::int AS overdue_count
        FROM ${from} WHERE ${Prisma.join(inMonth, ' AND ')}`,
      this.prisma.$queryRaw<{ amount: string; units: number }[]>`
        SELECT coalesce(sum(i.total - i.paid), 0)::numeric(16,2)::text AS amount, count(DISTINCT i.unit_id)::int AS units
        FROM ${from} WHERE ${Prisma.join(anyMonth, ' AND ')} AND i.kind = 'opening' AND ${open}`,
    ]);
    return {
      billed: figures!.billed,
      billedCount: figures!.billed_count,
      collected: figures!.collected,
      outstanding: figures!.outstanding,
      overdueCount: figures!.overdue_count,
      earlierArrears: arrears!.amount,
      earlierArrearsUnits: arrears!.units,
    };
  }
}

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const pathOf = (row: { units: { locations: { path: string } } | null }) => row.units?.locations.path ?? null;

/** A bill with a unit is checked on the unit's location; one without (membership) needs a society-wide grant. */
function allowed(access: CallerAccess, action: PermissionAction, path: string | null): boolean {
  return path ? access.can(action, 'billing', { path }) : access.paths(action, 'billing') === 'all';
}

/** May the caller see this bill (`billing.view` at its unit, or society-wide for a membership bill)? */
export const canSeeBill = (access: CallerAccess, row: { units: { locations: { path: string } } | null }) => allowed(access, 'view', pathOf(row));

export function toInvoiceRow(row: Row, today: string): InvoiceRow {
  const status = toInvoiceStatus(row.status);
  const dueDate = isoDate(row.due_date);
  const charges = new Map<string, { nameBn: string; nameEn: string | null }>();
  for (const line of row.invoice_lines) {
    if (!charges.has(line.charge_types.id)) charges.set(line.charge_types.id, { nameBn: line.charge_types.name_bn, nameEn: line.charge_types.name_en });
  }
  return {
    id: row.id,
    invoiceNo: row.invoice_no,
    kind: toInvoiceKind(row.kind),
    status,
    overdue: isOverdue(status, dueDate, today),
    issueDate: isoDate(row.issue_date),
    dueDate,
    periodStart: row.period_start ? isoDate(row.period_start) : null,
    periodEnd: row.period_end ? isoDate(row.period_end) : null,
    total: row.total.toFixed(2),
    paid: row.paid.toFixed(2),
    due: (OPEN_INVOICE_STATUSES as readonly string[]).includes(status) ? row.total.minus(row.paid).toFixed(2) : '0.00',
    billTo: billToSnapshotSchema.parse(row.bill_to_snapshot),
    charges: [...charges.values()],
  };
}

const auditOf = (actor: Actor, action: string, entityId: string) => ({
  societyId: actor.societyId,
  userId: actor.userId,
  action,
  entityType: 'invoice',
  entityId,
  ip: actor.ip,
});
