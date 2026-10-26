import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  addMoney,
  allocate,
  asciiDigits,
  byOldest,
  collectorMayVoid,
  digitVariants,
  OPEN_INVOICE_STATUSES,
  payerSnapshotSchema,
  statusAfterPayment,
  storedMethod,
  TIME_ZONE,
  type CollectAccount,
  type CollectLookup,
  type CollectLookupQuery,
  type CollectSummary,
  type InvoiceRow,
  type PayerOption,
  type PayerSnapshot,
  type PaymentCreate,
  type PaymentDetail,
  type PaymentList,
  type PaymentListQuery,
  type PaymentPrint,
  type PaymentRow,
  type PaymentVoidInput,
  type PermissionAction,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { BillToService, type BillableUnit } from '../billing/bill-to.service.js';
import { invoiceNotFound, invoiceSelect, toInvoiceRow } from '../billing/invoices.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { NumberingService } from '../finance/numbering.service.js';
import { SettingsService } from '../finance/settings.service.js';
import { onlySocietyWide } from '../members/parties.service.js';
import type { CallerAccess } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addressOf, beyondPermissions, TreeService } from '../property/tree.service.js';

type Tx = Prisma.TransactionClient;

const userName = { select: { id: true, phone: true, persons: { select: { full_name: true } } } } as const;
const nameOf = (user: { phone: string; persons: { full_name: string } | null }) => user.persons?.full_name ?? user.phone;

const rowSelect = {
  id: true,
  receipt_no: true,
  received_at: true,
  amount: true,
  method: true,
  payer_snapshot: true,
  voided_at: true,
  handover_id: true,
  units: { select: { locations: { select: { path: true } } } },
  users: userName,
  cash_handovers: { select: { confirmed_at: true } },
  payment_allocations: { select: { invoices: { select: { invoice_no: true, due_date: true } } } },
  donations: { select: { id: true, purpose: true, funds: { select: { name_bn: true, name_en: true } } } },
} satisfies Prisma.paymentsSelect;
type Row = Prisma.paymentsGetPayload<{ select: typeof rowSelect }>;

const detailSelect = {
  ...rowSelect,
  method_ref: true,
  note: true,
  print_count: true,
  void_reason: true,
  received_by: true,
  users_voided: userName,
  payment_allocations: {
    select: {
      amount: true,
      invoices: {
        select: {
          id: true,
          invoice_no: true,
          issue_date: true,
          due_date: true,
          period_start: true,
          period_end: true,
          total: true,
          invoice_lines: { select: { description: true, description_en: true, amount: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }] },
        },
      },
    },
  },
} satisfies Prisma.paymentsSelect;

export const paymentNotFound = () => new NotFoundException({ code: 'payment_not_found', message: 'Receipt not found' });
const unitNotFound = () => new NotFoundException({ code: 'unit_not_found', message: 'Unit not found' });
const bad = (code: string, message: string) => new BadRequestException({ code, message });
const conflict = (code: string, message: string) => new ConflictException({ code, message });

/** `\`, `%` and `_` typed in a search mean themselves. */
const likeTerm = (term: string) => `%${term.replace(/[\\%_]/g, '\\$&')}%`;

/** A payment's Dhaka day, in SQL. */
const dhakaDay = Prisma.sql`(p.received_at AT TIME ZONE ${TIME_ZONE})::date`;

