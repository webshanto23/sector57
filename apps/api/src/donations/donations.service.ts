import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  asciiDigits,
  digitVariants,
  fiscalYearOf,
  payerSnapshotSchema,
  TIME_ZONE,
  type DonationCreate,
  type DonationDetail,
  type DonationList,
  type DonationListQuery,
  type DonationOptions,
  type DonationRow,
  type DonationSummary,
  type DonorLookup,
  type DonorLookupQuery,
  type PayerSnapshot,
  type PaymentPrint,
  type PaymentVoidInput,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { BillToService } from '../billing/bill-to.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { fundClosed, toFundOption } from '../finance/funds.service.js';
import { NumberingService } from '../finance/numbering.service.js';
import { SettingsService } from '../finance/settings.service.js';
import { PartiesService } from '../members/parties.service.js';
import { mayVoidReceipt, PaymentsService } from '../payments/payments.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Tx = Prisma.TransactionClient;

const userName = { select: { id: true, phone: true, persons: { select: { full_name: true } } } } as const;
const nameOf = (user: { phone: string; persons: { full_name: string } | null }) => user.persons?.full_name ?? user.phone;

const rowSelect = {
  id: true,
  payment_id: true,
  received_at: true,
  amount: true,
  purpose: true,
  funds: { select: { id: true, name_bn: true, name_en: true } },
  payments: { select: { receipt_no: true, payer_snapshot: true, voided_at: true, users: userName } },
} satisfies Prisma.donationsSelect;
type Row = Prisma.donationsGetPayload<{ select: typeof rowSelect }>;

export const donationNotFound = () => new NotFoundException({ code: 'donation_not_found', message: 'Donation not found' });
const bad = (code: string, message: string) => new BadRequestException({ code, message });

/** `\`, `%` and `_` typed in a search mean themselves. */
const likeTerm = (term: string) => `%${term.replace(/[\\%_]/g, '\\$&')}%`;

/** A donation's Dhaka day, in SQL. */
const dhakaDay = Prisma.sql`(d.received_at AT TIME ZONE ${TIME_ZONE})::date`;

/** How many earlier purposes the form suggests. */
const PURPOSE_SUGGESTIONS = 20;

/**
 * Donations (`donations.*`, society-wide). Each is issued a receipt: a `payments` row with no
 * unit and no bills, numbered, printed and handed over like any other. The donation, not the
 * receipt, writes the `in` ledger row, so the money is counted once. Never deleted: a mistake
 * is voided through the donation, which voids its receipt and reverses the ledger row.
 */
