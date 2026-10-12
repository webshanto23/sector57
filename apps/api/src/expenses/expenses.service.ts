import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  budgetFigures,
  compareMoney,
  digitVariants,
  expenseActions,
  fiscalYearOf,
  TIME_ZONE,
  type ExpenseActions,
  type ExpenseDetail,
  type ExpenseInput,
  type ExpenseList,
  type ExpenseListQuery,
  type ExpensePay,
  type ExpenseReason,
  type ExpenseRow,
  type ExpenseStatus,
  type ExpenseVoucher,
  type LedgerAccount,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { fundBalances } from '../finance/balances.js';
import { fundClosed } from '../finance/funds.service.js';
import { lockFinanceSetup, NumberingService } from '../finance/numbering.service.js';
import { SettingsService } from '../finance/settings.service.js';
import type { CallerAccess } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beyondPermissions } from '../property/tree.service.js';
import { documentContentType } from '../storage/document.js';
import { PrivateFilesService } from '../storage/private-files.service.js';

type Tx = Prisma.TransactionClient;

/** `documents.entity_type` / `doc_type` of a voucher file. */
const VOUCHER_ENTITY = 'expense';
const VOUCHER_DOC = 'voucher';
/** Most files one expense may carry. */
const MAX_VOUCHERS = 10;

const userName = { select: { id: true, phone: true, persons: { select: { full_name: true } } } } as const;
type UserName = { id: string; phone: string; persons: { full_name: string } | null };
const nameOf = (user: UserName) => user.persons?.full_name ?? user.phone;

const rowSelect = {
  id: true,
  status: true,
  description: true,
  amount: true,
  spent_on: true,
  voucher_no: true,
  created_at: true,
  requested_by: true,
  expense_heads: { select: { id: true, name_bn: true, name_en: true } },
  funds: { select: { id: true, name_bn: true, name_en: true } },
  vendors: { select: { id: true, name: true, phone: true } },
  users_expenses_requested_byTousers: userName,
} satisfies Prisma.expensesSelect;
type Row = Prisma.expensesGetPayload<{ select: typeof rowSelect }>;

const detailSelect = {
  ...rowSelect,
  expense_head_id: true,
  approved_at: true,
  rejected_at: true,
  reject_reason: true,
  paid_at: true,
  paid_account: true,
  voided_at: true,
  void_reason: true,
  users_expenses_approved_byTousers: userName,
  users_expenses_rejected_byTousers: userName,
  users_expenses_paid_byTousers: userName,
  users_expenses_voided_byTousers: userName,
} satisfies Prisma.expensesSelect;

export const expenseNotFound = () => new NotFoundException({ code: 'expense_not_found', message: 'Expense not found' });
const bad = (code: string, message: string) => new BadRequestException({ code, message });
const conflict = (code: string, message: string) => new ConflictException({ code, message });
const changed = () => conflict('expense_changed', 'The expense was changed in the meantime; reload it');

/** `\`, `%` and `_` typed in a search mean themselves. */
const likeTerm = (term: string) => `%${term.replace(/[\\%_]/g, '\\$&')}%`;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const paidDay = Prisma.sql`(e.paid_at AT TIME ZONE ${TIME_ZONE})::date`;

