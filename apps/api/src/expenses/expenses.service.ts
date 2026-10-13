import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  budgetFigures,
  fiscalYearOf,
  type ExpenseDetail,
  type ExpenseInput,
  type ExpensePay,
  type ExpenseReason,
  type ExpenseVoucher,
  type LedgerAccount,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { fundBalances } from '../finance/balances.js';
import { fundClosed } from '../finance/funds.service.js';
import { lockFinanceSetup, NumberingService } from '../finance/numbering.service.js';
import { SettingsService } from '../finance/settings.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beyondPermissions } from '../property/tree.service.js';
import { documentContentType } from '../storage/document.js';
import { reverseIn, settleIn } from './expense-money.js';
import { actionsFor, auditOf, bad, changed, conflict, day, detailSelect, expenseNotFound, nameOf, toRow, userName, VOUCHER_ENTITY, type UserName } from './expense-rows.js';

export { expenseNotFound } from './expense-rows.js';

type Tx = Prisma.TransactionClient;

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
  ) {}

  private get money() {
    return { audit: this.audit, numbering: this.numbering };
  }

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

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
    const id = await this.prisma.$transaction((tx) => this.createIn(tx, actor, input));
    return this.get(actor, id);
  }

  /**
   * Saves a new pending request inside the caller's transaction and returns its id (work
   * orders finished with a cost). The caller checks `expenses.create` and the date.
   */
  async createIn(tx: Tx, actor: Actor, input: ExpenseInput): Promise<string> {
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
      await settleIn(tx, this.money, actor, id, row, input.account, today);
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
      if (await tx.payroll_run_expenses.findUnique({ where: { expense_id: id }, select: { run_id: true } })) {
        throw conflict('expense_from_payroll', 'Void the payroll run that booked this expense');
      }
      await reverseIn(tx, this.money, actor, id, row, input.reason, today);
    });
    return this.get(actor, id);
  }

  // -------------------------------------------------------------------------
  // Booked by other modules (payroll), inside their transaction
  // -------------------------------------------------------------------------

  /**
   * Books an expense another module already approved (a payroll run: requested by its preparer,
   * approved by its approver) and pays it from the fund's account. The caller holds
   * `lockFinanceSetup`, has checked the grants, and gets the voucher number back.
   */
  async bookPaidIn(
    tx: Tx,
    actor: Actor,
    input: ExpenseInput & { account: LedgerAccount; requestedBy: string | null; approvedBy: string; approvedAt: Date },
  ): Promise<{ id: string; voucherNo: string }> {
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
        status: 'approved',
        requested_by: input.requestedBy,
        approved_by: input.approvedBy,
        approved_at: input.approvedAt,
      },
      select: { id: true, fund_id: true, amount: true },
    });
    await this.audit.record({ ...auditOf(actor, 'create', row.id), after: { headId: input.headId, fundId: refs.fundId, description: input.description, amount: input.amount, spentOn: input.spentOn } }, tx);
    const voucherNo = await settleIn(tx, this.money, actor, row.id, row, input.account, isoDate(todayDate()));
    return { id: row.id, voucherNo };
  }

  /** Voids a paid expense another module booked (its run is being voided); the caller checks the grants. */
  async voidBookedIn(tx: Tx, actor: Actor, id: string, reason: string): Promise<void> {
    const row = await this.locked(tx, actor, id);
    if (row.status !== 'approved' && row.status !== 'paid') throw conflict('expense_not_voidable', 'Only an approved or paid expense can be voided');
    await reverseIn(tx, this.money, actor, id, row, reason, isoDate(todayDate()));
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

  /** The expense row, locked for the rest of the transaction (also used by the voucher service). */
  async locked(tx: Tx, actor: Actor, id: string) {
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
}
