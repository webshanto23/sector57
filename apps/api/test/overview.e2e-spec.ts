import { INestApplication } from '@nestjs/common';
import {
  addMonths,
  AUTH_COOKIES,
  CSRF_HEADER,
  handoverSchema,
  invoiceDetailSchema,
  overviewSchema,
  paymentDetailSchema,
  type InvoiceDetail,
  type Overview,
  type PaymentDetail,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { isoDate, todayDate } from './../src/common/dates.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-ovw-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const today = () => isoDate(todayDate());
const daysAgo = (n: number) => isoDate(new Date(todayDate().getTime() - n * 86_400_000));
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/** Noon in Dhaka on the 15th of last month. */
const lastMonthNoon = () => new Date(`${addMonths(today(), -1).slice(0, 8)}15T12:00:00+06:00`);

type Caller = { cookie: string; id: string };

/**
 * The dashboard overview, in a society of its own (payments write ledger rows). Sector 15
 * holds Block C (road C-1 with flats C1, C2 and an inactive C3) and Block D (flat D1).
 * Amounts carry paisa so any float rounding would show.
 */
describe('Dashboard overview (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let otherSocietyId: string;
  const server = () => app.getHttpServer();
  const users = {} as Record<'admin' | 'clerkC' | 'approverD' | 'requester' | 'nobody', Caller>;
  const ids = {} as Record<'general' | 'sector' | 'blockC' | 'blockD' | 'roadC1' | 'c1' | 'c2' | 'c3' | 'd1' | 'rahim' | 'karim' | 'service' | 'repairs', string>;
  const forms = {} as Record<'c1' | 'd1' | 'none' | 'closed', string>;
  let handoverId: string;

  async function makeUser(permissions: string[], scope: string | null = null): Promise<Caller> {
    const user = await prisma.users.create({ data: { society_id: societyId, phone: randomPhone(), status: 'active' } });
    if (permissions.length) await grant(user.id, permissions, scope);
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId, sessionId: randomUUID() });
    return { cookie: `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}`, id: user.id };
  }

  async function grant(userId: string, permissions: string[], scope: string | null) {
    const rows = await prisma.permissions.findMany();
    const role = await prisma.roles.create({ data: { society_id: societyId, name: `${MARK}-${randomUUID()}` } });
    await prisma.role_permissions.createMany({
      data: permissions.map((name) => ({ role_id: role.id, permission_id: rows.find((p) => `${p.module}:${p.action}` === name)!.id })),
    });
    await prisma.user_roles.create({ data: { user_id: userId, role_id: role.id, scope_location_id: scope } });
  }

  const send = (method: 'post', url: string, caller = users.admin) =>
    request(server())[method](url).set('Cookie', caller.cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const overview = async (caller: Caller, on = app): Promise<Overview> =>
    overviewSchema.parse((await request(on.getHttpServer()).get('/overview').set('Cookie', caller.cookie).expect(200)).body);

  const bill = async (unitId: string, amount: string): Promise<InvoiceDetail> =>
    invoiceDetailSchema.parse(
      (await send('post', '/invoices').send({ unitId, dueDate: daysAgo(-15), lines: [{ chargeTypeId: ids.service, amount }] }).expect(201)).body,
    );
  const pay = async (unitId: string, invoiceIds: string[], amount: string, payer: string, caller = users.admin): Promise<PaymentDetail> =>
    paymentDetailSchema.parse(
      (await send('post', '/payments', caller).send({ unitId, invoiceIds, amount, payer: { kind: 'person', id: payer } }).expect(201)).body,
    );

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { PrismaPg, PrismaClient } = await import('@s57/db');
    const setup = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    societyId = (await setup.societies.create({ data: { name_bn: `সমিতি ${MARK}`, slug: MARK } })).id;
    await setup.$disconnect();

    // Live figures for every test but the one about the cache.
    app = await createTestApp([], { DEFAULT_SOCIETY_SLUG: MARK, OVERVIEW_CACHE_SECONDS: '0' });
    prisma = app.get(PrismaService);

    ids.general = (await prisma.funds.create({ data: { society_id: societyId, name_bn: 'সাধারণ তহবিল', is_default: true } })).id;
    ids.service = (await prisma.charge_types.create({ data: { society_id: societyId, name_bn: 'সার্ভিস চার্জ', kind: 'due', fund_id: ids.general } })).id;
    ids.repairs = (await prisma.expense_heads.create({ data: { society_id: societyId, name_bn: 'মেরামত' } })).id;

    const level = (depth: number, name_bn: string, is_unit_level = false) =>
      prisma.location_levels.create({ data: { society_id: societyId, depth, name_bn, is_unit_level } }).then((r) => r.id);
    const sectorLevel = await level(1, 'সেক্টর');
    const blockLevel = await level(2, 'ব্লক');
    const roadLevel = await level(3, 'রোড');
    const flatLevel = await level(4, 'ইউনিট', true);
    const place = async (levelId: string, name: string, parent: { id: string; path: string } | null, is_active = true) => {
      const id = randomUUID();
      const path = `${parent?.path ?? '/'}${id}/`;
      await prisma.locations.create({ data: { id, society_id: societyId, level_id: levelId, parent_id: parent?.id ?? null, name, path, is_active } });
      return { id, path };
    };
    const unit = async (name: string, parent: { id: string; path: string }, occupancy: string, active = true) => {
      const row = await place(flatLevel, name, parent, active);
      await prisma.units.create({ data: { location_id: row.id, society_id: societyId, unit_type: 'residential', occupancy } });
      return row.id;
    };
    const sector = await place(sectorLevel, 'সেক্টর ১৫', null);
    const c = await place(blockLevel, 'ব্লক সি', sector);
    const d = await place(blockLevel, 'ব্লক ডি', sector);
    const road = await place(roadLevel, 'রোড সি-১', c);
    Object.assign(ids, { sector: sector.id, blockC: c.id, blockD: d.id, roadC1: road.id });
    ids.c1 = await unit('সি-১', road, 'owner_occupied');
    ids.c2 = await unit('সি-২', road, 'vacant');
    ids.c3 = await unit('সি-৩', road, 'vacant', false);
    ids.d1 = await unit('ডি-১', d, 'rented');

    const person = (full_name: string) => prisma.persons.create({ data: { society_id: societyId, full_name, phone: randomPhone() } }).then((r) => r.id);
    ids.rahim = await person('রহিম উদ্দিন');
    ids.karim = await person('করিম মিয়া');
    const own = (location_id: string, person_id: string) =>
      prisma.ownerships.create({ data: { society_id: societyId, location_id, person_id, start_date: day('2020-01-01') } });
    await own(ids.c1, ids.rahim);
    await own(ids.c2, ids.rahim);
    await own(ids.d1, ids.karim);

    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: `${MARK}-other` } })).id;

    const everything = (await prisma.permissions.findMany()).map((p) => `${p.module}:${p.action}`);
    users.admin = await makeUser(everything);
    users.clerkC = await makeUser(['payments:view', 'payments:create', 'billing:view'], ids.blockC);
    users.approverD = await makeUser(['payments:view', 'payments:approve', 'forms:view', 'forms:approve', 'units:view'], ids.blockD);
    users.requester = await makeUser(['expenses:view', 'expenses:create']);
    users.nobody = await makeUser([]);

    // This month's bills: C1 1000.10, C2 500.20, D1 700.30; a voided one never counts.
    const c1 = await bill(ids.c1, '1000.10');
    const c2 = await bill(ids.c2, '500.20');
    const d1 = await bill(ids.d1, '700.30');
    const voided = await bill(ids.d1, '99.99');
    await send('post', `/invoices/${voided.id}/void`).send({ reason: 'ভুল' }).expect(200);
    // Last month: C2 250.25, of which 50.05 was paid then.
    const old = await bill(ids.c2, '250.25');
    await prisma.invoices.update({ where: { id: old.id }, data: { issue_date: day(isoDate(lastMonthNoon())) } });
    const oldPayment = await pay(ids.c2, [old.id], '50.05', ids.rahim);
    await prisma.payments.update({ where: { id: oldPayment.id }, data: { received_at: lastMonthNoon() } });

    // Collected this month: C1 1000.10 by the Block C clerk, D1 300.15; a void and a donation don't count.
    await pay(ids.c1, [c1.id], '1000.10', ids.rahim, users.clerkC);
    await pay(ids.d1, [d1.id], '300.15', ids.karim);
    const wrong = await pay(ids.c2, [c2.id], '200.05', ids.rahim);
    await send('post', `/payments/${wrong.id}/void`).send({ reason: 'ভুল ইউনিট' }).expect(200);
    await send('post', '/donations').send({ donor: { kind: 'anonymous' }, amount: '5000' }).expect(201);
    // Overdue: what is left on C2 (500.20) and D1 (700.30 − 300.15).
    await prisma.invoices.updateMany({ where: { id: { in: [c2.id, d1.id] } }, data: { due_date: day(daysAgo(10)) } });

    // The Block C clerk hands over; a Block D approver can't confirm it.
    handoverId = handoverSchema.parse((await send('post', '/handovers', users.clerkC).expect(201)).body).id;

    // Expenses: one by the requester; the admin's own request never waits for the admin.
    await send('post', '/expenses', users.requester).send({ headId: ids.repairs, description: 'পাম্প মেরামত', amount: '86000.50', spentOn: today() }).expect(201);
    await send('post', '/expenses').send({ headId: ids.repairs, description: 'নিজের খরচ', amount: '10', spentOn: today() }).expect(201);

    const form = (location_id: string | null, status: string, society_id = societyId) =>
      prisma.form_submissions
        .create({ data: { society_id, form_key: 'membership', data: {}, reference: `OV-${randomUUID().slice(0, 8)}`, location_id, status } })
        .then((r) => r.id);
    forms.c1 = await form(ids.c1, 'new');
    forms.d1 = await form(ids.d1, 'in_review');
    forms.none = await form(null, 'new');
    forms.closed = await form(ids.c2, 'approved');
    await form(null, 'new', otherSocietyId);
  });

  afterAll(async () => {
    if (!prisma) return;
    const societies = { in: [societyId, otherSocietyId] };
    await prisma.form_submissions.deleteMany({ where: { society_id: societies } });
    await prisma.payment_allocations.deleteMany({ where: { payments: { society_id: societies } } });
    await prisma.donations.deleteMany({ where: { society_id: societies } });
    await prisma.payments.deleteMany({ where: { society_id: societies } });
    await prisma.cash_handovers.deleteMany({ where: { society_id: societies } });
    await prisma.invoices.deleteMany({ where: { society_id: societies } });
    await prisma.expenses.deleteMany({ where: { society_id: societies } });
    await prisma.expense_heads.deleteMany({ where: { society_id: societies } });
    await prisma.ownerships.deleteMany({ where: { society_id: societies } });
    await prisma.user_roles.deleteMany({ where: { users_user_roles_user_idTousers: { society_id: societyId } } });
    for (const depth of [4, 3, 2, 1]) await prisma.locations.deleteMany({ where: { society_id: societies, location_levels: { depth } } });
    await prisma.societies.deleteMany({ where: { id: societies } });
    await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
    await app.close();
  });

  it('needs a login', async () => {
    await request(server()).get('/overview').expect(401);
  });

  it('sums the whole society for a full admin', async () => {
    const view = await overview(users.admin);
    expect(view.asOf).toBe(today());
    expect(view.collected).toEqual({ amount: '1300.25', billed: '2200.60', percent: 59 });
    expect(view.arrears).toEqual({ owed: '900.35', units: 2, bills: 2 });
    expect(view.occupancy).toEqual({ units: 3, occupied: 2, vacant: 1 });
    expect(view.forms).toEqual({ open: 3 });

    expect(view.months).toHaveLength(6);
    expect(view.months!.at(-1)).toEqual({ month: today().slice(0, 7), billed: '2200.60', collected: '1300.25' });
    expect(view.months!.at(-2)).toEqual({ month: addMonths(today(), -1).slice(0, 7), billed: '250.25', collected: '50.05' });
    expect(view.months!.slice(0, 4).every((row) => row.billed === '0.00' && row.collected === '0.00')).toBe(true);

    expect(view.areas).toEqual({
      parent: { id: ids.sector, name: 'সেক্টর ১৫' },
      items: [
        // Bangla order: ড before স.
        { id: ids.blockD, name: 'ব্লক ডি', billed: '700.30', collected: '300.15', percent: 42 },
        { id: ids.blockC, name: 'ব্লক সি', billed: '1500.30', collected: '1000.10', percent: 66 },
      ],
    });
  });

  it('agrees with the rows it is built from', async () => {
    const view = await overview(users.admin);
    const start = new Date(`${today().slice(0, 7)}-01T00:00:00+06:00`);
    const receipts = await prisma.payments.aggregate({
      where: { society_id: societyId, voided_at: null, donations: null, received_at: { gte: start } },
      _sum: { amount: true },
    });
    expect(view.collected!.amount).toBe(receipts._sum.amount!.toFixed(2));
    const billed = await prisma.invoices.aggregate({
      where: { society_id: societyId, status: { not: 'void' }, kind: { not: 'opening' }, issue_date: { gte: day(`${today().slice(0, 7)}-01`) } },
      _sum: { total: true },
    });
    expect(view.collected!.billed).toBe(billed._sum.total!.toFixed(2));
  });

  it('lists what waits for the admin, never their own request', async () => {
    const { approvals } = await overview(users.admin);
    expect(approvals!.expenses).toMatchObject({ count: 1, items: [{ description: 'পাম্প মেরামত', amount: '86000.50', requestedBy: { id: users.requester.id } }] });
    expect(approvals!.handovers).toMatchObject({ count: 1, items: [{ id: handoverId, amount: '1000.10', payments: 1, collector: { id: users.clerkC.id } }] });
    expect(approvals!.forms!.count).toBe(3);
    expect(approvals!.forms!.items.map((item) => item.id).sort()).toEqual([forms.c1, forms.d1, forms.none].sort());
    expect(approvals!.forms!.items.find((item) => item.id === forms.c1)!.place).toBe('সি-১');
  });

  it('keeps a Block C clerk to Block C, opening down to its roads and flats', async () => {
    const view = await overview(users.clerkC);
    expect(view.collected).toEqual({ amount: '1000.10', billed: '1500.30', percent: 66 });
    expect(view.arrears).toEqual({ owed: '500.20', units: 1, bills: 1 });
    expect(view.months!.at(-2)).toMatchObject({ billed: '250.25', collected: '50.05' });
    expect(view.areas).toEqual({
      parent: { id: ids.roadC1, name: 'রোড সি-১' },
      items: [
        { id: ids.c1, name: 'সি-১', billed: '1000.10', collected: '1000.10', percent: 100 },
        { id: ids.c2, name: 'সি-২', billed: '500.20', collected: '0.00', percent: 0 },
      ],
    });
    expect([view.occupancy, view.forms, view.approvals]).toEqual([null, null, null]);
  });

  it('keeps a Block D approver to Block D, with only the cards they hold', async () => {
    const view = await overview(users.approverD);
    expect(view.collected).toEqual({ amount: '300.15', billed: null, percent: null });
    expect(view.months!.at(-1)).toMatchObject({ billed: null, collected: '300.15' });
    expect(view.occupancy).toEqual({ units: 1, occupied: 1, vacant: 0 });
    expect(view.forms).toEqual({ open: 1 });
    expect([view.arrears, view.areas]).toEqual([null, null]);
    // The Block C handover and the form with no place are not theirs to decide.
    expect(view.approvals).toMatchObject({ expenses: null, handovers: { count: 0, items: [] }, forms: { count: 1, items: [{ id: forms.d1 }] } });
  });

  it('gives a user without grants nothing but the date', async () => {
    const view = await overview(users.nobody);
    expect(view).toMatchObject({ collected: null, arrears: null, occupancy: null, forms: null, months: null, areas: null, approvals: null });
  });

  it('keeps figures for a short while, but never past a change of access', async () => {
    const cached = await createTestApp([], { DEFAULT_SOCIETY_SLUG: MARK });
    try {
      expect((await overview(users.approverD, cached)).forms).toEqual({ open: 1 });
      const extra = await prisma.form_submissions.create({
        data: { society_id: societyId, form_key: 'membership', data: {}, reference: `OV-${randomUUID().slice(0, 8)}`, location_id: ids.d1 },
      });
      expect((await overview(users.approverD, cached)).forms).toEqual({ open: 1 });
      expect((await overview(users.approverD)).forms).toEqual({ open: 2 });

      await grant(users.approverD.id, ['billing:view'], ids.blockD);
      const after = await overview(users.approverD, cached);
      expect(after.forms).toEqual({ open: 2 });
      expect(after.arrears).toEqual({ owed: '400.15', units: 1, bills: 1 });
      await prisma.form_submissions.delete({ where: { id: extra.id } });
    } finally {
      await cached.close();
    }
  });
});