/**
 * Cash taken at the office (`payments`): one receipt settles open bills of one unit, or one
 * member's membership bills, oldest first. Area-scoped through the payment's unit; a payment
 * with no unit (membership) needs a society-wide grant. Never deleted: a mistake is voided,
 * which gives the bills their dues back and reverses the ledger rows.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tree: TreeService,
    private readonly billTo: BillToService,
    private readonly numbering: NumberingService,
    private readonly settings: SettingsService,
  ) {}

  // -------------------------------------------------------------------------
  // Finding what to collect
  // -------------------------------------------------------------------------

  /** Units (and, for society-wide collectors, members) with their open bills, oldest first. */
  async lookup(actor: Actor, query: CollectLookupQuery): Promise<CollectLookup> {
    const { q, unitId, personId } = query;
    if (!q && !unitId && !personId) return { accounts: [] };
    const scope = actor.access.paths('create', 'payments');
    const today = isoDate(todayDate());

    // Units by name or code, or by who their open bills went to.
    let unitIds: string[] = [];
    if (unitId) unitIds = [unitId];
    else if (q) {
      const terms = digitVariants(q);
      const [byName, byPayer] = await Promise.all([
        this.prisma.units.findMany({
          where: {
            society_id: actor.societyId,
            OR: terms.flatMap((term) => [
              { locations: { name: { contains: term, mode: 'insensitive' as const } } },
              { locations: { code: { contains: term, mode: 'insensitive' as const } } },
            ]),
          },
          select: { location_id: true },
          take: 25,
        }),
        this.prisma.$queryRaw<{ unit_id: string }[]>`
          SELECT DISTINCT i.unit_id FROM invoices i
          WHERE i.society_id = ${actor.societyId}::uuid AND i.unit_id IS NOT NULL AND i.status IN ('unpaid', 'partial')
            AND (${Prisma.join(
              terms.map((term) => Prisma.sql`i.bill_to_snapshot->>'name' ILIKE ${likeTerm(term)} OR i.bill_to_snapshot->>'nameEn' ILIKE ${likeTerm(term)}`),
              ' OR ',
            )} OR i.bill_to_snapshot->>'phone' LIKE ${likeTerm(asciiDigits(q))})
          LIMIT 25`,
      ]);
      unitIds = [...new Set([...byName.map((row) => row.location_id), ...byPayer.map((row) => row.unit_id)])];
    }
    const units = unitIds.length
      ? await this.prisma.units.findMany({
          where: {
            society_id: actor.societyId,
            location_id: { in: unitIds },
            ...(scope === 'all' ? {} : { OR: scope.map((prefix) => ({ locations: { path: { startsWith: prefix } } })) }),
          },
          select: { location_id: true, locations: { select: { name: true, code: true, path: true } } },
          orderBy: [{ locations: { name: 'asc' } }, { location_id: 'asc' }],
          take: 10,
        })
      : [];

    // Members, for membership fees: only a society-wide collector takes those.
    let members: { person_id: string; member_no: number; name: string }[] = [];
    if (scope === 'all' && (personId || (q && !unitId))) {
      const rows = await this.prisma.memberships.findMany({
        where: {
          society_id: actor.societyId,
          ...(personId
            ? { person_id: personId }
            : {
                OR: [
                  ...digitVariants(q!).flatMap((term) => [
                    { persons: { full_name: { contains: term, mode: 'insensitive' as const } } },
                    { persons: { full_name_en: { contains: term, mode: 'insensitive' as const } } },
                  ]),
                  { persons: { phone: { contains: asciiDigits(q!) } } },
                  ...(/^\d{1,9}$/.test(asciiDigits(q!)) ? [{ member_no: Number(asciiDigits(q!)) }] : []),
                ],
              }),
          invoices: { some: { status: { in: [...OPEN_INVOICE_STATUSES] } } },
        },
        select: { person_id: true, member_no: true, persons: { select: { full_name: true } } },
        orderBy: { member_no: 'asc' },
        take: 10,
      });
      members = rows.map((row) => ({ person_id: row.person_id, member_no: row.member_no, name: row.persons.full_name }));
    }

    const [unitBills, memberBills, names] = await Promise.all([
      units.length
        ? this.prisma.invoices.findMany({
            where: { society_id: actor.societyId, unit_id: { in: units.map((u) => u.location_id) }, status: { in: [...OPEN_INVOICE_STATUSES] } },
            select: { ...invoiceSelect, unit_id: true },
          })
        : [],
      members.length
        ? this.prisma.invoices.findMany({
            where: {
              society_id: actor.societyId,
              kind: 'membership',
              status: { in: [...OPEN_INVOICE_STATUSES] },
              memberships: { person_id: { in: members.map((m) => m.person_id) } },
            },
            select: { ...invoiceSelect, memberships: { select: { person_id: true } } },
          })
        : [],
      this.tree.addressNames(actor.societyId, units.map((u) => u.locations.path)),
    ]);

    const account = (base: Omit<CollectAccount, 'bills' | 'due' | 'payers'>, bills: InvoiceRow[]): CollectAccount => {
      const sorted = [...bills].sort(byOldest);
      return { ...base, bills: sorted, due: addMoney('0', ...sorted.map((bill) => bill.due)), payers: payersOf(sorted) };
    };
    return {
      accounts: [
        ...units.map((unit) =>
          account(
            { kind: 'unit', id: unit.location_id, name: unit.locations.name, code: unit.locations.code, address: addressOf(unit.locations.path, names), memberNo: null },
            unitBills.filter((bill) => bill.unit_id === unit.location_id).map((bill) => toInvoiceRow(bill, today)),
          ),
        ),
        ...members.map((member) =>
          account(
            { kind: 'member', id: member.person_id, name: member.name, code: null, address: [], memberNo: member.member_no },
            memberBills.filter((bill) => bill.memberships?.person_id === member.person_id).map((bill) => toInvoiceRow(bill, today)),
          ),
        ),
      ],
    };
  }

  /** The collect page's stat cards, for the caller. */
  async summary(actor: Actor): Promise<CollectSummary> {
    const today = isoDate(todayDate());
    const mine = Prisma.sql`p.society_id = ${actor.societyId}::uuid AND p.received_by = ${actor.userId}::uuid AND p.voided_at IS NULL`;
    const [[figures], [pending], header] = await Promise.all([
      this.prisma.$queryRaw<{ today_count: number; today_amount: string; hand_count: number; hand_amount: string }[]>`
        SELECT (count(*) FILTER (WHERE ${dhakaDay} = ${today}::date))::int AS today_count,
               coalesce(sum(p.amount) FILTER (WHERE ${dhakaDay} = ${today}::date), 0)::numeric(16,2)::text AS today_amount,
               (count(*) FILTER (WHERE p.handover_id IS NULL AND p.method = 'cash'))::int AS hand_count,
               coalesce(sum(p.amount) FILTER (WHERE p.handover_id IS NULL AND p.method = 'cash'), 0)::numeric(16,2)::text AS hand_amount
        FROM payments p WHERE ${mine}`,
      this.prisma.$queryRaw<{ count: number; amount: string }[]>`
        SELECT count(DISTINCT h.id)::int AS count, coalesce(sum(p.amount), 0)::numeric(16,2)::text AS amount
        FROM cash_handovers h JOIN payments p ON p.handover_id = h.id AND p.voided_at IS NULL
        WHERE h.society_id = ${actor.societyId}::uuid AND h.collector_id = ${actor.userId}::uuid AND h.confirmed_at IS NULL`,
      this.settings.receiptHeader(actor.societyId),
    ]);
    return {
      today: { count: figures!.today_count, amount: figures!.today_amount },
      inHand: { count: figures!.hand_count, amount: figures!.hand_amount },
      pending: { count: pending!.count, amount: pending!.amount },
      header,
    };
  }

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  async list(actor: Actor, query: PaymentListQuery): Promise<PaymentList> {
    const { page, pageSize } = query;
    const where = Prisma.join(this.filters(actor, query), ' AND ');
    const from = Prisma.sql`payments p LEFT JOIN locations l ON l.id = p.unit_id`;
    const [ids, [figures]] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT p.id FROM ${from} WHERE ${where}
        ORDER BY p.received_at DESC, p.receipt_no DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      this.prisma.$queryRaw<{ total: number; count: number; amount: string; void_count: number }[]>`
        SELECT count(*)::int AS total,
               (count(*) FILTER (WHERE p.voided_at IS NULL))::int AS count,
               coalesce(sum(p.amount) FILTER (WHERE p.voided_at IS NULL), 0)::numeric(16,2)::text AS amount,
               (count(*) FILTER (WHERE p.voided_at IS NOT NULL))::int AS void_count
        FROM ${from} WHERE ${where}`,
    ]);
    const rows = await this.prisma.payments.findMany({ where: { id: { in: ids.map((row) => row.id) } }, select: rowSelect });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return {
      items: ids.flatMap(({ id }) => {
        const row = byId.get(id);
        return row ? [toRow(row)] : [];
      }),
      total: figures!.total,
      page,
      pageSize,
      totals: { count: figures!.count, amount: figures!.amount, voidCount: figures!.void_count },
    };
  }

  async get(actor: Actor, id: string): Promise<PaymentDetail> {
    const row = await this.prisma.payments.findFirst({ where: { id, society_id: actor.societyId }, select: detailSelect });
    if (!row || !allowed(actor.access, 'view', row.units?.locations.path ?? null)) throw paymentNotFound();
    return this.detail(actor, row);
  }

  /**
   * A receipt for a page that has already checked the caller may see it (a donation's page
   * checks `donations.view`). Only the society is checked here.
   */
  async receipt(actor: Actor, id: string): Promise<PaymentDetail> {
    const row = await this.prisma.payments.findFirst({ where: { id, society_id: actor.societyId }, select: detailSelect });
    if (!row) throw paymentNotFound();
    return this.detail(actor, row);
  }

  private async detail(actor: Actor, row: Prisma.paymentsGetPayload<{ select: typeof detailSelect }>): Promise<PaymentDetail> {
    const header = await this.settings.receiptHeader(actor.societyId);
    return {
      ...toRow(row),
      methodRef: row.method_ref,
      note: row.note,
      allocations: [...row.payment_allocations]
        .sort((a, b) => a.invoices.due_date.getTime() - b.invoices.due_date.getTime() || a.invoices.invoice_no.localeCompare(b.invoices.invoice_no))
        .map((allocation) => ({
          invoiceId: allocation.invoices.id,
          invoiceNo: allocation.invoices.invoice_no,
          issueDate: isoDate(allocation.invoices.issue_date),
          periodStart: allocation.invoices.period_start ? isoDate(allocation.invoices.period_start) : null,
          periodEnd: allocation.invoices.period_end ? isoDate(allocation.invoices.period_end) : null,
          total: allocation.invoices.total.toFixed(2),
          amount: allocation.amount.toFixed(2),
          lines: allocation.invoices.invoice_lines.map((line) => ({
            description: line.description,
            descriptionEn: line.description_en,
            amount: line.amount.toFixed(2),
          })),
        })),
      donation: row.donations
        ? { id: row.donations.id, purpose: row.donations.purpose, fund: { nameBn: row.donations.funds.name_bn, nameEn: row.donations.funds.name_en } }
        : null,
      printCount: row.print_count,
      void: row.voided_at && row.void_reason ? { reason: row.void_reason, at: row.voided_at.toISOString(), by: row.users_voided ? nameOf(row.users_voided) : null } : null,
      header,
      can: { void: mayVoidReceipt(actor, { ...row, donation: row.donations !== null, path: row.units?.locations.path ?? null }) },
    };
  }

  // -------------------------------------------------------------------------
  // Writing
  // -------------------------------------------------------------------------

  /**
   * Takes money for the ticked bills: allocations oldest first, each bill's `paid` and status,
   * a receipt number, one `in` ledger row per fund (in the account the method lands in), all
   * in one transaction. The bills are locked first, so two collectors can't pay the same bill twice.
   */
  async create(actor: Actor, input: PaymentCreate): Promise<PaymentDetail> {
    const today = isoDate(todayDate());
    const paidBy = storedMethod(input);
    const id = await this.prisma.$transaction(async (tx) => {
      const account = await this.account(tx, actor, input);

      await tx.$queryRaw`
        SELECT id FROM invoices
        WHERE society_id = ${actor.societyId}::uuid AND id IN (${Prisma.join(input.invoiceIds.map((invoiceId) => Prisma.sql`${invoiceId}::uuid`))})
        ORDER BY id FOR UPDATE`;
      const bills = await tx.invoices.findMany({
        where: { society_id: actor.societyId, id: { in: input.invoiceIds } },
        select: {
          id: true,
          invoice_no: true,
          issue_date: true,
          due_date: true,
          total: true,
          paid: true,
          status: true,
          unit_id: true,
          membership_id: true,
          fund_id: true,
          bill_to_person_id: true,
          bill_to_organisation_id: true,
        },
      });
      if (bills.length !== input.invoiceIds.length) throw invoiceNotFound();
      for (const bill of bills) {
        const belongs = account.unit ? bill.unit_id === account.unit.id : bill.membership_id !== null && account.membershipIds.has(bill.membership_id);
        if (!belongs) throw bad('invoice_not_for_account', 'A ticked bill is not for this unit or member');
        if (!(OPEN_INVOICE_STATUSES as readonly string[]).includes(bill.status)) {
          throw conflict('invoice_changed', 'A ticked bill was paid or voided in the meantime; look it up again');
        }
      }
      const result = allocate(
        bills.map((bill) => ({
          id: bill.id,
          invoiceNo: bill.invoice_no,
          issueDate: isoDate(bill.issue_date),
          dueDate: isoDate(bill.due_date),
          due: bill.total.minus(bill.paid).toFixed(2),
        })),
        input.amount,
      );
      if (!result.ok) {
        throw result.code === 'amount_exceeds_due'
          ? bad('amount_exceeds_due', 'The amount is more than the ticked bills owe')
          : bad('bill_not_reached', 'The amount does not reach every ticked bill; untick the later ones');
      }
      const isPayer = (bill: (typeof bills)[number]) =>
        input.payer.kind === 'person' ? bill.bill_to_person_id === input.payer.id : bill.bill_to_organisation_id === input.payer.id;
      if (!bills.some(isPayer)) throw bad('invalid_payer', 'The payer must be someone the ticked bills were billed to');

      const snapshot = payerSnapshotSchema.parse(
        await this.billTo.snapshot(tx, actor.societyId, input.payer, account.unit ? 'owner' : 'member', account.unit, account.memberNo),
      );
      const number = await this.numbering.next(tx, actor.societyId, 'receipt', today);
      const payment = await tx.payments.create({
        data: {
          society_id: actor.societyId,
          receipt_no: number.formatted,
          payer_person_id: input.payer.kind === 'person' ? input.payer.id : null,
          payer_organisation_id: input.payer.kind === 'organisation' ? input.payer.id : null,
          unit_id: account.unit?.id ?? null,
          payer_snapshot: snapshot,
          amount: new Prisma.Decimal(input.amount),
          method: paidBy.method,
          method_ref: paidBy.ref,
          received_by: actor.userId,
          note: input.note,
        },
        select: { id: true },
      });
      await tx.payment_allocations.createMany({
        data: result.allocations.map((allocation) => ({ payment_id: payment.id, invoice_id: allocation.invoiceId, amount: new Prisma.Decimal(allocation.amount) })),
      });
      const byId = new Map(bills.map((bill) => [bill.id, bill]));
      const perFund = new Map<string, string>();
      for (const allocation of result.allocations) {
        const bill = byId.get(allocation.invoiceId)!;
        const paid = addMoney(bill.paid.toFixed(2), allocation.amount);
        await tx.invoices.update({
          where: { id: bill.id },
          data: { paid: new Prisma.Decimal(paid), status: statusAfterPayment(paid, bill.total.toFixed(2)) },
        });
        perFund.set(bill.fund_id, addMoney(perFund.get(bill.fund_id) ?? '0', allocation.amount));
      }
      for (const [fundId, amount] of perFund) {
        await tx.ledger_entries.create({
          data: {
            society_id: actor.societyId,
            fund_id: fundId,
            entry_date: day(today),
            direction: 'in',
            amount: new Prisma.Decimal(amount),
            account: paidBy.account,
            source_type: 'payment',
            source_id: payment.id,
            memo: number.formatted,
            created_by: actor.userId,
          },
        });
      }
      await this.audit.record(
        {
          ...auditOf(actor, 'create', payment.id),
          after: {
            receiptNo: number.formatted,
            unitId: account.unit?.id ?? null,
            payer: { kind: input.payer.kind, id: input.payer.id },
            amount: input.amount,
            method: paidBy.method,
            methodRef: paidBy.ref,
            allocations: result.allocations,
            note: input.note,
          },
        },
        tx,
      );
      return payment.id;
    });
    return this.get(actor, id);
  }

  /** Counts a print: the first is the original, any later one a duplicate. */
  async print(actor: Actor, id: string): Promise<PaymentPrint> {
    const row = await this.prisma.payments.findFirst({ where: { id, society_id: actor.societyId }, select: { units: { select: { locations: { select: { path: true } } } } } });
    if (!row || !allowed(actor.access, 'view', row.units?.locations.path ?? null)) throw paymentNotFound();
    return this.countPrint(actor, id);
  }

  /** `print` for a receipt the caller's page has already checked (a donation's). */
  async countPrint(actor: Actor, id: string): Promise<PaymentPrint> {
    const printCount = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payments.update({ where: { id }, data: { print_count: { increment: 1 } }, select: { print_count: true, receipt_no: true } });
      await this.audit.record({ ...auditOf(actor, 'print', id), after: { receiptNo: updated.receipt_no, printCount: updated.print_count } }, tx);
      return updated.print_count;
    });
    return { copy: printCount === 1 ? 'original' : 'duplicate', printCount };
  }

  /**
   * Voids a payment: its bills owe again what it paid, and its ledger rows are reversed on
   * today's date. The allocations stay as history. The collector may do it on the day while
   * the cash is still with them; otherwise it needs `payments.approve` there.
   */
  async void(actor: Actor, id: string, input: PaymentVoidInput): Promise<PaymentDetail> {
    const today = isoDate(todayDate());
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${id}::uuid AND society_id = ${actor.societyId}::uuid FOR UPDATE`;
      const payment = await tx.payments.findFirst({
        where: { id, society_id: actor.societyId },
        select: {
          receipt_no: true,
          amount: true,
          received_by: true,
          received_at: true,
          voided_at: true,
          handover_id: true,
          unit_id: true,
          donations: { select: { id: true } },
        },
      });
      const unit = payment?.unit_id ? await tx.locations.findUnique({ where: { id: payment.unit_id }, select: { path: true } }) : null;
      const path = unit?.path ?? null;
      if (!payment || !allowed(actor.access, 'view', path)) throw paymentNotFound();
      if (payment.donations) throw conflict('use_donation_void', "A donation's receipt is voided from the donation");
      if (payment.voided_at) throw conflict('already_void', 'This receipt is already void');
      // A pending handover's expected amount changes with the void; confirming waits for it.
      if (payment.handover_id) await tx.$queryRaw`SELECT id FROM cash_handovers WHERE id = ${payment.handover_id}::uuid FOR UPDATE`;
      if (!mayVoidReceipt(actor, { ...payment, donation: false, path }, today)) {
        throw new ForbiddenException({ code: 'void_needs_approval', message: 'Only an approver can void this receipt now' });
      }

      const allocations = await tx.payment_allocations.findMany({ where: { payment_id: id }, select: { invoice_id: true, amount: true } });
      if (allocations.length) {
        await tx.$queryRaw`
          SELECT id FROM invoices WHERE id IN (${Prisma.join(allocations.map((a) => Prisma.sql`${a.invoice_id}::uuid`))})
          ORDER BY id FOR UPDATE`;
      }
      const bills = allocations.length
        ? await tx.invoices.findMany({ where: { id: { in: allocations.map((a) => a.invoice_id) } }, select: { id: true, total: true, paid: true } })
        : [];
      const byId = new Map(bills.map((bill) => [bill.id, bill]));
      for (const allocation of allocations) {
        const bill = byId.get(allocation.invoice_id)!;
        const paid = bill.paid.minus(allocation.amount).toFixed(2);
        await tx.invoices.update({ where: { id: bill.id }, data: { paid: new Prisma.Decimal(paid), status: statusAfterPayment(paid, bill.total.toFixed(2)) } });
      }
      const entries = await tx.ledger_entries.findMany({
        where: { source_type: 'payment', source_id: id, reverses_id: null, reversed_by: { is: null } },
        select: { id: true, fund_id: true, account: true, amount: true },
      });
      for (const entry of entries) {
        await tx.ledger_entries.create({
          data: {
            society_id: actor.societyId,
            fund_id: entry.fund_id,
            entry_date: day(today),
            direction: 'out',
            amount: entry.amount,
            account: entry.account,
            source_type: 'payment',
            source_id: id,
            reverses_id: entry.id,
            memo: `${payment.receipt_no} void`,
            created_by: actor.userId,
          },
        });
      }
      await tx.payments.update({ where: { id }, data: { void_reason: input.reason, voided_at: new Date(), voided_by: actor.userId } });
      await this.audit.record(
        {
          ...auditOf(actor, 'void', id),
          before: { receiptNo: payment.receipt_no, amount: payment.amount.toFixed(2), handoverId: payment.handover_id },
          after: { reason: input.reason },
        },
        tx,
      );
    });
    return this.get(actor, id);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** The unit (in the caller's collect area) or the member a payment is for. */
  private async account(
    tx: Tx,
    actor: Actor,
    input: Pick<PaymentCreate, 'unitId' | 'personId'>,
  ): Promise<{ unit: BillableUnit | null; membershipIds: Set<string>; memberNo: number | null }> {
    if (input.personId) {
      if (actor.access.paths('create', 'payments') !== 'all') throw onlySocietyWide();
      const memberships = await tx.memberships.findMany({
        where: { society_id: actor.societyId, person_id: input.personId },
        select: { id: true, member_no: true, status: true },
        orderBy: { member_no: 'desc' },
      });
      if (memberships.length === 0) throw bad('no_membership', 'This person has no membership');
      const current = memberships.find((m) => m.status === 'active') ?? memberships[0]!;
      return { unit: null, membershipIds: new Set(memberships.map((m) => m.id)), memberNo: current.member_no };
    }
    const row = await tx.units.findFirst({
      where: { location_id: input.unitId!, society_id: actor.societyId },
      select: { location_id: true, locations: { select: { name: true, code: true, path: true, is_active: true } } },
    });
    if (!row || !actor.access.can('view', 'payments', { path: row.locations.path })) throw unitNotFound();
    if (!actor.access.can('create', 'payments', { path: row.locations.path })) throw beyondPermissions();
    return {
      unit: { id: row.location_id, name: row.locations.name, code: row.locations.code, path: row.locations.path, isActive: row.locations.is_active },
      membershipIds: new Set(),
      memberNo: null,
    };
  }

  private filters(actor: Actor, query: PaymentListQuery): Prisma.Sql[] {
    const and = [Prisma.sql`p.society_id = ${actor.societyId}::uuid`];
    const scope = actor.access.paths('view', 'payments');
    // A scoped caller sees payments for units under their scope; ones with no unit need the whole society.
    if (scope !== 'all') {
      and.push(scope.length ? Prisma.sql`(${Prisma.join(scope.map((prefix) => Prisma.sql`starts_with(l.path, ${prefix})`), ' OR ')})` : Prisma.sql`false`);
    }
    if (query.from) and.push(Prisma.sql`${dhakaDay} >= ${query.from}::date`);
    if (query.to) and.push(Prisma.sql`${dhakaDay} <= ${query.to}::date`);
    if (query.collectorId) and.push(Prisma.sql`p.received_by = ${query.collectorId === 'me' ? actor.userId : query.collectorId}::uuid`);
    if (query.status === 'valid') and.push(Prisma.sql`p.voided_at IS NULL`);
    if (query.status === 'void') and.push(Prisma.sql`p.voided_at IS NOT NULL`);
    if (query.unitId) and.push(Prisma.sql`p.unit_id = ${query.unitId}::uuid`);
    if (query.personId) and.push(Prisma.sql`p.payer_person_id = ${query.personId}::uuid`);
    if (query.invoiceId) and.push(Prisma.sql`EXISTS (SELECT 1 FROM payment_allocations a WHERE a.payment_id = p.id AND a.invoice_id = ${query.invoiceId}::uuid)`);
    if (query.inHand) and.push(Prisma.sql`p.handover_id IS NULL AND p.voided_at IS NULL AND p.method = 'cash'`);
    if (query.q) {
      const terms = digitVariants(query.q).map((term) => {
        const like = likeTerm(term);
        return Prisma.sql`(p.receipt_no ILIKE ${like} OR l.name ILIKE ${like} OR p.payer_snapshot->>'name' ILIKE ${like} OR p.payer_snapshot->>'nameEn' ILIKE ${like})`;
      });
      and.push(Prisma.sql`(${Prisma.join(terms, ' OR ')})`);
    }
    return and;
  }
}

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** A payment with a unit is checked on the unit's location; one without (membership) needs a society-wide grant. */
export function allowed(access: CallerAccess, action: PermissionAction, path: string | null): boolean {
  return path ? access.can(action, 'payments', { path }) : access.paths(action, 'payments') === 'all';
}

/**
 * May the caller void this receipt? The collector may on the day they took it while the cash
 * is still with them; anyone else needs `approve`. A donation's receipt follows the
 * society-wide `donations` grants, any other the `payments` grants on its unit.
 */
export function mayVoidReceipt(
  actor: Actor,
  receipt: { voided_at: Date | null; received_by: string; received_at: Date; handover_id: string | null; donation: boolean; path: string | null },
  today = isoDate(todayDate()),
): boolean {
  if (receipt.voided_at) return false;
  const may = (action: PermissionAction) =>
    receipt.donation ? actor.access.paths(action, 'donations') === 'all' : allowed(actor.access, action, receipt.path);
  return (
    may('approve') ||
    (may('create') &&
      collectorMayVoid({
        receivedBy: receipt.received_by,
        userId: actor.userId,
        receivedDay: isoDate(todayDate(receipt.received_at)),
        today,
        inHandover: receipt.handover_id !== null,
      }))
  );
}

/** The ticked bills' bill-tos, the newest bill's first, each once. */
function payersOf(bills: InvoiceRow[]): PayerOption[] {
  const seen = new Map<string, PayerOption>();
  for (const bill of [...bills].reverse()) {
    const { kind, id, name, nameEn, phone } = bill.billTo;
    if (!seen.has(id)) seen.set(id, { kind, id, name, nameEn, phone });
  }
  return [...seen.values()];
}

function toRow(row: Row): PaymentRow {
  const payer: PayerSnapshot | null = row.payer_snapshot === null ? null : payerSnapshotSchema.parse(row.payer_snapshot);
  return {
    id: row.id,
    kind: row.donations ? 'donation' : 'bills',
    receiptNo: row.receipt_no,
    receivedAt: row.received_at.toISOString(),
    receivedDay: isoDate(todayDate(row.received_at)),
    amount: row.amount.toFixed(2),
    method: row.method as PaymentRow['method'],
    payer,
    collectedBy: { id: row.users.id, name: nameOf(row.users) },
    voided: row.voided_at !== null,
    handover: row.handover_id ? { id: row.handover_id, confirmed: row.cash_handovers?.confirmed_at != null } : null,
    invoiceNos: [...row.payment_allocations]
      .sort((a, b) => a.invoices.due_date.getTime() - b.invoices.due_date.getTime() || a.invoices.invoice_no.localeCompare(b.invoices.invoice_no))
      .map((allocation) => allocation.invoices.invoice_no),
  };
}

const auditOf = (actor: Actor, action: string, entityId: string) => ({
  societyId: actor.societyId,
  userId: actor.userId,
  action,
  entityType: 'payment',
  entityId,
  ip: actor.ip,
});