@Injectable()
export class DonationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly parties: PartiesService,
    private readonly billTo: BillToService,
    private readonly numbering: NumberingService,
    private readonly settings: SettingsService,
    private readonly payments: PaymentsService,
  ) {}

  /** What the form offers: open funds (only the default one while separate funds are off), earlier purposes, the receipt header. */
  async options(societyId: string): Promise<DonationOptions> {
    const [funds, separateFunds, purposes, header] = await Promise.all([
      this.prisma.funds.findMany({
        where: { society_id: societyId, closed_at: null },
        select: { id: true, name_bn: true, name_en: true, is_default: true },
        orderBy: [{ is_default: 'desc' }, { name_bn: 'asc' }],
      }),
      this.settings.separateFunds(societyId),
      this.prisma.$queryRaw<{ purpose: string }[]>`
        SELECT d.purpose FROM donations d JOIN payments p ON p.id = d.payment_id
        WHERE d.society_id = ${societyId}::uuid AND d.purpose IS NOT NULL AND p.voided_at IS NULL
        GROUP BY d.purpose ORDER BY count(*) DESC, max(d.received_at) DESC LIMIT ${PURPOSE_SUGGESTIONS}`,
      this.settings.receiptHeader(societyId),
    ]);
    return {
      funds: funds.filter((fund) => separateFunds || fund.is_default).map(toFundOption),
      separateFunds,
      purposes: purposes.map((row) => row.purpose),
      header,
    };
  }

  /** People and organisations on record, by name (either digit form) or phone. Names and phones only. */
  async donors(actor: Actor, query: DonorLookupQuery): Promise<DonorLookup> {
    const terms = digitVariants(query.q);
    const phone = asciiDigits(query.q).replace(/\D/g, '');
    const [persons, organisations] = await Promise.all([
      this.prisma.persons.findMany({
        where: {
          society_id: actor.societyId,
          OR: [
            ...terms.flatMap((term) => [
              { full_name: { contains: term, mode: 'insensitive' as const } },
              { full_name_en: { contains: term, mode: 'insensitive' as const } },
            ]),
            ...(phone.length >= 3 ? [{ phone: { contains: phone } }] : []),
          ],
        },
        select: { id: true, full_name: true, full_name_en: true, phone: true },
        orderBy: [{ full_name: 'asc' }, { id: 'asc' }],
        take: 10,
      }),
      this.prisma.organisations.findMany({
        where: { society_id: actor.societyId, OR: terms.map((term) => ({ name: { contains: term, mode: 'insensitive' as const } })) },
        select: { id: true, name: true, persons: { select: { phone: true } } },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 5,
      }),
    ]);
    return {
      donors: [
        ...persons.map((row) => ({ kind: 'person' as const, id: row.id, name: row.full_name, nameEn: row.full_name_en, phone: row.phone })),
        ...organisations.map((row) => ({ kind: 'organisation' as const, id: row.id, name: row.name, nameEn: null, phone: row.persons?.phone ?? null })),
      ],
    };
  }

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  async list(actor: Actor, query: DonationListQuery): Promise<DonationList> {
    const { page, pageSize } = query;
    const where = Prisma.join(this.filters(actor, query), ' AND ');
    const from = Prisma.sql`donations d JOIN payments p ON p.id = d.payment_id`;
    const valid = Prisma.sql`p.voided_at IS NULL`;
    const [ids, [figures], byFund, byPurpose, summary] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT d.id FROM ${from} WHERE ${where}
        ORDER BY d.received_at DESC, p.receipt_no DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      this.prisma.$queryRaw<{ total: number; count: number; amount: string; void_count: number; donors: number }[]>`
        SELECT count(*)::int AS total,
               (count(*) FILTER (WHERE ${valid}))::int AS count,
               coalesce(sum(d.amount) FILTER (WHERE ${valid}), 0)::numeric(16,2)::text AS amount,
               (count(*) FILTER (WHERE NOT (${valid})))::int AS void_count,
               (count(DISTINCT coalesce(d.donor_person_id, d.donor_organisation_id)) FILTER (WHERE ${valid}))::int AS donors
        FROM ${from} WHERE ${where}`,
      this.prisma.$queryRaw<{ id: string; name_bn: string; name_en: string | null; count: number; amount: string }[]>`
        SELECT f.id, f.name_bn, f.name_en, count(*)::int AS count, sum(d.amount)::numeric(16,2)::text AS amount
        FROM ${from} JOIN funds f ON f.id = d.fund_id WHERE ${where} AND ${valid}
        GROUP BY f.id, f.name_bn, f.name_en ORDER BY sum(d.amount) DESC, f.name_bn`,
      this.prisma.$queryRaw<{ purpose: string | null; count: number; amount: string }[]>`
        SELECT d.purpose, count(*)::int AS count, sum(d.amount)::numeric(16,2)::text AS amount
        FROM ${from} WHERE ${where} AND ${valid}
        GROUP BY d.purpose ORDER BY sum(d.amount) DESC, d.purpose NULLS LAST LIMIT 20`,
      this.summary(actor.societyId),
    ]);
    const cash = await this.payments.summary(actor);
    const rows = await this.prisma.donations.findMany({ where: { id: { in: ids.map((row) => row.id) } }, select: rowSelect });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return {
      items: ids.flatMap(({ id }) => {
        const row = byId.get(id);
        return row ? [toRow(row)] : [];
      }),
      total: figures!.total,
      page,
      pageSize,
      totals: {
        count: figures!.count,
        amount: figures!.amount,
        voidCount: figures!.void_count,
        donors: figures!.donors,
        byFund: byFund.map((row) => ({ fund: { id: row.id, nameBn: row.name_bn, nameEn: row.name_en }, count: row.count, amount: row.amount })),
        byPurpose: byPurpose.map((row) => ({ purpose: row.purpose, count: row.count, amount: row.amount })),
      },
      summary,
      cash: { inHand: cash.inHand, pending: cash.pending },
    };
  }

  async get(actor: Actor, id: string): Promise<DonationDetail> {
    const row = await this.prisma.donations.findFirst({ where: { id, society_id: actor.societyId }, select: rowSelect });
    if (!row) throw donationNotFound();
    const receipt = await this.payments.receipt(actor, row.payment_id);
    return { ...toRow(row), receipt, can: { void: receipt.can.void } };
  }

  // -------------------------------------------------------------------------
  // Writing
  // -------------------------------------------------------------------------

  /**
   * Records a donation with its receipt and its ledger row, in one transaction. A new donor
   * is found by phone first, else added; the receipt keeps the donor as on the day.
   */
  async create(actor: Actor, input: DonationCreate): Promise<DonationDetail> {
    const today = isoDate(todayDate());
    const id = await this.prisma.$transaction(async (tx) => {
      const fund = await this.fund(tx, actor.societyId, input.fundId ?? null);
      const donor = await this.donor(tx, actor.societyId, input.donor);
      const snapshot: PayerSnapshot | null = donor
        ? payerSnapshotSchema.parse(await this.billTo.snapshot(tx, actor.societyId, donor, 'owner', null))
        : null;
      const number = await this.numbering.next(tx, actor.societyId, 'receipt', today);
      const receivedAt = new Date();
      const amount = new Prisma.Decimal(input.amount);
      const payment = await tx.payments.create({
        data: {
          society_id: actor.societyId,
          receipt_no: number.formatted,
          payer_person_id: donor?.kind === 'person' ? donor.id : null,
          payer_organisation_id: donor?.kind === 'organisation' ? donor.id : null,
          unit_id: null,
          payer_snapshot: snapshot ?? Prisma.DbNull,
          amount,
          method: 'cash',
          received_by: actor.userId,
          received_at: receivedAt,
          note: input.note,
        },
        select: { id: true },
      });
      const donation = await tx.donations.create({
        data: {
          society_id: actor.societyId,
          donor_person_id: donor?.kind === 'person' ? donor.id : null,
          donor_organisation_id: donor?.kind === 'organisation' ? donor.id : null,
          fund_id: fund.id,
          purpose: input.purpose,
          amount,
          payment_id: payment.id,
          received_at: receivedAt,
        },
        select: { id: true },
      });
      await tx.ledger_entries.create({
        data: {
          society_id: actor.societyId,
          fund_id: fund.id,
          entry_date: day(today),
          direction: 'in',
          amount,
          account: 'cash',
          source_type: 'donation',
          source_id: donation.id,
          memo: number.formatted,
          created_by: actor.userId,
        },
      });
      await this.audit.record(
        {
          ...auditOf(actor, 'create', donation.id),
          after: {
            receiptNo: number.formatted,
            paymentId: payment.id,
            donor: donor ? { kind: donor.kind, id: donor.id, added: donor.added } : null,
            fundId: fund.id,
            purpose: input.purpose,
            amount: input.amount,
            note: input.note,
          },
        },
        tx,
      );
      return donation.id;
    });
    return this.get(actor, id);
  }

  /** Counts a print of the donation's receipt: the first is the original, any later one a duplicate. */
  async print(actor: Actor, id: string): Promise<PaymentPrint> {
    const row = await this.prisma.donations.findFirst({ where: { id, society_id: actor.societyId }, select: { payment_id: true } });
    if (!row) throw donationNotFound();
    return this.payments.countPrint(actor, row.payment_id);
  }

  /**
   * Voids a donation: its receipt is voided and its ledger row reversed on today's date. The
   * collector may do it on the day while the cash is still with them; otherwise it needs
   * `donations.approve`. A pending handover's expected amount drops with it.
   */
  async void(actor: Actor, id: string, input: PaymentVoidInput): Promise<DonationDetail> {
    const today = isoDate(todayDate());
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT p.id FROM payments p JOIN donations d ON d.payment_id = p.id
        WHERE d.id = ${id}::uuid AND d.society_id = ${actor.societyId}::uuid FOR UPDATE OF p`;
      const donation = await tx.donations.findFirst({
        where: { id, society_id: actor.societyId },
        select: {
          payment_id: true,
          amount: true,
          payments: { select: { receipt_no: true, received_by: true, received_at: true, voided_at: true, handover_id: true } },
        },
      });
      if (!donation) throw donationNotFound();
      const receipt = donation.payments;
      if (receipt.voided_at) throw new ConflictException({ code: 'already_void', message: 'This donation is already void' });
      if (receipt.handover_id) await tx.$queryRaw`SELECT id FROM cash_handovers WHERE id = ${receipt.handover_id}::uuid FOR UPDATE`;
      if (!mayVoidReceipt(actor, { ...receipt, donation: true, path: null }, today)) {
        throw new ForbiddenException({ code: 'void_needs_approval', message: 'Only an approver can void this donation now' });
      }
      const entries = await tx.ledger_entries.findMany({
        where: { source_type: 'donation', source_id: id, reverses_id: null, reversed_by: { is: null } },
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
            source_type: 'donation',
            source_id: id,
            reverses_id: entry.id,
            memo: `${receipt.receipt_no} void`,
            created_by: actor.userId,
          },
        });
      }
      await tx.payments.update({
        where: { id: donation.payment_id },
        data: { void_reason: input.reason, voided_at: new Date(), voided_by: actor.userId },
      });
      await this.audit.record(
        {
          ...auditOf(actor, 'void', id),
          before: { receiptNo: receipt.receipt_no, amount: donation.amount.toFixed(2), handoverId: receipt.handover_id },
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

  /** The chosen fund, or the default one. Only the default fund while separate funds are off; never a closed one. */
  private async fund(tx: Tx, societyId: string, fundId: string | null): Promise<{ id: string }> {
    const fund = await tx.funds.findFirst({
      where: { society_id: societyId, ...(fundId ? { id: fundId } : { is_default: true }) },
      select: { id: true, is_default: true, closed_at: true },
    });
    if (!fund) throw bad('invalid_fund', 'Unknown fund');
    if (fund.closed_at) throw fundClosed();
    if (!fund.is_default && !(await this.settings.separateFunds(societyId, tx))) throw bad('invalid_fund', 'Only the default fund is in use');
    return fund;
  }

  /** The donor as a person or organisation of this society, or null when anonymous. `added` when a new person was made. */
  private async donor(
    tx: Tx,
    societyId: string,
    input: DonationCreate['donor'],
  ): Promise<{ kind: 'person' | 'organisation'; id: string; added: boolean } | null> {
    switch (input.kind) {
      case 'anonymous':
        return null;
      case 'person': {
        const row = await tx.persons.findFirst({ where: { id: input.id, society_id: societyId }, select: { id: true } });
        if (!row) throw bad('donor_not_found', 'Unknown donor');
        return { kind: 'person', id: row.id, added: false };
      }
      case 'organisation': {
        const row = await tx.organisations.findFirst({ where: { id: input.id, society_id: societyId }, select: { id: true } });
        if (!row) throw bad('donor_not_found', 'Unknown donor');
        return { kind: 'organisation', id: row.id, added: false };
      }
      case 'new': {
        const person = await this.parties.resolvePerson(tx, societyId, {
          fullName: input.fullName,
          fullNameEn: input.fullNameEn,
          phone: input.phone,
          email: null,
          nid: null,
          dateOfBirth: null,
          gender: null,
        });
        return { kind: 'person', id: person.id, added: !person.reused };
      }
    }
  }

  /** The stat cards: valid donations this month and this fiscal year (Dhaka dates). */
  private async summary(societyId: string): Promise<DonationSummary> {
    const today = isoDate(todayDate());
    const society = await this.prisma.societies.findUniqueOrThrow({ where: { id: societyId }, select: { fiscal_year_start_month: true } });
    const year = fiscalYearOf(today, society.fiscal_year_start_month);
    const monthStart = `${today.slice(0, 7)}-01`;
    const [row] = await this.prisma.$queryRaw<
      { month_count: number; month_amount: string; year_count: number; year_amount: string; year_donors: number }[]
    >`
      SELECT (count(*) FILTER (WHERE ${dhakaDay} >= ${monthStart}::date))::int AS month_count,
             coalesce(sum(d.amount) FILTER (WHERE ${dhakaDay} >= ${monthStart}::date), 0)::numeric(16,2)::text AS month_amount,
             count(*)::int AS year_count,
             coalesce(sum(d.amount), 0)::numeric(16,2)::text AS year_amount,
             count(DISTINCT coalesce(d.donor_person_id, d.donor_organisation_id))::int AS year_donors
      FROM donations d JOIN payments p ON p.id = d.payment_id
      WHERE d.society_id = ${societyId}::uuid AND p.voided_at IS NULL
        AND ${dhakaDay} BETWEEN ${year.start}::date AND ${year.end}::date`;
    return {
      month: { count: row!.month_count, amount: row!.month_amount },
      fiscalYear: { label: year.label, count: row!.year_count, amount: row!.year_amount, donors: row!.year_donors },
    };
  }

  private filters(actor: Actor, query: DonationListQuery): Prisma.Sql[] {
    const and = [Prisma.sql`d.society_id = ${actor.societyId}::uuid`];
    if (query.from) and.push(Prisma.sql`${dhakaDay} >= ${query.from}::date`);
    if (query.to) and.push(Prisma.sql`${dhakaDay} <= ${query.to}::date`);
    if (query.fundId) and.push(Prisma.sql`d.fund_id = ${query.fundId}::uuid`);
    if (query.purpose) and.push(Prisma.sql`d.purpose = ${query.purpose}`);
    if (query.personId) and.push(Prisma.sql`d.donor_person_id = ${query.personId}::uuid`);
    if (query.organisationId) and.push(Prisma.sql`d.donor_organisation_id = ${query.organisationId}::uuid`);
    if (query.status === 'valid') and.push(Prisma.sql`p.voided_at IS NULL`);
    if (query.status === 'void') and.push(Prisma.sql`p.voided_at IS NOT NULL`);
    if (query.q) {
      const phone = asciiDigits(query.q).replace(/\D/g, '');
      const terms = digitVariants(query.q).map((term) => {
        const like = likeTerm(term);
        return Prisma.sql`(p.receipt_no ILIKE ${like} OR d.purpose ILIKE ${like} OR p.payer_snapshot->>'name' ILIKE ${like} OR p.payer_snapshot->>'nameEn' ILIKE ${like})`;
      });
      if (phone.length >= 3) terms.push(Prisma.sql`p.payer_snapshot->>'phone' LIKE ${likeTerm(phone)}`);
      and.push(Prisma.sql`(${Prisma.join(terms, ' OR ')})`);
    }
    return and;
  }
}

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function toRow(row: Row): DonationRow {
  return {
    id: row.id,
    paymentId: row.payment_id,
    receiptNo: row.payments.receipt_no,
    receivedAt: row.received_at.toISOString(),
    receivedDay: isoDate(todayDate(row.received_at)),
    amount: row.amount.toFixed(2),
    donor: row.payments.payer_snapshot === null ? null : payerSnapshotSchema.parse(row.payments.payer_snapshot),
    fund: { id: row.funds.id, nameBn: row.funds.name_bn, nameEn: row.funds.name_en },
    purpose: row.purpose,
    collectedBy: { id: row.payments.users.id, name: nameOf(row.payments.users) },
    voided: row.payments.voided_at !== null,
  };
}

const auditOf = (actor: Actor, action: string, entityId: string) => ({
  societyId: actor.societyId,
  userId: actor.userId,
  action,
  entityType: 'donation',
  entityId,
  ip: actor.ip,
});
