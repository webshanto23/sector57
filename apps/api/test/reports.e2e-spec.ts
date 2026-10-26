import { INestApplication } from '@nestjs/common';
import {
  addMoney,
  arrearsReportSchema,
  auditListSchema,
  auditOptionsSchema,
  AUTH_COOKIES,
  collectionReportSchema,
  CSRF_HEADER,
  dayBookSchema,
  expenseDetailSchema,
  fiscalYearOf,
  fundListSchema,
  incomeReportSchema,
  invoiceDetailSchema,
  ledgerStatementSchema,
  paymentDetailSchema,
  subtractMoney,
  transferListSchema,
  transferSchema,
  type InvoiceDetail,
  type PaymentDetail,
  type Transfer,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { isoDate, todayDate } from './../src/common/dates.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp, expenseBody } from './create-app.js';

const MARK = `e2e-rep-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const today = () => isoDate(todayDate());
const daysAgo = (n: number) => isoDate(new Date(todayDate().getTime() - n * 86_400_000));
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

type Caller = { cookie: string; id: string };

/**
 * The fund ledger, transfers and finance reports, in a society of their own (ledger rows
 * can't be deleted). Sector 15 holds Block C (road C-1 with flats C1 and C2) and Block D
 * (flat D1). The general fund (default) starts with ৳10,000 cash; the mosque fund is empty.
 */
describe('Fund ledger and finance reports (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let otherSocietyId: string;
  const server = () => app.getHttpServer();
  const users = {} as Record<
    'admin' | 'clerkC' | 'viewerD' | 'requester' | 'ledgerViewer' | 'ledgerClerk' | 'ledgerApprover' | 'auditor' | 'exporter' | 'nobody',
    Caller
  >;
  const ids = {} as Record<
    | 'general'
    | 'mosque'
    | 'closed'
    | 'otherFund'
    | 'sector'
    | 'blockC'
    | 'blockD'
    | 'roadC1'
    | 'c1'
    | 'c2'
    | 'd1'
    | 'rahim'
    | 'karim'
    | 'service'
    | 'fine'
    | 'mosqueFee'
    | 'repairs',
    string
  >;
  const bills = {} as Record<'c1' | 'c2' | 'd1' | 'd1Mosque', InvoiceDetail>;
  const transfers = {} as Record<'deposit', Transfer>;

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

  const send = (method: 'post' | 'put' | 'patch' | 'delete', url: string, caller = users.admin) =>
    request(server())[method](url).set('Cookie', caller.cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const get = (url: string, caller = users.admin) => request(server()).get(url).set('Cookie', caller.cookie);

  const bill = async (unitId: string, lines: [string, string][]): Promise<InvoiceDetail> =>
    invoiceDetailSchema.parse(
      (
        await send('post', '/invoices')
          .send({ unitId, dueDate: daysAgo(-15), lines: lines.map(([chargeTypeId, amount]) => ({ chargeTypeId, amount })) })
          .expect(201)
      ).body,
    );
  const pay = async (unitId: string, invoiceIds: string[], amount: string, payer: string, caller = users.admin): Promise<PaymentDetail> =>
    paymentDetailSchema.parse(
      (await send('post', '/payments', caller).send({ unitId, invoiceIds, amount, payer: { kind: 'person', id: payer } }).expect(201)).body,
    );
  const transfer = (body: object, caller = users.ledgerClerk) => send('post', '/ledger/transfers', caller).send(body);
  const funds = async () => fundListSchema.parse((await get('/funds').expect(200)).body).items;
  const balanceOf = async (fundId: string) => (await funds()).find((fund) => fund.id === fundId)!.balance;
  const expense = async (amount: string) => {
    const made = expenseDetailSchema.parse(
      (await send('post', '/expenses', users.requester).send(expenseBody({ headId: ids.repairs, description: 'পাম্প মেরামত', amount, spentOn: today() })).expect(201)).body,
    );
    await send('post', `/expenses/${made.id}/approve`).expect(200);
    return expenseDetailSchema.parse((await send('post', `/expenses/${made.id}/pay`).send({ method: 'cash' }).expect(200)).body);
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
    ids.mosque = (await prisma.funds.create({ data: { society_id: societyId, name_bn: 'মসজিদ তহবিল' } })).id;
    ids.closed = (await prisma.funds.create({ data: { society_id: societyId, name_bn: 'বন্ধ তহবিল', closed_at: new Date() } })).id;
    await prisma.ledger_entries.create({
      data: { society_id: societyId, fund_id: ids.general, account: 'cash', amount: '10000', direction: 'in', source_type: 'opening', source_id: ids.general, entry_date: day('2026-01-01') },
    });
    const chargeType = (name_bn: string, fund_id: string, kind = 'due') =>
      prisma.charge_types.create({ data: { society_id: societyId, name_bn, kind, fund_id } }).then((r) => r.id);
    ids.service = await chargeType('সার্ভিস চার্জ', ids.general);
    ids.fine = await chargeType('জরিমানা', ids.general, 'fine');
    ids.mosqueFee = await chargeType('মসজিদ চাঁদা', ids.mosque);
    ids.repairs = (await prisma.expense_heads.create({ data: { society_id: societyId, name_bn: 'মেরামত' } })).id;

    const level = (depth: number, name_bn: string, is_unit_level = false) =>
      prisma.location_levels.create({ data: { society_id: societyId, depth, name_bn, is_unit_level } }).then((r) => r.id);
    const sectorLevel = await level(1, 'সেক্টর');
    const blockLevel = await level(2, 'ব্লক');
    const roadLevel = await level(3, 'রোড');
    const flatLevel = await level(4, 'ইউনিট', true);
    const place = async (levelId: string, name: string, parent: { id: string; path: string } | null) => {
      const id = randomUUID();
      const path = `${parent?.path ?? '/'}${id}/`;
      await prisma.locations.create({ data: { id, society_id: societyId, level_id: levelId, parent_id: parent?.id ?? null, name, path } });
      return { id, path };
    };
    const unit = async (name: string, parent: { id: string; path: string }) => {
      const row = await place(flatLevel, name, parent);
      await prisma.units.create({ data: { location_id: row.id, society_id: societyId, unit_type: 'residential' } });
      return row.id;
    };
    const sector = await place(sectorLevel, 'সেক্টর ১৫', null);
    const c = await place(blockLevel, 'ব্লক সি', sector);
    const d = await place(blockLevel, 'ব্লক ডি', sector);
    const road = await place(roadLevel, 'রোড সি-১', c);
    Object.assign(ids, { sector: sector.id, blockC: c.id, blockD: d.id, roadC1: road.id });
    ids.c1 = await unit('সি-১', road);
    ids.c2 = await unit('সি-২', road);
    ids.d1 = await unit('ডি-১', d);

    const person = (full_name: string) => prisma.persons.create({ data: { society_id: societyId, full_name, phone: randomPhone() } }).then((r) => r.id);
    ids.rahim = await person('রহিম উদ্দিন');
    ids.karim = await person('করিম মিয়া');
    const own = (location_id: string, person_id: string) =>
      prisma.ownerships.create({ data: { society_id: societyId, location_id, person_id, start_date: new Date('2020-01-01') } });
    await own(ids.c1, ids.rahim);
    await own(ids.c2, ids.rahim);
    await own(ids.d1, ids.karim);

    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: `${MARK}-other` } })).id;
    ids.otherFund = (await prisma.funds.create({ data: { society_id: otherSocietyId, name_bn: 'অন্য তহবিল', is_default: true } })).id;

    const everything = (await prisma.permissions.findMany()).map((p) => `${p.module}:${p.action}`);
    users.admin = await makeUser(everything);
    users.clerkC = await makeUser(['payments:view', 'payments:create', 'billing:view', 'billing:export'], ids.blockC);
    users.viewerD = await makeUser(['billing:view'], ids.blockD);
    users.requester = await makeUser(['expenses:view', 'expenses:create']);
    users.ledgerViewer = await makeUser(['ledger:view']);
    users.ledgerClerk = await makeUser(['ledger:view', 'ledger:create']);
    users.ledgerApprover = await makeUser(['ledger:view', 'ledger:approve']);
    users.auditor = await makeUser(['audit:view']);
    users.exporter = await makeUser(['ledger:view', 'ledger:export', 'payments:view', 'payments:export', 'donations:view']);
    users.nobody = await makeUser([]);
  });

  afterAll(async () => {
    if (!prisma) return;
    const societies = { in: [societyId, otherSocietyId] };
    // Ledger rows and transfers go only with the society (their triggers allow that cascade).
    await prisma.payment_allocations.deleteMany({ where: { payments: { society_id: societies } } });
    await prisma.donations.deleteMany({ where: { society_id: societies } });
    await prisma.payments.deleteMany({ where: { society_id: societies } });
    await prisma.invoices.deleteMany({ where: { society_id: societies } });
    await prisma.budgets.deleteMany({ where: { society_id: societies } });
    await prisma.expenses.deleteMany({ where: { society_id: societies } });
    await prisma.expense_heads.deleteMany({ where: { society_id: societies } });
    await prisma.ownerships.deleteMany({ where: { society_id: societies } });
    await prisma.user_roles.deleteMany({ where: { users_user_roles_user_idTousers: { society_id: societyId } } });
    for (const depth of [4, 3, 2, 1]) await prisma.locations.deleteMany({ where: { society_id: societies, location_levels: { depth } } });
    await prisma.societies.deleteMany({ where: { id: societies } });
    await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
    await app.close();
  });

  describe('fund transfers', () => {
    it('deposits cash at the bank with two ledger rows, for ledger.create only', async () => {
      const made = transferSchema.parse(
        (await transfer({ fromFundId: ids.general, fromAccount: 'cash', toFundId: ids.general, toAccount: 'bank', amount: '৩,০০০', memo: 'স্লিপ ৪৫' }).expect(201)).body,
      );
      transfers.deposit = made;
      expect(made).toMatchObject({ kind: 'deposit', amount: '3000.00', date: today(), memo: 'স্লিপ ৪৫', void: null, can: { void: false } });
      expect(await balanceOf(ids.general)).toEqual({ cash: '7000.00', bank: '3000.00', total: '10000.00' });
      const rows = await prisma.ledger_entries.findMany({ where: { source_type: 'transfer', source_id: made.id }, orderBy: { id: 'asc' } });
      expect(rows.map((row) => [row.direction, row.account, row.amount.toFixed(2)])).toEqual([
        ['out', 'cash', '3000.00'],
        ['in', 'bank', '3000.00'],
      ]);
      await transfer({ fromFundId: ids.general, fromAccount: 'cash', toFundId: ids.general, toAccount: 'bank', amount: '1' }, users.ledgerViewer).expect(403);
      await transfer({ fromFundId: ids.general, fromAccount: 'cash', toFundId: ids.general, toAccount: 'bank', amount: '1' }, users.nobody).expect(403);
      // Audited with the balance it saw.
      const audit = await prisma.audit_logs.findFirst({ where: { entity_type: 'fund_transfer', entity_id: made.id, action: 'create' } });
      expect(audit?.after_data).toMatchObject({ amount: '3000.00', balanceBefore: '10000.00' });
    });

    it('refuses moving more than the source holds, nothing at all, closed and unknown funds', async () => {
      const short = await transfer({ fromFundId: ids.general, fromAccount: 'bank', toFundId: ids.mosque, toAccount: 'cash', amount: '3000.01' }).expect(409);
      expect(short.body).toMatchObject({ code: 'fund_insufficient', details: { balance: '3000.00' } });
      const nothing = await transfer({ fromFundId: ids.general, fromAccount: 'cash', toFundId: ids.general, toAccount: 'cash', amount: '5' }).expect(400);
      expect(JSON.stringify(nothing.body)).toContain('transfer_nothing_moves');
      expect((await transfer({ fromFundId: ids.general, fromAccount: 'cash', toFundId: ids.closed, toAccount: 'cash', amount: '5' }).expect(409)).body.code).toBe('fund_closed');
      expect((await transfer({ fromFundId: ids.general, fromAccount: 'cash', toFundId: ids.otherFund, toAccount: 'cash', amount: '5' }).expect(400)).body.code).toBe('invalid_fund');
      await transfer({ fromFundId: ids.general, fromAccount: 'cash', toFundId: ids.mosque, toAccount: 'cash', amount: '0' }).expect(400);
      expect(await balanceOf(ids.general)).toEqual({ cash: '7000.00', bank: '3000.00', total: '10000.00' });
    });

    it('lets two transfers race for the same cash without overdrawing it', async () => {
      // 7,000 in the cash box; two transfers of 4,000 each: exactly one goes through.
      const results = await Promise.all([
        transfer({ fromFundId: ids.general, fromAccount: 'cash', toFundId: ids.mosque, toAccount: 'cash', amount: '4000' }),
        transfer({ fromFundId: ids.general, fromAccount: 'cash', toFundId: ids.mosque, toAccount: 'cash', amount: '4000' }),
      ]);
      expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
      expect(await balanceOf(ids.general)).toMatchObject({ cash: '3000.00' });
      expect(await balanceOf(ids.mosque)).toMatchObject({ cash: '4000.00' });
    });

    it('voids with ledger.approve only, once, and only while the destination still holds the money', async () => {
      const back = transferSchema.parse(
        (await transfer({ fromFundId: ids.mosque, fromAccount: 'cash', toFundId: ids.general, toAccount: 'cash', amount: '4000' }).expect(201)).body,
      );
      const first = transferListSchema.parse((await get(`/ledger/transfers?fundId=${ids.mosque}`).expect(200)).body).items.find((t) => t.id !== back.id)!;
      // The mosque fund now holds nothing: undoing the move into it would overdraw it.
      expect((await send('post', `/ledger/transfers/${first.id}/void`, users.ledgerApprover).send({ reason: 'ভুল' }).expect(409)).body.code).toBe('fund_insufficient');

      await send('post', `/ledger/transfers/${back.id}/void`, users.ledgerClerk).send({ reason: 'ভুল' }).expect(403);
      const voided = transferSchema.parse((await send('post', `/ledger/transfers/${back.id}/void`, users.ledgerApprover).send({ reason: 'ভুল এন্ট্রি' }).expect(200)).body);
      expect(voided.void).toMatchObject({ reason: 'ভুল এন্ট্রি' });
      expect(voided.can.void).toBe(false);
      expect((await send('post', `/ledger/transfers/${back.id}/void`, users.ledgerApprover).send({ reason: 'আবার' }).expect(409)).body.code).toBe('transfer_already_void');
      expect(await balanceOf(ids.mosque)).toMatchObject({ cash: '4000.00' });
      expect(await balanceOf(ids.general)).toMatchObject({ cash: '3000.00' });
      const reversals = await prisma.ledger_entries.count({ where: { source_type: 'transfer', source_id: back.id, reverses_id: { not: null } } });
      expect(reversals).toBe(2);

      // Undo the 4,000 into the mosque fund, so the reports below start from simple balances.
      await send('post', `/ledger/transfers/${first.id}/void`, users.ledgerApprover).send({ reason: 'ফেরত' }).expect(200);
      expect(await balanceOf(ids.general)).toEqual({ cash: '7000.00', bank: '3000.00', total: '10000.00' });
    });

    it('never changes or deletes a transfer row, and keeps other societies out', async () => {
      await expect(prisma.fund_transfers.update({ where: { id: transfers.deposit.id }, data: { amount: '1' } })).rejects.toThrow();
      await expect(prisma.fund_transfers.delete({ where: { id: transfers.deposit.id } })).rejects.toThrow();
      const other = await prisma.users.create({ data: { society_id: otherSocietyId, phone: randomPhone(), status: 'active' } });
      const foreign = await prisma.fund_transfers.create({
        data: { society_id: otherSocietyId, from_fund_id: ids.otherFund, from_account: 'cash', to_fund_id: ids.otherFund, to_account: 'bank', amount: '1', transfer_date: day(today()), created_by: other.id },
      });
      await get(`/ledger/transfers/${foreign.id}`).expect(404);
      await send('post', `/ledger/transfers/${foreign.id}/void`).send({ reason: 'x' }).expect(404);
      expect(transferListSchema.parse((await get('/ledger/transfers').expect(200)).body).items.every((t) => t.id !== foreign.id)).toBe(true);
      await send('delete', `/ledger/transfers/${transfers.deposit.id}`).expect(404);
    });
  });

  describe('the statement', () => {
    it('starts from the balance before the range and runs a balance down the rows', async () => {
      const statement = ledgerStatementSchema.parse((await get(`/ledger?fundId=${ids.general}&account=cash`, users.ledgerViewer).expect(200)).body);
      expect(statement).toMatchObject({ from: `${today().slice(0, 7)}-01`, to: today(), opening: '10000.00', closing: '7000.00' });
      expect(addMoney(statement.opening, statement.totalIn)).toBe(addMoney(statement.closing, statement.totalOut));
      expect(statement.items.at(-1)!.balance).toBe(statement.closing);
      expect(statement.items[0]).toMatchObject({ direction: 'out', amount: '3000.00', balance: '7000.00', source: 'transfer', reference: 'স্লিপ ৪৫' });
      expect(statement.items[0]!.link).toEqual({ kind: 'transfer', id: transfers.deposit.id });
      expect(statement.items.some((row) => row.reversal)).toBe(true);
      expect(statement.items.filter((row) => row.reversed).length).toBe(statement.items.filter((row) => row.reversal).length);

      // A later page carries the same running balance.
      const page2 = ledgerStatementSchema.parse((await get(`/ledger?fundId=${ids.general}&account=cash&pageSize=1&page=2`).expect(200)).body);
      expect(page2.items).toHaveLength(1);
      expect(page2.items[0]!.balance).toBe(statement.items[1]!.balance);

      const all = ledgerStatementSchema.parse((await get('/ledger?from=2025-12-01').expect(200)).body);
      expect(all.opening).toBe('0.00');
      expect(all.items[0]).toMatchObject({ source: 'opening', link: { kind: 'fund', id: ids.general } });
      expect(all.closing).toBe('10000.00');
    });

    it('refuses a backwards range, other societies’ funds and callers without ledger.view', async () => {
      expect((await get(`/ledger?from=${today()}&to=2026-01-01`).expect(400)).body.code).toBe('invalid_range');
      await get(`/ledger?fundId=${ids.otherFund}`).expect(404);
      await get('/ledger', users.clerkC).expect(403);
      await get('/ledger?account=safe').expect(400);
    });
  });

  describe('reports', () => {
    it('records the day’s money for the reports', async () => {
      // C1: service 1,000 then a fine of 200 on one bill; C2: service 1,000; D1: service 1,500 and a mosque fee of 300.
      bills.c1 = await bill(ids.c1, [
        [ids.service, '1000'],
        [ids.fine, '200'],
      ]);
      bills.c2 = await bill(ids.c2, [[ids.service, '1000']]);
      bills.d1 = await bill(ids.d1, [[ids.service, '1500']]);
      bills.d1Mosque = await bill(ids.d1, [[ids.mosqueFee, '300']]);

      // C1 pays in two parts: 600 (service), then 500 (the rest of the service, then 100 of the fine).
      await pay(ids.c1, [bills.c1.id], '600', ids.rahim, users.clerkC);
      await pay(ids.c1, [bills.c1.id], '500', ids.rahim, users.clerkC);
      // C2 pays and the receipt is voided.
      const wrong = await pay(ids.c2, [bills.c2.id], '1000', ids.rahim, users.clerkC);
      await send('post', `/payments/${wrong.id}/void`).send({ reason: 'ভুল ইউনিট' }).expect(200);
      await pay(ids.d1, [bills.d1.id, bills.d1Mosque.id], '1800', ids.karim);
      await send('post', '/donations').send({ donor: { kind: 'anonymous' }, amount: '1000', purpose: 'ঈদ' }).expect(201);
      // One repair paid (700), one paid then voided (250).
      await expense('700');
      const undone = await expense('250');
      await send('post', `/expenses/${undone.id}/void`).send({ reason: 'ফেরত' }).expect(200);
      const year = fiscalYearOf(today(), 7).label;
      await send('put', '/budgets').send({ year, lines: [{ headId: ids.repairs, amount: '1000' }] }).expect(200);
    });

    it('collection by area: billed against paid per block, within the caller’s area', async () => {
      const report = collectionReportSchema.parse((await get('/reports/collection').expect(200)).body);
      expect(report.parent).toEqual({ id: ids.sector, name: 'সেক্টর ১৫' });
      expect(report.areas.map((area) => [area.name, area.bills, area.billed, area.collected, area.percent])).toEqual([
        // Natural Bangla order: ড before স.
        ['ব্লক ডি', 2, '1800.00', '1800.00', 100],
        ['ব্লক সি', 2, '2200.00', '1100.00', 50],
      ]);
      expect(report.totals).toMatchObject({ bills: 4, billed: '4000.00', collected: '2900.00', outstanding: '1100.00', percent: 72 });

      const scoped = collectionReportSchema.parse((await get('/reports/collection', users.clerkC).expect(200)).body);
      expect(scoped.areas.map((area) => area.name)).toEqual(['ব্লক সি']);
      expect(scoped.totals).toMatchObject({ billed: '2200.00', collected: '1100.00' });
      expect(scoped.crumbs).toEqual([{ id: ids.sector, name: 'সেক্টর ১৫', open: true }]);
      await get(`/reports/collection?parentId=${ids.blockD}`, users.clerkC).expect(404);

      const road = collectionReportSchema.parse((await get(`/reports/collection?parentId=${ids.roadC1}`, users.clerkC).expect(200)).body);
      expect(road.areas.map((area) => [area.name, area.isUnit, area.collected])).toEqual([
        ['সি-১', true, '1100.00'],
        ['সি-২', true, '0.00'],
      ]);
      // Before any bill of this month.
      const empty = collectionReportSchema.parse((await get('/reports/collection?from=2025-01-01&to=2025-01-31').expect(200)).body);
      expect(empty.totals).toMatchObject({ bills: 0, billed: '0.00', percent: 0 });
      await get('/reports/collection', users.ledgerViewer).expect(403);
    });

    it('income and expenditure: receipts split by charge type in line order, donations, expenses against the budget', async () => {
      const report = incomeReportSchema.parse((await get('/reports/income').expect(200)).body);
      expect(report.year).toBe(fiscalYearOf(today(), 7).label);
      expect(report.years).toContain(fiscalYearOf('2026-01-01', 7).label);
      const charges = Object.fromEntries(report.income.charges.map((line) => [line.chargeType.nameBn, [line.billed, line.collected]]));
      expect(charges).toEqual({
        'সার্ভিস চার্জ': ['3500.00', '2500.00'],
        জরিমানা: ['200.00', '100.00'],
        'মসজিদ চাঁদা': ['300.00', '300.00'],
      });
      expect(report.income).toMatchObject({ donations: '1000.00', billed: '4000.00', total: '3900.00' });
      expect(report.expenditure.heads).toEqual([
        expect.objectContaining({ head: expect.objectContaining({ id: ids.repairs }), budget: '1000.00', spent: '700.00', remaining: '300.00', percent: 70, over: false }),
      ]);
      expect(report.expenditure).toMatchObject({ budget: '1000.00', total: '700.00' });
      expect(report.surplus).toBe('3200.00');

      // It agrees with the ledger: everything in the year except opening balances and transfers.
      const rows = await prisma.ledger_entries.groupBy({
        by: ['direction'],
        where: { society_id: societyId, source_type: { notIn: ['opening', 'transfer'] }, entry_date: { gte: day(report.start), lte: day(report.end) } },
        _sum: { amount: true },
      });
      const sum = (direction: string) => rows.find((row) => row.direction === direction)?._sum.amount?.toFixed(2) ?? '0.00';
      expect(subtractMoney(sum('in'), sum('out'))).toBe(report.surplus);

      // One fund: no budgets (they are society-wide).
      const mosque = incomeReportSchema.parse((await get(`/reports/income?fundId=${ids.mosque}`, users.ledgerViewer).expect(200)).body);
      expect(mosque.income.charges.map((line) => [line.chargeType.nameBn, line.collected])).toEqual([['মসজিদ চাঁদা', '300.00']]);
      expect(mosque.expenditure).toMatchObject({ budget: null, total: '0.00' });
      // Without budgets.view the budget column stays empty.
      const plain = incomeReportSchema.parse((await get('/reports/income', users.ledgerViewer).expect(200)).body);
      expect(plain.expenditure.heads[0]).toMatchObject({ budget: null, spent: '700.00' });

      expect((await get('/reports/income?year=2026-28').expect(400)).body.code).toBe('invalid_year');
      await get(`/reports/income?fundId=${ids.otherFund}`).expect(404);
      await get('/reports/income', users.clerkC).expect(403);
    });

    it('the day book: every receipt, donation, expense and transfer of the day, by section permission', async () => {
      const book = dayBookSchema.parse((await get('/reports/day-book').expect(200)).body);
      expect(book.date).toBe(today());
      expect(book.receipts!.items.map((row) => [row.amount, row.void])).toEqual([
        ['600.00', false],
        ['500.00', false],
        ['1000.00', true],
        ['1800.00', false],
      ]);
      expect(book.receipts).toMatchObject({ total: '2900.00' });
      expect(book.receipts!.items[0]!.unit).toEqual(['ব্লক সি', 'রোড সি-১', 'সি-১']);
      expect(book.donations).toMatchObject({ total: '1000.00' });
      expect(book.donations!.items[0]).toMatchObject({ payer: null, purpose: 'ঈদ' });
      expect(book.expenses!.items.map((row) => [row.amount, row.void])).toEqual([
        ['700.00', false],
        ['250.00', true],
      ]);
      expect(book.expenses!.total).toBe('700.00');
      expect(book.transfers!.items.length).toBe(3);
      expect(addMoney(...book.byCollector.map((row) => row.amount))).toBe('3900.00');
      // Each fund's day closes at what the fund holds now.
      const general = book.funds!.find((row) => row.fund.id === ids.general && row.account === 'cash')!;
      expect(general.opening).toBe('10000.00');
      expect(general.closing).toBe((await balanceOf(ids.general)).cash);
      expect(subtractMoney(addMoney(general.opening, general.in), general.out)).toBe(general.closing);

      // A Block C collector sees only Block C receipts, and no other section.
      const scoped = dayBookSchema.parse((await get('/reports/day-book', users.clerkC).expect(200)).body);
      expect(scoped.receipts!.items.map((row) => row.amount)).toEqual(['600.00', '500.00', '1000.00']);
      expect(scoped).toMatchObject({ donations: null, expenses: null, transfers: null, funds: null });
      expect(scoped.byCollector).toEqual([expect.objectContaining({ collector: expect.objectContaining({ id: users.clerkC.id }), receipts: 2, amount: '1100.00' })]);

      const yesterday = dayBookSchema.parse((await get(`/reports/day-book?date=${daysAgo(1)}`).expect(200)).body);
      expect(yesterday.receipts!.items).toEqual([]);
      await get('/reports/day-book', users.nobody).expect(403);
      await get('/reports/day-book?date=2026-13-01').expect(400);
    });

    it('arrears: units with overdue bills, aged, within the caller’s area', async () => {
      // C1 owes 100 of a bill overdue 10 days; C2 owes 1,000 overdue 45 days and 400 overdue 120 days.
      const old = await bill(ids.c2, [[ids.service, '400']]);
      const age = (id: string, days: number) => prisma.invoices.update({ where: { id }, data: { issue_date: day(daysAgo(days + 5)), due_date: day(daysAgo(days)) } });
      await age(bills.c1.id, 10);
      await age(bills.c2.id, 45);
      await age(old.id, 120);
      await bill(ids.c1, [[ids.service, '50']]); // not due yet

      const report = arrearsReportSchema.parse((await get('/reports/arrears').expect(200)).body);
      expect(report.rows.map((row) => [row.unit, row.bills, row.owed, row.buckets.d30, row.buckets.d90, row.buckets.older])).toEqual([
        ['সি-১', 1, '100.00', '100.00', '0.00', '0.00'],
        ['সি-২', 2, '1400.00', '0.00', '1000.00', '400.00'],
      ]);
      expect(report.rows[1]).toMatchObject({ address: ['ব্লক সি', 'রোড সি-১'], oldestDue: daysAgo(120), billTo: { name: 'রহিম উদ্দিন' } });
      expect(report.totals).toEqual({ units: 2, bills: 3, owed: '1500.00', d30: '100.00', d90: '1000.00', older: '400.00' });
      expect(report.children.map((child) => child.name)).toEqual(['ব্লক ডি', 'ব্লক সি']);
      expect(report.truncated).toBe(false);

      const road = arrearsReportSchema.parse((await get(`/reports/arrears?locationId=${ids.roadC1}`, users.clerkC).expect(200)).body);
      expect(road.rows.map((row) => row.unit)).toEqual(['সি-১', 'সি-২']);
      expect(road.crumbs.map((crumb) => crumb.name)).toEqual(['সেক্টর ১৫', 'ব্লক সি', 'রোড সি-১']);
      const blockD = arrearsReportSchema.parse((await get(`/reports/arrears?locationId=${ids.blockD}`).expect(200)).body);
      expect(blockD.rows).toEqual([]);
      const outside = arrearsReportSchema.parse((await get('/reports/arrears', users.viewerD).expect(200)).body);
      expect(outside.rows).toEqual([]);
      expect(outside.children.map((child) => child.name)).toEqual(['ব্লক ডি']);
      await get(`/reports/arrears?locationId=${ids.blockC}`, users.viewerD).expect(404);
    });

    it('CSV files: UTF-8 with a byte order mark, behind each module’s export', async () => {
      const csv = await get('/reports/arrears/csv', users.clerkC).buffer(true).parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      }).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.headers['content-disposition']).toBe(`attachment; filename="arrears-${today()}.csv"`);
      const body = csv.body as Buffer;
      expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const lines = body.toString('utf8').slice(1).trimEnd().split('\r\n');
      expect(lines[0]!.startsWith('ইউনিট,')).toBe(true);
      expect(lines).toHaveLength(4);
      expect(lines.at(-1)).toContain('1500.00');

      const english = await get('/reports/collection/csv?lang=en', users.clerkC).expect(200);
      expect(english.text.replace(/^﻿/, '').split('\r\n')[0]).toBe('Area,Bills,Billed,Collected,Outstanding,Collected %');
      const income = await get('/reports/income/csv', users.exporter).expect(200);
      expect(income.text).toContain('3200.00');
      // The day book file holds only the sections the caller may export.
      const book = await get('/reports/day-book/csv?lang=en', users.exporter).expect(200);
      expect(book.text).toContain('Bill receipts');
      expect(book.text).toContain('Transfers');
      expect(book.text).not.toContain('Donations');

      await get('/reports/arrears/csv', users.viewerD).expect(403);
      await get('/reports/income/csv', users.ledgerViewer).expect(403);
      await get('/reports/day-book/csv', users.clerkC).expect(403);
    });
  });

  describe('the audit log viewer', () => {
    it('lists who did what, newest first, with filters, for audit.view only', async () => {
      const list = auditListSchema.parse((await get('/audit?entityType=fund_transfer', users.auditor).expect(200)).body);
      expect(list.items.length).toBeGreaterThanOrEqual(5);
      expect(list.items[0]!.at >= list.items.at(-1)!.at).toBe(true);
      expect(list.items.every((row) => row.entityType === 'fund_transfer')).toBe(true);

      const voids = auditListSchema.parse((await get(`/audit?action=void&userId=${users.ledgerApprover.id}`, users.auditor).expect(200)).body);
      expect(voids.items).toHaveLength(2);
      expect(voids.items[0]).toMatchObject({ user: { id: users.ledgerApprover.id }, action: 'void', after: { reason: 'ফেরত' } });

      const one = auditListSchema.parse((await get(`/audit?entityId=${transfers.deposit.id}`, users.auditor).expect(200)).body);
      expect(one.items.map((row) => row.action)).toEqual(['create']);
      const old = auditListSchema.parse((await get('/audit?to=2025-01-01', users.auditor).expect(200)).body);
      expect(old.total).toBe(0);
      const todays = auditListSchema.parse((await get(`/audit?from=${today()}&to=${today()}&pageSize=1`, users.auditor).expect(200)).body);
      expect(todays.total).toBeGreaterThan(10);

      const options = auditOptionsSchema.parse((await get('/audit/options', users.auditor).expect(200)).body);
      expect(options.entityTypes).toEqual(expect.arrayContaining(['fund_transfer', 'expense']));
      expect(options.actions).toEqual(expect.arrayContaining(['create', 'void']));
      expect(options.users.map((user) => user.id)).toContain(users.ledgerApprover.id);

      await get('/audit', users.ledgerViewer).expect(403);
      await get('/audit/options', users.nobody).expect(403);
      await send('delete', '/audit').expect(404);
      await send('post', '/audit').expect(404);
    });
  });

  it('keeps every fund’s ledger in line with receipts, donations, expenses and transfers', async () => {
    for (const fundId of [ids.general, ids.mosque]) {
      const rows = await prisma.ledger_entries.groupBy({
        by: ['direction'],
        where: { fund_id: fundId, source_type: { not: 'opening' } },
        _sum: { amount: true },
      });
      const sum = (direction: string) => rows.find((row) => row.direction === direction)?._sum.amount?.toFixed(2) ?? '0.00';
      const [records] = await prisma.$queryRaw<{ amount: string }[]>`
        SELECT (
          coalesce((SELECT sum(pa.amount) FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id JOIN invoices i ON i.id = pa.invoice_id
                    WHERE i.fund_id = ${fundId}::uuid AND p.voided_at IS NULL), 0)
          + coalesce((SELECT sum(d.amount) FROM donations d JOIN payments p ON p.id = d.payment_id WHERE d.fund_id = ${fundId}::uuid AND p.voided_at IS NULL), 0)
          - coalesce((SELECT sum(amount) FROM expenses WHERE fund_id = ${fundId}::uuid AND status = 'paid'), 0)
          + coalesce((SELECT sum(amount) FROM fund_transfers WHERE to_fund_id = ${fundId}::uuid AND voided_at IS NULL), 0)
          - coalesce((SELECT sum(amount) FROM fund_transfers WHERE from_fund_id = ${fundId}::uuid AND voided_at IS NULL), 0)
        )::numeric(16,2)::text AS amount`;
      expect(subtractMoney(sum('in'), sum('out'))).toBe(records!.amount);
    }
  });
});
