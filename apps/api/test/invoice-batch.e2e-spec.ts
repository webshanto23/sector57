import { INestApplication } from '@nestjs/common';
import { Prisma } from '@s57/db';
import { AUTH_COOKIES, billableUnitsSchema, CSRF_HEADER, invoiceBatchCheckSchema, invoiceBatchResultSchema, invoicePrintSchema } from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { isoDate, todayDate } from './../src/common/dates.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-batch-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `016${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const inDays = (days: number) => isoDate(new Date(todayDate().getTime() + days * 86_400_000));
const thisMonth = () => isoDate(todayDate()).slice(0, 7);

/**
 * Billing several units at once (Step 27), in a society of its own. Block C: C-1 owned by
 * Rahim, C-2 owned by nobody; Block D: D-1 owned by Karim. Service charge pays into the
 * general fund, mosque into a fund of its own.
 */
describe('Bills for several units (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  const server = () => app.getHttpServer();
  const users = {} as Record<'admin' | 'viewer' | 'blockC', string>;
  const ids = {} as Record<'c1' | 'c2' | 'd1' | 'rahim' | 'karim' | 'service' | 'mosque' | 'generalFund' | 'mosqueFund', string>;

  async function makeUser(permissions: string[], scope: string | null = null) {
    const rows = await prisma.permissions.findMany();
    const role = await prisma.roles.create({ data: { society_id: societyId, name: `${MARK}-${randomUUID()}` } });
    await prisma.role_permissions.createMany({
      data: permissions.map((name) => ({ role_id: role.id, permission_id: rows.find((p) => `${p.module}:${p.action}` === name)!.id })),
    });
    const user = await prisma.users.create({ data: { society_id: societyId, phone: randomPhone(), status: 'active' } });
    await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.id, scope_location_id: scope } });
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId, sessionId: randomUUID() });
    return `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}`;
  }

  const post = (url: string, cookie = users.admin) => request(server()).post(url).set('Cookie', cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const get = (url: string, cookie = users.admin) => request(server()).get(url).set('Cookie', cookie);
  const line = (chargeTypeId: string, amount: string) => ({ chargeTypeId, amount });
  const batch = (units: { unitId: string; lines: object[] }[], extra: object = {}) => ({ dueDate: inDays(15), units, ...extra });
  const billCount = () => prisma.invoices.count({ where: { society_id: societyId } });

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { PrismaPg, PrismaClient } = await import('@s57/db');
    const setup = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    societyId = (await setup.societies.create({ data: { name_bn: `সমিতি ${MARK}`, slug: MARK } })).id;
    await setup.$disconnect();

    app = await createTestApp([], { DEFAULT_SOCIETY_SLUG: MARK });
    prisma = app.get(PrismaService);

    ids.generalFund = (await prisma.funds.create({ data: { society_id: societyId, name_bn: 'সাধারণ তহবিল', is_default: true } })).id;
    ids.mosqueFund = (await prisma.funds.create({ data: { society_id: societyId, name_bn: 'মসজিদ তহবিল' } })).id;
    const chargeType = (name_bn: string, fund_id: string) =>
      prisma.charge_types.create({ data: { society_id: societyId, name_bn, kind: 'due', fund_id } }).then((r) => r.id);
    ids.service = await chargeType('সার্ভিস চার্জ', ids.generalFund);
    ids.mosque = await chargeType('মসজিদ চাঁদা', ids.mosqueFund);

    const block = await prisma.location_levels.create({ data: { society_id: societyId, depth: 1, name_bn: 'ব্লক' } });
    const flat = await prisma.location_levels.create({ data: { society_id: societyId, depth: 2, name_bn: 'ফ্ল্যাট', is_unit_level: true } });
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
    ids.c1 = await unit('ফ্ল্যাট সি১', c);
    ids.c2 = await unit('ফ্ল্যাট সি২', c);
    ids.d1 = await unit('ফ্ল্যাট ডি১', d);

    const person = (full_name: string) => prisma.persons.create({ data: { society_id: societyId, full_name, phone: randomPhone() } }).then((r) => r.id);
    ids.rahim = await person('রহিম');
    ids.karim = await person('করিম');
    const own = (location_id: string, person_id: string) =>
      prisma.ownerships.create({ data: { society_id: societyId, location_id, person_id, share_percent: new Prisma.Decimal('100'), start_date: new Date('2020-01-01') } });
    await own(ids.c1, ids.rahim);
    await own(ids.d1, ids.karim);

    const everything = (await prisma.permissions.findMany()).map((p) => `${p.module}:${p.action}`);
    users.admin = await makeUser(everything);
    users.viewer = await makeUser(['billing:view']);
    users.blockC = await makeUser(['billing:view', 'billing:create'], c.id);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.invoices.deleteMany({ where: { society_id: societyId } });
    await prisma.ownerships.deleteMany({ where: { society_id: societyId } });
    await prisma.user_roles.deleteMany({ where: { users_user_roles_user_idTousers: { society_id: societyId } } });
    for (const depth of [2, 1]) await prisma.locations.deleteMany({ where: { society_id: societyId, location_levels: { depth } } });
    await prisma.societies.deleteMany({ where: { id: societyId } });
    await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
    await app.close();
  });

  it('needs billing.create to check or make a batch', async () => {
    const body = batch([{ unitId: ids.c1, lines: [line(ids.service, '100')] }]);
    await post('/invoices/batch/check', users.viewer).send(body).expect(403);
    await post('/invoices/batch', users.viewer).send(body).expect(403);
  });

  it('checks each unit: who pays, one bill per fund, and units nobody owns', async () => {
    const res = await post('/invoices/batch/check')
      .send(
        batch([
          { unitId: ids.c1, lines: [line(ids.service, '3000'), line(ids.mosque, '200'), line(ids.service, '500')] },
          { unitId: ids.c2, lines: [line(ids.service, '3000')] },
        ]),
      )
      .expect(200);
    const check = invoiceBatchCheckSchema.parse(res.body);
    const [c1, c2] = check.units;
    expect(c1!.billTo?.id).toBe(ids.rahim);
    expect(c1!.bills.map((bill) => [bill.fund.id, bill.lineCount, bill.total])).toEqual([
      [ids.generalFund, 2, '3500.00'],
      [ids.mosqueFund, 1, '200.00'],
    ]);
    expect(c1!.problem).toBeNull();
    expect(c2!.problem).toBe('no_bill_to');
    expect(check.billCount).toBe(3);
    expect(await billCount()).toBe(0);
  });

  it('makes every bill or none, naming the unit that failed', async () => {
    const res = await post('/invoices/batch')
      .send(batch([{ unitId: ids.c1, lines: [line(ids.service, '100')] }, { unitId: ids.c2, lines: [line(ids.service, '100')] }]))
      .expect(400);
    expect(res.body).toMatchObject({ code: 'no_bill_to', details: { unitId: ids.c2 } });
    expect(await billCount()).toBe(0);
  });

  it('keeps a scoped user to their area, before anything is written', async () => {
    const res = await post('/invoices/batch', users.blockC)
      .send(batch([{ unitId: ids.c1, lines: [line(ids.service, '100')] }, { unitId: ids.d1, lines: [line(ids.service, '100')] }]))
      .expect(404);
    expect(res.body).toMatchObject({ code: 'unit_not_found', details: { unitId: ids.d1 } });
    expect(await billCount()).toBe(0);
  });

  it('makes the bills, split by fund, then warns about the same charge in the same month', async () => {
    const body = batch(
      [
        { unitId: ids.c1, lines: [line(ids.service, '3000'), line(ids.mosque, '200')] },
        { unitId: ids.d1, lines: [line(ids.service, '2500')] },
      ],
      { periodFrom: thisMonth() },
    );
    const made = invoiceBatchResultSchema.parse((await post('/invoices/batch').send(body).expect(201)).body).invoices;
    expect(made.map((bill) => bill.unitId)).toEqual([ids.c1, ids.c1, ids.d1]);
    const rows = await prisma.invoices.findMany({ where: { id: { in: made.map((bill) => bill.id) } }, select: { id: true, fund_id: true, total: true, period_start: true, bill_to_person_id: true } });
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(made.map((bill) => [byId.get(bill.id)!.fund_id, byId.get(bill.id)!.total.toFixed(2)])).toEqual([
      [ids.generalFund, '3000.00'],
      [ids.mosqueFund, '200.00'],
      [ids.generalFund, '2500.00'],
    ]);
    expect(byId.get(made[2]!.id)!.bill_to_person_id).toBe(ids.karim);
    expect(isoDate(byId.get(made[0]!.id)!.period_start!)).toBe(`${thisMonth()}-01`);

    // The same again: warned about, never blocked.
    const again = invoiceBatchCheckSchema.parse((await post('/invoices/batch/check').send(body).expect(200)).body);
    expect(again.units[0]!.warnings.map((w) => [w.invoiceNo, w.charges.map((c) => c.nameBn)])).toEqual([
      [made[0]!.invoiceNo, ['সার্ভিস চার্জ']],
      [made[1]!.invoiceNo, ['মসজিদ চাঁদা']],
    ]);
    // Another month has nothing to warn about.
    const later = invoiceBatchCheckSchema.parse((await post('/invoices/batch/check').send({ ...body, periodFrom: '2099-01' }).expect(200)).body);
    expect(later.units.flatMap((unit) => unit.warnings)).toEqual([]);

    // Printed together in the order asked; a bill outside the caller's area makes it a 404.
    const order = [made[2]!.id, made[0]!.id];
    const printed = invoicePrintSchema.parse((await get(`/invoices/print?ids=${order.join(',')}`).expect(200)).body);
    expect(printed.items.map((bill) => bill.id)).toEqual(order);
    expect(printed.items[0]!.lines).toHaveLength(1);
    await get(`/invoices/print?ids=${order.join(',')}`, users.blockC).expect(404);
    await get(`/invoices/print?ids=${made[0]!.id}`, users.blockC).expect(200);
    await get('/invoices/print?ids=not-an-id').expect(400);
  });

  it('lists the units to choose from within the caller’s area, with who pays', async () => {
    await get('/billing/units', users.viewer).expect(403);
    const all = billableUnitsSchema.parse((await get('/billing/units').expect(200)).body);
    expect(all.truncated).toBe(false);
    expect(all.items.map((unit) => unit.id).sort()).toEqual([ids.c1, ids.c2, ids.d1].sort());
    const byId = new Map(all.items.map((unit) => [unit.id, unit]));
    expect(byId.get(ids.c1)!.billTo?.id).toBe(ids.rahim);
    expect(byId.get(ids.c2)!.billTo).toBeNull();
    expect(byId.get(ids.d1)!.address).toEqual(['ব্লক ডি']);
    const blockC = billableUnitsSchema.parse((await get('/billing/units', users.blockC).expect(200)).body);
    expect(blockC.items.map((unit) => unit.name)).toEqual(['ফ্ল্যাট সি১', 'ফ্ল্যাট সি২']);
  });

  it('refuses a due date in the past', async () => {
    const res = await post('/invoices/batch').send(batch([{ unitId: ids.c1, lines: [line(ids.service, '100')] }], { dueDate: inDays(-1) })).expect(400);
    expect(res.body.code).toBe('due_before_issue');
  });
});