/**
 * Expenses (`expenses.*`, society-wide): requested, approved or rejected by someone other than
 * the requester, then paid from a fund's cash or bank, which writes an `out` ledger row and
 * draws an `EXP-YY-NNNN` voucher number. Paying more than the fund holds in that account is
 * refused. Nothing is deleted: a paid expense is voided with a reversing ledger row.
 */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly settings: SettingsService,
    private readonly files: PrivateFilesService,
  ) {}

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  async list(actor: Actor, query: ExpenseListQuery): Promise<ExpenseList> {
    const { page, pageSize } = query;
    const where = Prisma.join(this.filters(actor, query), ' AND ');
    const from = Prisma.sql`expenses e LEFT JOIN vendors v ON v.id = e.vendor_id`;
    const [ids, [figures], summary] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT e.id FROM ${from} WHERE ${where}
        ORDER BY e.spent_on DESC, e.created_at DESC, e.id
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      this.prisma.$queryRaw<{ total: number; count: number; amount: string }[]>`
        SELECT count(*)::int AS total,
               (count(*) FILTER (WHERE e.status NOT IN ('rejected', 'void')))::int AS count,
               coalesce(sum(e.amount) FILTER (WHERE e.status NOT IN ('rejected', 'void')), 0)::numeric(16,2)::text AS amount
        FROM ${from} WHERE ${where}`,
      this.summary(actor.societyId),
    ]);
    const idList = ids.map((row) => row.id);
    const [rows, vouchers] = await Promise.all([
      this.prisma.expenses.findMany({ where: { id: { in: idList } }, select: rowSelect }),
      idList.length
        ? this.prisma.documents.groupBy({
            by: ['entity_id'],
            where: { society_id: actor.societyId, entity_type: VOUCHER_ENTITY, entity_id: { in: idList } },
            _count: { _all: true },
          })
        : [],
    ]);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const counts = new Map(vouchers.map((row) => [row.entity_id, row._count._all]));
    return {
      items: idList.flatMap((id) => {
        const row = byId.get(id);
        return row ? [{ ...toRow(row), vouchers: counts.get(id) ?? 0 }] : [];
      }),
      total: figures!.total,
      page,
      pageSize,
      totals: { count: figures!.count, amount: figures!.amount },
      summary,
    };
  }

  async get(actor: Actor, id: string): Promise<ExpenseDetail> {
    const row = await this.prisma.expenses.findFirst({ where: { id, society_id: actor.societyId }, select: detailSelect });
    if (!row) throw expenseNotFound();
    const can = actionsFor(actor, row);
    const spentOn = isoDate(row.spent_on);
    const society = await this.prisma.societies.findUniqueOrThrow({ where: { id: actor.societyId }, select: { fiscal_year_start_month: true } });
    const year = fiscalYearOf(spentOn, society.fiscal_year_start_month);
    const [docs, header, balance, budget, used] = await Promise.all([
      this.prisma.documents.findMany({
        where: { society_id: actor.societyId, entity_type: VOUCHER_ENTITY, entity_id: id },
        select: { id: true, file_url: true, file_name: true, uploaded_at: true, users: userName },
        orderBy: { uploaded_at: 'asc' },
      }),
      this.settings.receiptHeader(actor.societyId),
      can.pay ? fundBalances(this.prisma, row.funds.id) : Promise.resolve(null),
      this.prisma.budgets.findUnique({
        where: { society_id_fiscal_year_expense_head_id: { society_id: actor.societyId, fiscal_year: year.label, expense_head_id: row.expense_head_id } },
        select: { amount: true },
      }),
      this.prisma.$queryRaw<{ approved: string; paid: string }[]>`
        SELECT coalesce(sum(amount) FILTER (WHERE status = 'approved'), 0)::numeric(16,2)::text AS approved,
               coalesce(sum(amount) FILTER (WHERE status = 'paid'), 0)::numeric(16,2)::text AS paid
        FROM expenses WHERE society_id = ${actor.societyId}::uuid AND expense_head_id = ${row.expense_head_id}::uuid
          AND spent_on BETWEEN ${year.start}::date AND ${year.end}::date`,
    ]);
    const figures = budget ? budgetFigures(budget.amount.toFixed(2), used[0]!.approved, used[0]!.paid) : null;
    const step = (at: Date | null, user: UserName | null) => (at ? { at: at.toISOString(), by: user ? nameOf(user) : null } : null);
    const vouchers: ExpenseVoucher[] = docs.map((doc) => ({
      id: doc.id,
      fileName: doc.file_name,
      isImage: documentContentType(doc.file_url) !== 'application/pdf',
      uploadedAt: doc.uploaded_at.toISOString(),
      uploadedBy: doc.users ? nameOf(doc.users) : null,
    }));
    const rejected = step(row.rejected_at, row.users_expenses_rejected_byTousers);
    const paid = step(row.paid_at, row.users_expenses_paid_byTousers);
    const voided = step(row.voided_at, row.users_expenses_voided_byTousers);
    return {
      ...toRow(row),
      vendor: row.vendors ? { id: row.vendors.id, name: row.vendors.name, phone: row.vendors.phone } : null,
      approved: step(row.approved_at, row.users_expenses_approved_byTousers),
      rejected: rejected && row.reject_reason ? { ...rejected, reason: row.reject_reason } : null,
      paid: paid && row.paid_account ? { ...paid, account: row.paid_account as LedgerAccount } : null,
      void: voided && row.void_reason ? { ...voided, reason: row.void_reason } : null,
      vouchers,
      fundBalance: balance,
      budget:
        budget && figures
          ? { year: year.label, amount: budget.amount.toFixed(2), used: figures.used, remaining: figures.remaining, over: figures.over }
          : null,
      header,
      can,
    };
  }

  // -------------------------------------------------------------------------
  // The flow
  // -------------------------------------------------------------------------

  /** A new request, `pending`. The head and vendor must be the society's and not archived. */
  async create(actor: Actor, input: ExpenseInput): Promise<ExpenseDetail> {
    if (input.spentOn > isoDate(todayDate())) throw bad('future_date', 'The date is in the future');
    const id = await this.prisma.$transaction(async (tx) => {
      const refs = await this.refs(tx, actor.societyId, input);
      const row = await tx.expenses.create({
        data: {
          society_id: actor.societyId,
          expense_head_id: input.headId,
          fund_id: refs.fundId,
          vendor_id: input.vendorId ?? null,
          description: input.description,
          amount: new Prisma.Decimal(input.amount),
          spent_on: day(input.spentOn),
          status: 'pending',
          requested_by: actor.userId,
        },
        select: { id: true },
      });
      await this.audit.record({ ...auditOf(actor, 'create', row.id), after: { ...input, fundId: refs.fundId } }, tx);
      return row.id;
    });
    return this.get(actor, id);
  }

  /** Changes a pending request: its requester, or anyone with `expenses.edit`. */
  async update(actor: Actor, id: string, input: ExpenseInput): Promise<ExpenseDetail> {
    if (input.spentOn > isoDate(todayDate())) throw bad('future_date', 'The date is in the future');
    await this.prisma.$transaction(async (tx) => {
      const row = await this.locked(tx, actor, id);
      if (row.status !== 'pending') throw conflict('expense_not_pending', 'Only a pending expense can be changed');
      if (!actionsFor(actor, row).edit) throw beyondPermissions();
      const refs = await this.refs(tx, actor.societyId, input, { headId: row.expense_head_id, vendorId: row.vendor_id });
      await tx.expenses.update({
        where: { id },
        data: {
          expense_head_id: input.headId,
          fund_id: refs.fundId,
          vendor_id: input.vendorId ?? null,
          description: input.description,
          amount: new Prisma.Decimal(input.amount),
          spent_on: day(input.spentOn),
          updated_at: new Date(),
        },
      });
      await this.audit.record(
        {
          ...auditOf(actor, 'update', id),
          before: {
            headId: row.expense_head_id,
            fundId: row.fund_id,
            vendorId: row.vendor_id,
            description: row.description,
            amount: row.amount.toFixed(2),
            spentOn: isoDate(row.spent_on),
          },
          after: { ...input, fundId: refs.fundId },
        },
        tx,
      );
    });
    return this.get(actor, id);
  }

  async approve(actor: Actor, id: string): Promise<ExpenseDetail> {
    await this.decide(actor, id, async (tx) => {
      await tx.expenses.update({ where: { id }, data: { status: 'approved', approved_by: actor.userId, approved_at: new Date(), updated_at: new Date() } });
      await this.audit.record({ ...auditOf(actor, 'approve', id), before: { status: 'pending' }, after: { status: 'approved' } }, tx);
    });
    return this.get(actor, id);
  }

  async reject(actor: Actor, id: string, input: ExpenseReason): Promise<ExpenseDetail> {
    await this.decide(actor, id, async (tx) => {
      await tx.expenses.update({
        where: { id },
        data: { status: 'rejected', rejected_by: actor.userId, rejected_at: new Date(), reject_reason: input.reason, updated_at: new Date() },
      });
      await this.audit.record({ ...auditOf(actor, 'reject', id), before: { status: 'pending' }, after: { status: 'rejected', reason: input.reason } }, tx);
    });
    return this.get(actor, id);
  }

  /**
   * Pays an approved expense from the fund's cash or bank: a voucher number, the payment
   * details and an `out` ledger row, in one transaction. Taken under the finance setup lock,
   * so two payments (or a payment and closing the fund) never both see the same balance.
   */
  async pay(actor: Actor, id: string, input: ExpensePay): Promise<ExpenseDetail> {
    const today = isoDate(todayDate());
    await this.prisma.$transaction(async (tx) => {
      await lockFinanceSetup(tx, actor.societyId);
      const row = await this.locked(tx, actor, id);
      if (row.status !== 'approved') throw conflict('expense_not_approved', 'Only an approved expense can be paid');
      if (!actionsFor(actor, row).pay) throw beyondPermissions();
      const fund = await tx.funds.findUniqueOrThrow({ where: { id: row.fund_id }, select: { closed_at: true } });
      if (fund.closed_at) throw fundClosed();
      const balance = (await fundBalances(tx, row.fund_id))[input.account];
      const amount = row.amount.toFixed(2);
      if (compareMoney(balance, amount) < 0) {
        throw new ConflictException({ code: 'fund_insufficient', message: 'The fund does not hold enough in that account', details: { balance } });
      }
      const number = await this.numbering.next(tx, actor.societyId, 'voucher', today);
      await tx.expenses.update({
        where: { id },
        data: { status: 'paid', voucher_no: number.formatted, paid_at: new Date(), paid_by: actor.userId, paid_account: input.account, updated_at: new Date() },
      });
      await tx.ledger_entries.create({
        data: {
          society_id: actor.societyId,
          fund_id: row.fund_id,
          entry_date: day(today),
          direction: 'out',
          amount: row.amount,
          account: input.account,
          source_type: 'expense',
          source_id: id,
          memo: number.formatted,
          created_by: actor.userId,
        },
      });
      await this.audit.record(
        { ...auditOf(actor, 'pay', id), before: { status: 'approved', balance }, after: { status: 'paid', voucherNo: number.formatted, account: input.account, amount } },
        tx,
      );
    });
    return this.get(actor, id);
  }

  /** Voids an approved or paid expense (`expenses.approve`). A paid one's ledger row is reversed on today's date. */
  async void(actor: Actor, id: string, input: ExpenseReason): Promise<ExpenseDetail> {
    const today = isoDate(todayDate());
    await this.prisma.$transaction(async (tx) => {
      const row = await this.locked(tx, actor, id);
      if (row.status !== 'approved' && row.status !== 'paid') throw conflict('expense_not_voidable', 'Only an approved or paid expense can be voided');
      if (!actionsFor(actor, row).void) throw beyondPermissions();
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
      await tx.expenses.update({ where: { id }, data: { status: 'void', voided_at: new Date(), voided_by: actor.userId, void_reason: input.reason, updated_at: new Date() } });
      await this.audit.record({ ...auditOf(actor, 'void', id), before: { status: row.status, voucherNo: row.voucher_no }, after: { status: 'void', reason: input.reason } }, tx);
    });
    return this.get(actor, id);
  }

  // -------------------------------------------------------------------------
  // Vouchers
  // -------------------------------------------------------------------------

  /** Attaches a photo or PDF (checked and re-encoded by `processDocument`). */
  async addVoucher(actor: Actor, id: string, upload: Buffer): Promise<ExpenseDetail> {
    const row = await this.prisma.expenses.findFirst({ where: { id, society_id: actor.societyId }, select: { status: true, requested_by: true } });
    if (!row) throw expenseNotFound();
    if (!actionsFor(actor, row).upload) throw new ForbiddenException({ code: 'beyond_your_permissions', message: 'You may not add vouchers to this expense' });
    const stored = await this.files.saveDocument(actor.societyId, 'expenses', upload);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM expenses WHERE id = ${id}::uuid FOR UPDATE`;
        const count = await tx.documents.count({ where: { society_id: actor.societyId, entity_type: VOUCHER_ENTITY, entity_id: id } });
        if (count >= MAX_VOUCHERS) throw conflict('too_many_vouchers', `At most ${MAX_VOUCHERS} files per expense`);
        const doc = await tx.documents.create({
          data: {
            society_id: actor.societyId,
            entity_type: VOUCHER_ENTITY,
            entity_id: id,
            doc_type: VOUCHER_DOC,
            file_url: stored.key,
            file_name: `voucher-${count + 1}.${stored.isImage ? 'webp' : 'pdf'}`,
            visibility: 'office',
            uploaded_by: actor.userId,
          },
          select: { id: true },
        });
        await this.audit.record({ ...auditOf(actor, 'add_voucher', id), after: { documentId: doc.id } }, tx);
      });
    } catch (error) {
      await this.files.removeQuietly(actor.societyId, [stored.key]);
      throw error;
    }
    return this.get(actor, id);
  }

  /** Removes a wrong file, only before the expense is paid. The file goes once the row is gone. */
  async removeVoucher(actor: Actor, id: string, documentId: string): Promise<ExpenseDetail> {
    const key = await this.prisma.$transaction(async (tx) => {
      const row = await this.locked(tx, actor, id);
      if (row.status !== 'pending' && row.status !== 'approved') throw conflict('expense_voucher_locked', 'Vouchers of a paid expense stay');
      if (!actionsFor(actor, row).upload) throw beyondPermissions();
      const doc = await tx.documents.findFirst({
        where: { id: documentId, society_id: actor.societyId, entity_type: VOUCHER_ENTITY, entity_id: id },
        select: { file_url: true },
      });
      if (!doc) throw new NotFoundException({ code: 'file_not_found', message: 'File not found' });
      await tx.documents.delete({ where: { id: documentId } });
      await this.audit.record({ ...auditOf(actor, 'remove_voucher', id), before: { documentId } }, tx);
      return doc.file_url;
    });
    await this.files.removeQuietly(actor.societyId, [key]);
    return this.get(actor, id);
  }

  async voucher(actor: Actor, id: string, documentId: string): Promise<{ data: Buffer; contentType: string; fileName: string }> {
    const doc = await this.prisma.documents.findFirst({
      where: { id: documentId, society_id: actor.societyId, entity_type: VOUCHER_ENTITY, entity_id: id },
      select: { file_url: true, file_name: true },
    });
    if (!doc) throw new NotFoundException({ code: 'file_not_found', message: 'File not found' });
    const data = await this.files.read(actor.societyId, doc.file_url);
    return { data, contentType: documentContentType(doc.file_url), fileName: doc.file_name };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Shared by approve and reject: pending, someone else's, and the caller may decide. */
  private async decide(actor: Actor, id: string, work: (tx: Tx) => Promise<void>): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await this.locked(tx, actor, id);
      if (row.status !== 'pending') throw changed();
      if (row.requested_by === actor.userId) throw new ForbiddenException({ code: 'cannot_approve_own', message: 'Someone else must decide on your request' });
      if (!actionsFor(actor, row).approve) throw beyondPermissions();
      await work(tx);
    });
  }

  /** The expense row, locked for the rest of the transaction. */
  private async locked(tx: Tx, actor: Actor, id: string) {
    await tx.$queryRaw`SELECT id FROM expenses WHERE id = ${id}::uuid AND society_id = ${actor.societyId}::uuid FOR UPDATE`;
    const row = await tx.expenses.findFirst({
      where: { id, society_id: actor.societyId },
      select: {
        status: true,
        requested_by: true,
        expense_head_id: true,
        fund_id: true,
        vendor_id: true,
        description: true,
        amount: true,
        spent_on: true,
        voucher_no: true,
      },
    });
    if (!row) throw expenseNotFound();
    return row;
  }

  /**
   * Checks the head, vendor and fund of a request; returns the fund to use (the default one
   * when none is given). An archived head or vendor is refused unless the expense already had it.
   */
  private async refs(tx: Tx, societyId: string, input: ExpenseInput, current?: { headId: string; vendorId: string | null }): Promise<{ fundId: string }> {
    const head = await tx.expense_heads.findFirst({ where: { id: input.headId, society_id: societyId }, select: { archived_at: true } });
    if (!head) throw bad('invalid_head', 'Unknown expense head');
    if (head.archived_at && current?.headId !== input.headId) throw bad('head_archived', 'The expense head is archived');
    if (input.vendorId) {
      const vendor = await tx.vendors.findFirst({ where: { id: input.vendorId, society_id: societyId }, select: { archived_at: true } });
      if (!vendor) throw bad('invalid_vendor', 'Unknown vendor');
      if (vendor.archived_at && current?.vendorId !== input.vendorId) throw bad('vendor_archived', 'The vendor is archived');
    }
    const fund = await tx.funds.findFirst({
      where: { society_id: societyId, ...(input.fundId ? { id: input.fundId } : { is_default: true }) },
      select: { id: true, is_default: true, closed_at: true },
    });
    if (!fund) throw bad('invalid_fund', 'Unknown fund');
    if (fund.closed_at) throw fundClosed();
    if (!fund.is_default && !(await this.settings.separateFunds(societyId, tx))) throw bad('invalid_fund', 'Only the default fund is in use');
    return { fundId: fund.id };
  }

  /** The stat cards: waiting, approved and unpaid, paid this month and this fiscal year. */
  private async summary(societyId: string): Promise<ExpenseList['summary']> {
    const today = isoDate(todayDate());
    const society = await this.prisma.societies.findUniqueOrThrow({ where: { id: societyId }, select: { fiscal_year_start_month: true } });
    const year = fiscalYearOf(today, society.fiscal_year_start_month);
    const monthStart = `${today.slice(0, 7)}-01`;
    const [row] = await this.prisma.$queryRaw<
      { p_count: number; p_amount: string; a_count: number; a_amount: string; m_count: number; m_amount: string; y_count: number; y_amount: string }[]
    >`
      SELECT (count(*) FILTER (WHERE e.status = 'pending'))::int AS p_count,
             coalesce(sum(e.amount) FILTER (WHERE e.status = 'pending'), 0)::numeric(16,2)::text AS p_amount,
             (count(*) FILTER (WHERE e.status = 'approved'))::int AS a_count,
             coalesce(sum(e.amount) FILTER (WHERE e.status = 'approved'), 0)::numeric(16,2)::text AS a_amount,
             (count(*) FILTER (WHERE e.status = 'paid' AND ${paidDay} >= ${monthStart}::date))::int AS m_count,
             coalesce(sum(e.amount) FILTER (WHERE e.status = 'paid' AND ${paidDay} >= ${monthStart}::date), 0)::numeric(16,2)::text AS m_amount,
             (count(*) FILTER (WHERE e.status = 'paid' AND ${paidDay} BETWEEN ${year.start}::date AND ${year.end}::date))::int AS y_count,
             coalesce(sum(e.amount) FILTER (WHERE e.status = 'paid' AND ${paidDay} BETWEEN ${year.start}::date AND ${year.end}::date), 0)::numeric(16,2)::text AS y_amount
      FROM expenses e WHERE e.society_id = ${societyId}::uuid`;
    return {
      pending: { count: row!.p_count, amount: row!.p_amount },
      approved: { count: row!.a_count, amount: row!.a_amount },
      paidMonth: { count: row!.m_count, amount: row!.m_amount },
      paidYear: { count: row!.y_count, amount: row!.y_amount, label: year.label },
    };
  }

  private filters(actor: Actor, query: ExpenseListQuery): Prisma.Sql[] {
    const and = [Prisma.sql`e.society_id = ${actor.societyId}::uuid`];
    if (query.status) and.push(Prisma.sql`e.status = ${query.status}`);
    if (query.headId) and.push(Prisma.sql`e.expense_head_id = ${query.headId}::uuid`);
    if (query.fundId) and.push(Prisma.sql`e.fund_id = ${query.fundId}::uuid`);
    if (query.vendorId) and.push(Prisma.sql`e.vendor_id = ${query.vendorId}::uuid`);
    if (query.from) and.push(Prisma.sql`e.spent_on >= ${query.from}::date`);
    if (query.to) and.push(Prisma.sql`e.spent_on <= ${query.to}::date`);
    if (query.requestedBy === 'me') and.push(Prisma.sql`e.requested_by = ${actor.userId}::uuid`);
    if (query.q) {
      const terms = digitVariants(query.q).map((term) => {
        const like = likeTerm(term);
        return Prisma.sql`(e.description ILIKE ${like} OR e.voucher_no ILIKE ${like} OR v.name ILIKE ${like})`;
      });
      and.push(Prisma.sql`(${Prisma.join(terms, ' OR ')})`);
    }
    return and;
  }
}

/** The caller's society-wide `expenses` grants, as `expenseActions` takes them. */
function grantsOf(access: CallerAccess) {
  return { create: access.can('create', 'expenses'), edit: access.can('edit', 'expenses'), approve: access.can('approve', 'expenses') };
}

function actionsFor(actor: Actor, row: { status: string; requested_by: string | null }): ExpenseActions {
  return expenseActions({ status: row.status as ExpenseStatus, requestedBy: row.requested_by }, actor.userId, grantsOf(actor.access));
}

function toRow(row: Row): ExpenseRow {
  const requester = row.users_expenses_requested_byTousers;
  return {
    id: row.id,
    status: row.status as ExpenseStatus,
    head: { id: row.expense_heads.id, nameBn: row.expense_heads.name_bn, nameEn: row.expense_heads.name_en },
    fund: { id: row.funds.id, nameBn: row.funds.name_bn, nameEn: row.funds.name_en },
    vendor: row.vendors ? { id: row.vendors.id, name: row.vendors.name } : null,
    description: row.description,
    amount: row.amount.toFixed(2),
    spentOn: isoDate(row.spent_on),
    voucherNo: row.voucher_no,
    requestedBy: requester ? { id: requester.id, name: nameOf(requester) } : null,
    createdAt: row.created_at.toISOString(),
    vouchers: 0,
  };
}

const auditOf = (actor: Actor, action: string, entityId: string) => ({
  societyId: actor.societyId,
  userId: actor.userId,
  action,
  entityType: 'expense',
  entityId,
  ip: actor.ip,
});
