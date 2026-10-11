import { INestApplication } from '@nestjs/common';
import {
  addMoney,
  addMonths,
  AUTH_COOKIES,
  billAheadPreviewSchema,
  billAheadResultSchema,
  billingRunPreviewSchema,
  collectLookupSchema,
  collectSummarySchema,
  CSRF_HEADER,
  handoverListSchema,
  handoverSchema,
  invoiceDetailSchema,
  monthOfDay,
  normaliseMoney,
  paymentDetailSchema,
  paymentListSchema,
  paymentPrintSchema,
  subtractMoney,
  type InvoiceDetail,
  type PaymentDetail,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { isoDate, todayDate } from './../src/common/dates.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-pay-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const today = () => isoDate(todayDate());
const M = () => monthOfDay(today());
const monthsAhead = (n: number) => monthOfDay(addMonths(`${M()}-01`, n));

type Caller = { cookie: string; id: string };

/**
 * Cash collection in a society of its own (ledger rows can't be deleted). Block C has flats
 * C1 and C2 owned by Rahim; Block D has flat D1 owned by Karim, who is also member no. 3.
 * Funds: general (service charge) and mosque (mosque fee).
 */
describe('Cash collection, receipts and handover (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let otherSocietyId: string;
  const server = () => app.getHttpServer();
  const users = {} as Record<'admin' | 'collectorC' | 'collectorC2' | 'treasurer' | 'treasurerD' | 'nobody', Caller>;
  const ids = {} as Record<'blockC' | 'blockD' | 'c1' | 'c2' | 'd1' | 'rahim' | 'karim' | 'service' | 'mosque' | 'general' | 'mosqueFund' | 'otherUnit', string>;

  async function makeUser(permissions: string[], scope: string | null = null): Promise<Caller> {
    const rows = await prisma.permissions.findMany();
    const role = await prisma.roles.create({ data: { society_id: societyId, name: `${MARK}-${randomUUID()}` } });
    await prisma.role_permissions.createMany({
      data: permissions.map((name) => ({ role_id: role.id, permission_id: rows.find((p) => `${p.module}:${p.action}` === name)!.id })),
    });
    const user = await prisma.users.create({ data: { society_id: societyId, phone: randomPhone(), status: 'active' } });
    if (permissions.length) await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.id, scope_location_id: scope } });
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId, sessionId: randomUUID() });
    return { cookie: `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}`, id: user.id };
  }

  const send = (method: 'post' | 'put' | 'delete', url: string, caller = users.admin) =>
    request(server())[method](url).set('Cookie', caller.cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const get = (url: string, caller = users.admin) => request(server()).get(url).set('Cookie', caller.cookie);

  const due = () => isoDate(new Date(Date.now() + 15 * 86_400_000));
  const bill = async (unitId: string, amount: string, chargeTypeId = ids.service): Promise<InvoiceDetail> =>
    invoiceDetailSchema.parse(
      (await send('post', '/invoices').send({ unitId, dueDate: due(), lines: [{ chargeTypeId, amount }] }).expect(201)).body,
    );
  const invoice = async (id: string) => invoiceDetailSchema.parse((await get(`/invoices/${id}`).expect(200)).body);
  const pay = (body: object, caller = users.collectorC) => send('post', '/payments', caller).send(body);
  const paid = async (body: object, caller = users.collectorC): Promise<PaymentDetail> => paymentDetailSchema.parse((await pay(body, caller).expect(201)).body);
  const rahim = () => ({ kind: 'person', id: ids.rahim });
  /** What the ledger holds from payments: in minus out, per society. */
  const ledgerFromPayments = async () => {
    const rows = await prisma.ledger_entries.groupBy({ by: ['direction'], where: { society_id: societyId, source_type: 'payment' }, _sum: { amount: true } });
    const sum = (direction: string) => rows.find((row) => row.direction === direction)?._sum.amount?.toFixed(2) ?? '0.00';
    return subtractMoney(sum('in'), sum('out'));
  };

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { PrismaPg, PrismaClient } = await import('@s57/db');
    const setup = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    societyId = (await setup.societies.create({ data: { name_bn: `সমিতি ${MARK}`, slug: MARK } })).id;
    await setup.$disconnect();

    app = await createTestApp([], { DEFAULT_SOCIETY_SLUG: MARK });
    prisma = app.get(PrismaService);

    ids.general = (await prisma.funds.create({ data: { society_id: societyId, name_bn: 'সাধারণ তহবিল', is_default: true } })).id;
    ids.mosqueFund = (await prisma.funds.create({ data: { society_id: societyId, name_bn: 'মসজিদ তহবিল' } })).id;
    const chargeType = (name_bn: string, fund_id: string, kind = 'due') =>
      prisma.charge_types.create({ data: { society_id: societyId, name_bn, kind, fund_id } }).then((r) => r.id);
    ids.service = await chargeType('সার্ভিস চার্জ', ids.general);
    ids.mosque = await chargeType('মসজিদ চাঁদা', ids.mosqueFund);
    const membershipFee = await chargeType('সদস্য ফি', ids.general, 'fee');

    const block = await prisma.location_levels.create({ data: { society_id: societyId, depth: 1, name_bn: 'ব্লক' } });
    const flat = await prisma.location_levels.create({ data: { society_id: societyId, depth: 2, name_bn: 'ইউনিট', is_unit_level: true } });
    const place = async (levelId: string, name: string, parent: { id: string; path: string } | null) => {
      const id = randomUUID();
      const path = `${parent?.path ?? '/'}${id}/`;
      await prisma.locations.create({ data: { id, society_id: societyId, level_id: levelId, parent_id: parent?.id ?? null, name, path } });
      return { id, path };
    };
    const unit = async (name: string, parent: { id: string; path: string }) => {
      const row = await place(flat.id, name, parent);
      await prisma.units.create({ data: { location_id: row.id, society_id: societyId, unit_type: 'residential' } });
      return row.id;
    };
    const c = await place(block.id, 'ব্লক সি', null);
    const d = await place(block.id, 'ব্লক ডি', null);
    ids.blockC = c.id;
    ids.blockD = d.id;
    ids.c1 = await unit('সি-১', c);
    ids.c2 = await unit('সি-২', c);
    ids.d1 = await unit('ডি-১', d);

    const person = (full_name: string) => prisma.persons.create({ data: { society_id: societyId, full_name, phone: randomPhone() } }).then((r) => r.id);
    ids.rahim = await person('রহিম উদ্দিন');
    ids.karim = await person('করিম মিয়া');
    const own = (location_id: string, person_id: string) =>
      prisma.ownerships.create({ data: { society_id: societyId, location_id, person_id, start_date: new Date('2020-01-01') } });
    await own(ids.c1, ids.rahim);
    await own(ids.c2, ids.rahim);
    await own(ids.d1, ids.karim);
    await prisma.memberships.create({ data: { society_id: societyId, person_id: ids.karim, member_no: 3, joined_on: new Date('2025-01-01') } });

    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: `${MARK}-other` } })).id;
    const otherLevel = await prisma.location_levels.create({ data: { society_id: otherSocietyId, depth: 1, name_bn: 'ইউনিট', is_unit_level: true } });
    ids.otherUnit = randomUUID();
    await prisma.locations.create({ data: { id: ids.otherUnit, society_id: otherSocietyId, level_id: otherLevel.id, name: 'অন্য', path: `/${ids.otherUnit}/` } });
    await prisma.units.create({ data: { location_id: ids.otherUnit, society_id: otherSocietyId, unit_type: 'residential' } });

    const everything = (await prisma.permissions.findMany()).map((p) => `${p.module}:${p.action}`);
    users.admin = await makeUser(everything);
    users.collectorC = await makeUser(['payments:view', 'payments:create', 'billing:view'], ids.blockC);
    users.collectorC2 = await makeUser(['payments:view', 'payments:create'], ids.blockC);
    users.treasurer = await makeUser(['payments:view', 'payments:approve']);
    users.treasurerD = await makeUser(['payments:view', 'payments:approve'], ids.blockD);
    users.nobody = await makeUser([]);

    // Karim's membership fee, billed to him as member no. 3.
    await send('post', '/invoices').send({ personId: ids.karim, dueDate: due(), lines: [{ chargeTypeId: membershipFee, amount: '500' }] }).expect(201);
  });

  afterAll(async () => {
    if (!prisma) return;
    const societies = { in: [societyId, otherSocietyId] };
    // Ledger rows go only with the society (the trigger allows that cascade).
    await prisma.payment_allocations.deleteMany({ where: { payments: { society_id: societies } } });
    await prisma.payments.deleteMany({ where: { society_id: societies } });
    await prisma.cash_handovers.deleteMany({ where: { society_id: societies } });
    await prisma.invoices.deleteMany({ where: { society_id: societies } });
    await prisma.billing_runs.deleteMany({ where: { society_id: societies } });
    await prisma.charge_schedules.deleteMany({ where: { society_id: societies } });
    await prisma.memberships.deleteMany({ where: { society_id: societies } });
    await prisma.ownerships.deleteMany({ where: { society_id: societies } });
    await prisma.user_roles.deleteMany({ where: { users_user_roles_user_idTousers: { society_id: societyId } } });
    for (const depth of [2, 1]) await prisma.locations.deleteMany({ where: { society_id: societies, location_levels: { depth } } });
    await prisma.societies.deleteMany({ where: { id: societies } });
    await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
    await app.close();
  });

  describe('finding what to collect', () => {
    it('lists a unit’s open bills oldest first, within the collector’s area', async () => {
      const later = await bill(ids.c1, '1500.10');
      const mosque = await bill(ids.c1, '200', ids.mosque);
      await bill(ids.d1, '900');

      const found = collectLookupSchema.parse((await get(`/collect/lookup?unitId=${ids.c1}`, users.collectorC).expect(200)).body);
      expect(found.accounts).toHaveLength(1);
      const [account] = found.accounts;
      expect(account).toMatchObject({ kind: 'unit', name: 'সি-১', due: '1700.10' });
      expect(account!.bills.map((b) => b.id)).toEqual([later.id, mosque.id]);
      expect(account!.payers).toEqual([expect.objectContaining({ kind: 'person', id: ids.rahim, name: 'রহিম উদ্দিন' })]);

      // Block D is outside Block C's area.
      const outside = collectLookupSchema.parse((await get(`/collect/lookup?unitId=${ids.d1}`, users.collectorC).expect(200)).body);
      expect(outside.accounts).toEqual([]);
    });

    it('finds units by payer name, and members only for society-wide collectors', async () => {
      const byPayer = collectLookupSchema.parse((await get(`/collect/lookup?q=${encodeURIComponent('রহিম')}`, users.collectorC).expect(200)).body);
      expect(byPayer.accounts.map((a) => a.name)).toEqual(['সি-১']);
      const scoped = collectLookupSchema.parse((await get(`/collect/lookup?q=${encodeURIComponent('করিম')}`, users.collectorC).expect(200)).body);
      expect(scoped.accounts).toEqual([]);
      const wide = collectLookupSchema.parse((await get(`/collect/lookup?q=${encodeURIComponent('করিম')}`).expect(200)).body);
      expect(wide.accounts.map((a) => [a.kind, a.name])).toEqual([
        ['unit', 'ডি-১'],
        ['member', 'করিম মিয়া'],
      ]);
      // Bangla digits find the member number.
      const byNumber = collectLookupSchema.parse((await get(`/collect/lookup?q=${encodeURIComponent('৩')}`).expect(200)).body);
      expect(byNumber.accounts.find((a) => a.kind === 'member')?.memberNo).toBe(3);
      await get('/collect/lookup?q=x', users.nobody).expect(403);
      await get('/collect/lookup?q=x', users.treasurer).expect(403);
    });
  });

  describe('taking a payment', () => {
    it('settles oldest first, writes the ledger per fund, and keeps the payer as on the day', async () => {
      const account = collectLookupSchema.parse((await get(`/collect/lookup?unitId=${ids.c1}`, users.collectorC).expect(200)).body).accounts[0]!;
      const [service, mosque] = account.bills;
      const before = await ledgerFromPayments();

      const payment = await paid({ unitId: ids.c1, invoiceIds: [mosque!.id, service!.id], amount: '১,৬০০.১০', payer: rahim(), note: 'নগদ' });
      expect(payment.receiptNo).toMatch(/^RC-\d{5}$/);
      expect(payment).toMatchObject({ amount: '1600.10', voided: false, handover: null, note: 'নগদ', receivedDay: today() });
      expect(payment.collectedBy.id).toBe(users.collectorC.id);
      expect(payment.payer).toMatchObject({ id: ids.rahim, name: 'রহিম উদ্দিন', unit: { id: ids.c1, name: 'সি-১', address: ['ব্লক সি'] } });
      expect(payment.allocations.map((a) => [a.invoiceId, a.amount])).toEqual([
        [service!.id, '1500.10'],
        [mosque!.id, '100.00'],
      ]);
      expect(payment.header.nameBn).toBe(`সমিতি ${MARK}`);

      expect(await invoice(service!.id)).toMatchObject({ status: 'paid', paid: '1500.10', due: '0.00' });
      const partly = await invoice(mosque!.id);
      expect(partly).toMatchObject({ status: 'partial', paid: '100.00', due: '100.00' });
      expect(partly.payments).toEqual([{ id: payment.id, receiptNo: payment.receiptNo, receivedDay: today(), amount: '100.00', voided: false }]);

      const entries = await prisma.ledger_entries.findMany({ where: { source_type: 'payment', source_id: payment.id }, orderBy: { amount: 'asc' } });
      expect(entries.map((e) => [e.fund_id, e.direction, e.account, e.amount.toFixed(2)])).toEqual([
        [ids.mosqueFund, 'in', 'cash', '100.00'],
        [ids.general, 'in', 'cash', '1500.10'],
      ]);
      expect(await ledgerFromPayments()).toBe(addMoney(before, '1600.10'));

      // A later name change leaves the receipt as it was.
      await prisma.persons.update({ where: { id: ids.rahim }, data: { full_name: 'রহিম উদ্দিন আহমেদ' } });
      const again = paymentDetailSchema.parse((await get(`/payments/${payment.id}`, users.collectorC).expect(200)).body);
      expect(again.payer.name).toBe('রহিম উদ্দিন');
    });

    it('counts exact paisa', async () => {
      const a = await bill(ids.c2, '0.10');
      const b = await bill(ids.c2, '0.20');
      const payment = await paid({ unitId: ids.c2, invoiceIds: [a.id, b.id], amount: '0.30', payer: rahim() });
      expect(payment.amount).toBe('0.30');
      expect((await invoice(b.id)).status).toBe('paid');
    });

    it('refuses what it shouldn’t take', async () => {
      const open = await bill(ids.c2, '300');
      const other = await bill(ids.c2, '300');
      const base = { unitId: ids.c2, invoiceIds: [open.id], payer: rahim() };
      expect((await pay({ ...base, amount: '300.01' }).expect(400)).body.code).toBe('amount_exceeds_due');
      expect((await pay({ ...base, invoiceIds: [open.id, other.id], amount: '300' }).expect(400)).body.code).toBe('bill_not_reached');
      expect((await pay({ ...base, amount: '0' }).expect(400)).body.code).toBeDefined();
      expect((await pay({ ...base, payer: { kind: 'person', id: ids.karim }, amount: '10' }).expect(400)).body.code).toBe('invalid_payer');
      expect((await pay({ ...base, unitId: ids.c1, amount: '10' }).expect(400)).body.code).toBe('invoice_not_for_account');
      expect((await pay({ ...base, unitId: ids.d1, amount: '10' }).expect(404)).body.code).toBe('unit_not_found');
      expect((await pay({ ...base, unitId: ids.otherUnit, amount: '10' }, users.admin).expect(404)).body.code).toBe('unit_not_found');
      expect((await pay({ ...base, invoiceIds: [randomUUID()], amount: '10' }).expect(404)).body.code).toBe('invoice_not_found');
      await pay({ ...base, amount: '10' }, users.nobody).expect(403);
      await pay({ ...base, amount: '10' }, users.treasurer).expect(403);

      // A membership fee has no unit: only a society-wide collector takes it.
      const member = collectLookupSchema.parse((await get(`/collect/lookup?personId=${ids.karim}`).expect(200)).body).accounts.find((a) => a.kind === 'member')!;
      const fee = { personId: ids.karim, invoiceIds: member.bills.map((b) => b.id), amount: '500', payer: { kind: 'person', id: ids.karim } };
      expect((await pay(fee).expect(403)).body.code).toBe('beyond_your_permissions');
      const receipt = await paid(fee, users.admin);
      expect(receipt.payer).toMatchObject({ id: ids.karim, memberNo: 3, unit: null });
      // Scoped callers can't see a payment with no unit.
      await get(`/payments/${receipt.id}`, users.collectorC).expect(404);

      // A paid bill can't be paid again.
      await paid({ ...base, amount: '300' });
      expect((await pay({ ...base, amount: '1' }).expect(409)).body.code).toBe('invoice_changed');
    });

    it('lets only one of two payments on the same bill through', async () => {
      const target = await bill(ids.c2, '100');
      const body = { unitId: ids.c2, invoiceIds: [target.id], amount: '100', payer: rahim() };
      const results = await Promise.all([pay(body), pay(body, users.collectorC2)]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([201, 409]);
      const after = await prisma.invoices.findUniqueOrThrow({ where: { id: target.id } });
      expect(after.paid.toFixed(2)).toBe('100.00');
      expect(await prisma.payment_allocations.count({ where: { invoice_id: target.id } })).toBe(1);
    });

    it('gives concurrent receipts distinct numbers without gaps', async () => {
      const bills = await Promise.all([1, 2, 3, 4].map(() => bill(ids.c2, '10')));
      const made = await Promise.all(bills.map((b) => paid({ unitId: ids.c2, invoiceIds: [b.id], amount: '10', payer: rahim() })));
      const numbers = made.map((p) => Number(p.receiptNo.slice(3))).sort((a, b) => a - b);
      expect(new Set(numbers).size).toBe(4);
      expect(numbers[3]! - numbers[0]!).toBe(3);
    });
  });

  describe('reading', () => {
    it('lists within the area, with totals', async () => {
      const mine = paymentListSchema.parse((await get('/payments?collectorId=me', users.collectorC).expect(200)).body);
      expect(mine.items.length).toBeGreaterThan(0);
      expect(mine.items.every((p) => p.collectedBy.id === users.collectorC.id)).toBe(true);
      expect(mine.items.every((p) => p.payer.unit?.address[0] === 'ব্লক সি')).toBe(true);
      expect(mine.totals.amount).toBe(addMoney('0', ...mine.items.filter((p) => !p.voided).map((p) => p.amount)));

      const d = paymentListSchema.parse((await get('/payments', users.treasurerD).expect(200)).body);
      expect(d.items).toEqual([]);
      const first = mine.items[0]!;
      await get(`/payments/${first.id}`, users.treasurerD).expect(404);
      await get(`/payments/${first.id}`, users.nobody).expect(403);

      const search = paymentListSchema.parse((await get(`/payments?q=${encodeURIComponent(first.receiptNo)}`).expect(200)).body);
      expect(search.items.map((p) => p.id)).toEqual([first.id]);
      const today_ = paymentListSchema.parse((await get(`/payments?from=${today()}&to=${today()}`).expect(200)).body);
      expect(today_.total).toBe(paymentListSchema.parse((await get('/payments').expect(200)).body).total);
    });

    it('prints the original once, then duplicates', async () => {
      const [first] = paymentListSchema.parse((await get('/payments?collectorId=me', users.collectorC).expect(200)).body).items;
      expect(paymentPrintSchema.parse((await send('post', `/payments/${first!.id}/print`, users.collectorC).expect(200)).body)).toEqual({ copy: 'original', printCount: 1 });
      expect(paymentPrintSchema.parse((await send('post', `/payments/${first!.id}/print`, users.collectorC).expect(200)).body)).toEqual({ copy: 'duplicate', printCount: 2 });
      await send('post', `/payments/${first!.id}/print`, users.treasurerD).expect(404);
    });

    it('has no delete route: receipts are only voided', async () => {
      const [first] = paymentListSchema.parse((await get('/payments').expect(200)).body).items;
      await send('delete', `/payments/${first!.id}`).expect(404);
      await send('delete', `/handovers/${randomUUID()}`).expect(404);
    });
  });

  describe('voiding', () => {
    it('lets the collector void their own payment the same day, and gives the bill its due back', async () => {
      const target = await bill(ids.c1, '700');
      const payment = await paid({ unitId: ids.c1, invoiceIds: [target.id], amount: '700', payer: rahim() });
      expect(payment.can.void).toBe(true);
      const before = await ledgerFromPayments();

      // Another collector in the same area may not.
      const other = await send('post', `/payments/${payment.id}/void`, users.collectorC2).send({ reason: 'ভুল' }).expect(403);
      expect(other.body.code).toBe('void_needs_approval');

      const voided = paymentDetailSchema.parse((await send('post', `/payments/${payment.id}/void`, users.collectorC).send({ reason: 'ভুল ইউনিট' }).expect(200)).body);
      expect(voided).toMatchObject({ voided: true, void: { reason: 'ভুল ইউনিট' }, can: { void: false } });
      expect(await invoice(target.id)).toMatchObject({ status: 'unpaid', paid: '0.00', due: '700.00' });
      expect(await ledgerFromPayments()).toBe(subtractMoney(before, '700'));
      const reversal = await prisma.ledger_entries.findFirstOrThrow({ where: { source_id: payment.id, direction: 'out' } });
      expect(reversal.reverses_id).not.toBeNull();

      expect((await send('post', `/payments/${payment.id}/void`, users.collectorC).send({ reason: 'আবার' }).expect(409)).body.code).toBe('already_void');
      // The bill can be voided again now that nothing is paid on it.
      expect((await invoice(target.id)).payments[0]?.voided).toBe(true);
      await send('post', `/invoices/${target.id}/void`).send({ reason: 'পরীক্ষা' }).expect(200);
    });

    it('needs an approver after the day, in their area', async () => {
      const target = await bill(ids.c1, '50');
      const payment = await paid({ unitId: ids.c1, invoiceIds: [target.id], amount: '50', payer: rahim() });
      await prisma.payments.update({ where: { id: payment.id }, data: { received_at: new Date(Date.now() - 2 * 86_400_000) } });
      expect((await send('post', `/payments/${payment.id}/void`, users.collectorC).send({ reason: 'পরে' }).expect(403)).body.code).toBe('void_needs_approval');
      await send('post', `/payments/${payment.id}/void`, users.treasurerD).send({ reason: 'পরে' }).expect(404);
      await send('post', `/payments/${payment.id}/void`, users.treasurer).send({ reason: 'পরে' }).expect(200);
      expect((await invoice(target.id)).status).toBe('unpaid');
    });
  });

  describe('handover', () => {
    it('hands over the cash in hand; someone else counts it; a difference needs a note', async () => {
      const summary = collectSummarySchema.parse((await get('/collect/summary', users.collectorC).expect(200)).body);
      expect(summary.inHand.count).toBeGreaterThan(0);
      expect(summary.today.count).toBe(summary.inHand.count);

      const handover = handoverSchema.parse((await send('post', '/handovers', users.collectorC).expect(201)).body);
      expect(handover).toMatchObject({ status: 'pending', expected: summary.inHand.amount, paymentCount: summary.inHand.count, counted: null });
      expect(handover.can.confirm).toBe(false);
      const after = collectSummarySchema.parse((await get('/collect/summary', users.collectorC).expect(200)).body);
      expect(after.inHand).toEqual({ count: 0, amount: '0.00' });
      expect(after.pending).toEqual({ count: 1, amount: summary.inHand.amount });
      expect((await send('post', '/handovers', users.collectorC).expect(400)).body.code).toBe('nothing_to_hand_over');

      // In a handover the collector can no longer void; an approver can, and the expected cash drops.
      const [inside] = paymentListSchema.parse((await get('/payments?collectorId=me&status=valid', users.collectorC).expect(200)).body).items;
      expect(inside!.handover).toEqual({ id: handover.id, confirmed: false });
      await send('post', `/payments/${inside!.id}/void`, users.collectorC).send({ reason: 'ভুল' }).expect(403);
      await send('post', `/payments/${inside!.id}/void`, users.treasurer).send({ reason: 'ভুল' }).expect(200);
      const expected = handoverSchema.parse((await get(`/handovers/${handover.id}`, users.treasurer).expect(200)).body);
      expect(expected.expected).toBe(subtractMoney(handover.expected, inside!.amount));
      expect(expected.can.confirm).toBe(true);

      // Block D's treasurer doesn't see Block C's cash; the collector can't confirm (no approve).
      await get(`/handovers/${handover.id}`, users.treasurerD).expect(404);
      await send('post', `/handovers/${handover.id}/confirm`, users.treasurerD).send({ amountCounted: '0' }).expect(404);
      await send('post', `/handovers/${handover.id}/confirm`, users.collectorC).send({ amountCounted: '0' }).expect(403);

      const short = subtractMoney(expected.expected, '10.00');
      expect((await send('post', `/handovers/${handover.id}/confirm`, users.treasurer).send({ amountCounted: short }).expect(400)).body.code).toBe('note_required');
      const confirmed = handoverSchema.parse(
        (await send('post', `/handovers/${handover.id}/confirm`, users.treasurer).send({ amountCounted: short, note: '১০ টাকা কম' }).expect(200)).body,
      );
      expect(confirmed).toMatchObject({ status: 'confirmed', expected: expected.expected, counted: short, difference: '-10.00', note: '১০ টাকা কম' });
      expect((await send('post', `/handovers/${handover.id}/confirm`, users.treasurer).send({ amountCounted: short, note: 'x' }).expect(409)).body.code).toBe('already_confirmed');
      const stamped = await prisma.payments.findFirstOrThrow({ where: { handover_id: handover.id, voided_at: null } });
      expect(stamped.handed_over_at).not.toBeNull();

      const list = handoverListSchema.parse((await get('/handovers', users.collectorC).expect(200)).body);
      expect(list.items.map((h) => h.id)).toContain(handover.id);
      const dList = handoverListSchema.parse((await get('/handovers', users.treasurerD).expect(200)).body);
      expect(dList.items.map((h) => h.id)).not.toContain(handover.id);
    });

    it('never lets anyone confirm their own cash', async () => {
      const target = await bill(ids.d1, '25');
      await paid({ unitId: ids.d1, invoiceIds: [target.id], amount: '25', payer: { kind: 'person', id: ids.karim } }, users.admin);
      const own = handoverSchema.parse((await send('post', '/handovers', users.admin).expect(201)).body);
      expect(own.can.confirm).toBe(false);
      expect((await send('post', `/handovers/${own.id}/confirm`, users.admin).send({ amountCounted: own.expected }).expect(403)).body.code).toBe('cannot_confirm_own');
      // It holds Karim's membership fee too (no unit), so only a society-wide approver may confirm it.
      await send('post', `/handovers/${own.id}/confirm`, users.treasurerD).send({ amountCounted: own.expected }).expect(404);
      await send('post', `/handovers/${own.id}/confirm`, users.treasurer).send({ amountCounted: own.expected }).expect(200);
    });
  });

  describe('the ledger', () => {
    it('agrees with the receipts that aren’t void', async () => {
      const [{ sum }] = await prisma.$queryRaw<{ sum: string }[]>`
        SELECT coalesce(sum(amount), 0)::text AS sum FROM payments WHERE society_id = ${societyId}::uuid AND voided_at IS NULL`;
      expect(await ledgerFromPayments()).toBe(normaliseMoney(sum));
      const row = await prisma.ledger_entries.findFirstOrThrow({ where: { society_id: societyId, source_type: 'payment' } });
      await expect(prisma.ledger_entries.update({ where: { id: row.id }, data: { memo: 'x' } })).rejects.toThrow();
    });
  });

  describe('billing ahead', () => {
    it('bills one unit’s months ahead, and a later run leaves them alone', async () => {
      await send('post', '/schedules')
        .send({
          nameBn: 'মাসিক চার্জ',
          nameEn: 'Monthly charge',
          chargeTypeId: ids.service,
          amount: '300',
          rates: [],
          frequencyMonths: 1,
          generation: 'manual',
          scopeLocationId: null,
          unitTypes: [],
          startMonth: M(),
          endMonth: null,
          dueDays: 10,
        })
        .expect(201);

      const preview = billAheadPreviewSchema.parse((await get(`/units/${ids.c1}/bill-ahead?month=${monthsAhead(2)}`).expect(200)).body);
      expect(preview).toMatchObject({ invoiceCount: 1, total: '900.00', billTo: 'রহিম উদ্দিন আহমেদ' });
      expect(preview.lines.map((line) => line.periodStart)).toEqual([0, 1, 2].map((n) => `${monthsAhead(n)}-01`));

      const made = billAheadResultSchema.parse((await send('post', `/units/${ids.c1}/bill-ahead`).send({ month: monthsAhead(2) }).expect(201)).body);
      expect(made.invoices).toEqual([expect.objectContaining({ total: '900.00' })]);
      expect((await send('post', `/units/${ids.c1}/bill-ahead`).send({ month: monthsAhead(2) }).expect(400)).body.code).toBe('nothing_to_bill');
      expect((await send('post', `/units/${ids.c1}/bill-ahead`).send({ month: monthsAhead(13) }).expect(400)).body.code).toBe('bill_ahead_range');
      await send('post', `/units/${ids.c1}/bill-ahead`, users.collectorC).send({ month: monthsAhead(1) }).expect(403);
      await get(`/units/${ids.otherUnit}/bill-ahead?month=${M()}`).expect(404);

      // The run for this month bills the others and skips C1, already billed.
      const run = billingRunPreviewSchema.parse((await get(`/billing-runs/preview?month=${M()}`).expect(200)).body);
      expect(run.lines.map((line) => line.unitId).sort()).toEqual([ids.c2, ids.d1].sort());
      expect(run.skipped).toEqual([expect.objectContaining({ unitId: ids.c1, reason: 'already_billed' })]);
      // And the bill can be paid at once.
      const account = collectLookupSchema.parse((await get(`/collect/lookup?unitId=${ids.c1}`, users.collectorC).expect(200)).body).accounts[0]!;
      expect(account.bills.map((b) => b.id)).toContain(made.invoices[0]!.id);
    });
  });
});

