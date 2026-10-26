import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  expenseTotal,
  fiscalYearOf,
  storedMethod,
  type ExpenseDetail,
  type ExpenseInput,
  type ExpensePay,
  type ExpenseReason,
  type ExpenseVoucher,
  type LedgerAccount,
  type PaymentMethod,
  type StoredMethod,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { fundBalances } from '../finance/balances.js';
import { lockFinanceSetup, NumberingService } from '../finance/numbering.service.js';
import { SettingsService } from '../finance/settings.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beyondPermissions } from '../property/tree.service.js';
import { documentContentType } from '../storage/document.js';
import { budgetsFor, checkRefs, writeLines } from './expense-lines.js';
import { reverseIn, settleIn } from './expense-money.js';
import { actionsFor, auditOf, bad, changed, conflict, day, detailSelect, expenseNotFound, lineSelect, nameOf, toLine, toRow, userName, VOUCHER_ENTITY, type UserName } from './expense-rows.js';

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
    const lines = row.expense_lines.map(toLine);
    const [docs, header, balance, budgets] = await Promise.all([
      this.prisma.documents.findMany({
        where: { society_id: actor.societyId, entity_type: VOUCHER_ENTITY, entity_id: id },
        select: { id: true, file_url: true, file_name: true, uploaded_at: true, users: userName },
        orderBy: { uploaded_at: 'asc' },
      }),
      this.settings.receiptHeader(actor.societyId),
      can.pay ? fundBalances(this.prisma, row.funds.id) : Promise.resolve(null),
      budgetsFor(this.prisma, actor.societyId, lines.map((line) => line.head), year),
    ]);
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
    const { head: _head, vendor: _vendor, lines: _count, ...base } = toRow(row);
    return {
      ...base,
      lines,
      methodRef: row.method_ref,
      approved: step(row.approved_at, row.users_expenses_approved_byTousers),
      rejected: rejected && row.reject_reason ? { ...rejected, reason: row.reject_reason } : null,
      paid:
        paid && row.paid_account
          ? { ...paid, account: row.paid_account as LedgerAccount, method: (row.paid_method ?? row.paid_account) as PaymentMethod, methodRef: row.paid_method_ref }
          : null,
      void: voided && row.void_reason ? { ...voided, reason: row.void_reason } : null,
      vouchers,
      fundBalance: balance,
      budgets,
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
    const refs = await checkRefs(tx, this.settings, actor.societyId, input);
    const row = await tx.expenses.create({
      data: { ...this.fields(actor, input, refs.fundId), status: 'pending', requested_by: actor.userId },
      select: { id: true },
    });
    await writeLines(tx, actor.societyId, row.id, input.lines);
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
      const before = await tx.expense_lines.findMany({ where: { expense_id: id }, select: lineSelect, orderBy: { position: 'asc' } });
      const refs = await checkRefs(tx, this.settings, actor.societyId, input, {
        headIds: before.map((line) => line.expense_head_id),
        vendorIds: before.flatMap((line) => (line.vendor_id ? [line.vendor_id] : [])),
      });
      await tx.expenses.update({ where: { id }, data: { ...this.fields(actor, input, refs.fundId), updated_at: new Date() } });
      await writeLines(tx, actor.societyId, id, input.lines);
      await this.audit.record(
        {
          ...auditOf(actor, 'update', id),
          before: {
            title: row.title,
            fundId: row.fund_id,
            method: row.method,
            methodRef: row.method_ref,
            spentOn: isoDate(row.spent_on),
            lines: before.map((line) => ({ headId: line.expense_head_id, vendorId: line.vendor_id, description: line.description, amount: line.amount.toFixed(2) })),
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
   * Pays an approved expense from the fund's cash or bank (the method decides which): a voucher number, the payment
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
      await settleIn(tx, this.money, actor, id, row, storedMethod(input), today);
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
    input: ExpenseInput & { paidBy: StoredMethod; requestedBy: string | null; approvedBy: string; approvedAt: Date },
  ): Promise<{ id: string; voucherNo: string }> {
    const refs = await checkRefs(tx, this.settings, actor.societyId, input);
    const row = await tx.expenses.create({
      data: {
        ...this.fields(actor, input, refs.fundId),
        status: 'approved',
        requested_by: input.requestedBy,
        approved_by: input.approvedBy,
        approved_at: input.approvedAt,
      },
      select: { id: true, fund_id: true, amount: true },
    });
    await writeLines(tx, actor.societyId, row.id, input.lines);
    await this.audit.record({ ...auditOf(actor, 'create', row.id), after: { ...input, fundId: refs.fundId } }, tx);
    const voucherNo = await settleIn(tx, this.money, actor, row.id, row, input.paidBy, isoDate(todayDate()));
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
        title: true,
        fund_id: true,
        method: true,
        method_ref: true,
        amount: true,
        spent_on: true,
        voucher_no: true,
      },
    });
    if (!row) throw expenseNotFound();
    return row;
  }

  /** The expense row's own fields from a request; the amount is the sum of its lines. */
  private fields(actor: Actor, input: ExpenseInput, fundId: string) {
    const method = storedMethod(input);
    return {
      society_id: actor.societyId,
      fund_id: fundId,
      title: input.title,
      method: method.method,
      method_ref: method.ref,
      amount: new Prisma.Decimal(expenseTotal(input.lines)),
      spent_on: day(input.spentOn),
    };
  }
}
