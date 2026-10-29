import { INestApplication } from '@nestjs/common';
import { Prisma } from '@s57/db';
import { AUTH_COOKIES, CSRF_HEADER, billingLookupSchema, invoiceDetailSchema, invoiceListSchema, type InvoiceDetail } from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { isoDate, todayDate } from './../src/common/dates.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-billing-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `016${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const today = () => isoDate(todayDate());
const inDays = (days: number) => isoDate(new Date(todayDate().getTime() + days * 86_400_000));

/**
 * Bills in a society of their own (through DEFAULT_SOCIETY_SLUG), so invoice numbers start
 * fresh and nothing is left in the seeded society. Block C and Block D, each with units:
 *   C-1 (ফ্ল্যাট ১এ) owned by Rahim; C-2 rented to an organisation and set to bill its renter;
 *   C-3 owned by nobody, but its building is (owner above); C-4 owned by nobody at all;
 *   D-1 owned by Karim.
 */
describe('Bills (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let otherSocietyId: string;
  let otherUnitId: string;
  const server = () => app.getHttpServer();
  const users = {} as Record<'admin' | 'viewer' | 'nobody' | 'blockC', string>;
  const ids = {} as Record<
    'blockC' | 'blockD' | 'c1' | 'c2' | 'c3' | 'c4' | 'd1' | 'rahim' | 'karim' | 'buildingOwner' | 'shop' | 'service' | 'mosque' | 'retired' | 'mosqueFund',
    string
  >;

  async function makeUser(permissions: string[], scope: string | null = null) {
    const rows = await prisma.permissions.findMany();
    const role = await prisma.roles.create({ data: { society_id: societyId, name: `${MARK}-${randomUUID()}` } });
    await prisma.role_permissions.createMany({
      data: permissions.map((name) => ({ role_id: role.id, permission_id: rows.find((p) => `${p.module}:${p.action}` === name)!.id })),
    });
    const user = await prisma.users.create({ data: { society_id: societyId, phone: randomPhone(), status: 'active' } });
    if (permissions.length) await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.id, scope_location_id: scope } });
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId, sessionId: randomUUID() });
    return `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}`;
  }

  const send = (method: 'post' | 'put' | 'patch' | 'delete', url: string, cookie = users.admin) =>
    request(server())[method](url).set('Cookie', cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const get = (url: string, cookie = users.admin) => request(server()).get(url).set('Cookie', cookie);

  const bill = (unitId: string, lines: object[], extra: object = {}) => ({ unitId, dueDate: inDays(15), lines, ...extra });
  const line = (chargeTypeId: string, amount: string, extra: object = {}) => ({ chargeTypeId, amount, ...extra });
  const create = async (body: object, cookie = users.admin): Promise<InvoiceDetail> =>
    invoiceDetailSchema.parse((await send('post', '/invoices', cookie).send(body).expect(201)).body);
  const list = async (query = '', cookie = users.admin) => invoiceListSchema.parse((await get(`/invoices${query}`, cookie).expect(200)).body);

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { PrismaPg, PrismaClient } = await import('@s57/db');
    const setup = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    societyId = (await setup.societies.create({ data: { name_bn: `সমিতি ${MARK}`, slug: MARK } })).id;
    await setup.$disconnect();

    app = await createTestApp([], { DEFAULT_SOCIETY_SLUG: MARK });
    prisma = app.get(PrismaService);

    const fund = await prisma.funds.create({ data: { society_id: societyId, name_bn: 'সাধারণ তহবিল', is_default: true } });
    ids.mosqueFund = (await prisma.funds.create({ data: { society_id: societyId, name_bn: 'মসজিদ তহবিল' } })).id;
    const chargeType = (name_bn: string, fund_id: string, extra: object = {}) =>
      prisma.charge_types.create({ data: { society_id: societyId, name_bn, name_en: `${name_bn} en`, kind: 'due', fund_id, ...extra } }).then((r) => r.id);
    ids.service = await chargeType('সার্ভিস চার্জ', fund.id);
    ids.mosque = await chargeType('মসজিদ চাঁদা', ids.mosqueFund);
    ids.retired = await chargeType('পুরনো চার্জ', fund.id, { archived_at: new Date() });

    const block = await prisma.location_levels.create({ data: { society_id: societyId, depth: 1, name_bn: 'ব্লক' } });
    const building = await prisma.location_levels.create({ data: { society_id: societyId, depth: 2, name_bn: 'ভবন' } });
    const flat = await prisma.location_levels.create({ data: { society_id: societyId, depth: 3, name_bn: 'ফ্ল্যাট', is_unit_level: true } });
    const place = async (levelId: string, name: string, parentPath: string | null, parentId: string | null) => {
      const id = randomUUID();
      const path = `${parentPath ?? '/'}${id}/`;
      await prisma.locations.create({ data: { id, society_id: societyId, level_id: levelId, parent_id: parentId, name, path } });
      return { id, path };
    };
    const unit = async (name: string, parent: { id: string; path: string }, billTo = 'owner') => {
      const row = await place(flat.id, name, parent.path, parent.id);
      await prisma.units.create({ data: { location_id: row.id, society_id: societyId, unit_type: 'residential', bill_to: billTo } });
      return row.id;
    };
    const c = await place(block.id, 'ব্লক সি', null, null);
    const d = await place(block.id, 'ব্লক ডি', null, null);
    const c9 = await place(building.id, 'ভবন ৯', c.path, c.id);
    const cBare = await place(building.id, 'ভবন ১০', c.path, c.id);
    const d1Building = await place(building.id, 'ভবন ১', d.path, d.id);
    ids.blockC = c.id;
    ids.blockD = d.id;
    ids.c1 = await unit('ফ্ল্যাট ১এ', c9);
    ids.c2 = await unit('ফ্ল্যাট ২এ', c9, 'renter');
    ids.c3 = await unit('ফ্ল্যাট ৩এ', c9);
    ids.c4 = await unit('ফ্ল্যাট ৪এ', cBare);
    ids.d1 = await unit('ফ্ল্যাট ১বি', d1Building);

    const person = (full_name: string) =>
      prisma.persons.create({ data: { society_id: societyId, full_name, full_name_en: `${full_name} en`, phone: randomPhone() } }).then((r) => r.id);
    ids.rahim = await person('রহিম উদ্দিন');
    ids.karim = await person('করিম মিয়া');
    ids.buildingOwner = await person('ভবন মালিক');
    const own = (location_id: string, person_id: string, share_percent = '100') =>
      prisma.ownerships.create({ data: { society_id: societyId, location_id, person_id, share_percent: new Prisma.Decimal(share_percent), start_date: new Date('2020-01-01') } });
    await own(ids.c1, ids.rahim, '40');
    await own(ids.c1, ids.karim, '60');
    await own(ids.c2, ids.rahim);
    await own(c9.id, ids.buildingOwner);
    await own(ids.d1, ids.karim);
    ids.shop = (await prisma.organisations.create({ data: { society_id: societyId, name: 'কাশেম ফার্মেসি' } })).id;
    await prisma.tenancies.create({
      data: { society_id: societyId, unit_id: ids.c2, renter_type: 'shop', organisation_id: ids.shop, start_date: new Date('2025-01-01'), status: 'active' },
    });
    await prisma.memberships.create({ data: { society_id: societyId, person_id: ids.rahim, member_no: 7, joined_on: new Date('2025-01-01') } });

    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: `${MARK}-other` } })).id;
    const otherLevel = await prisma.location_levels.create({ data: { society_id: otherSocietyId, depth: 1, name_bn: 'ফ্ল্যাট', is_unit_level: true } });
    otherUnitId = randomUUID();
    await prisma.locations.create({ data: { id: otherUnitId, society_id: otherSocietyId, level_id: otherLevel.id, name: 'অন্য', path: `/${otherUnitId}/` } });
    await prisma.units.create({ data: { location_id: otherUnitId, society_id: otherSocietyId, unit_type: 'residential' } });

    const everything = (await prisma.permissions.findMany()).map((p) => `${p.module}:${p.action}`);
    users.admin = await makeUser(everything);
    users.viewer = await makeUser(['billing:view']);
    users.nobody = await makeUser([]);
    users.blockC = await makeUser(['billing:view', 'billing:create', 'billing:approve'], ids.blockC);
  });

  afterAll(async () => {
    if (!prisma) return;
    const societies = { in: [societyId, otherSocietyId] };
    await prisma.invoices.deleteMany({ where: { society_id: societies } });
    await prisma.memberships.deleteMany({ where: { society_id: societies } });
    await prisma.tenancies.deleteMany({ where: { society_id: societies } });
    await prisma.ownerships.deleteMany({ where: { society_id: societies } });
    await prisma.user_roles.deleteMany({ where: { users_user_roles_user_idTousers: { society_id: societyId } } });
    // Locations refuse a cascade while children exist: deepest first.
    for (const depth of [3, 2, 1]) {
      await prisma.locations.deleteMany({ where: { society_id: societies, location_levels: { depth } } });
    }
    await prisma.societies.deleteMany({ where: { id: societies } });
    await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
    await app.close();
  });

  describe('permissions and boundaries', () => {
    it('needs the billing permissions', async () => {
      await get('/invoices', users.nobody).expect(403);
      await send('post', '/invoices', users.viewer).send(bill(ids.c1, [line(ids.service, '100')])).expect(403);
      await get('/billing/lookup?q=ফ্ল্যাট', users.viewer).expect(403);
    });

    it('has no delete route: bills are only voided', async () => {
      const made = await create(bill(ids.d1, [line(ids.service, '10')]));
      await send('delete', `/invoices/${made.id}`).expect(404);
      await send('post', `/invoices/${made.id}/void`).send({ reason: 'পরীক্ষা' }).expect(200);
    });

    it('keeps another society out', async () => {
      const res = await send('post', '/invoices').send(bill(otherUnitId, [line(ids.service, '10')])).expect(404);
      expect(res.body.code).toBe('unit_not_found');
      const foreign = await prisma.invoices.create({
        data: {
          society_id: otherSocietyId,
          invoice_no: 'INV-0000-0001',
          unit_id: otherUnitId,
          bill_to_organisation_id: (await prisma.organisations.create({ data: { society_id: otherSocietyId, name: 'অন্য প্রতিষ্ঠান' } })).id,
          fund_id: ids.mosqueFund,
          due_date: new Date(),
          total: new Prisma.Decimal('5'),
        },
      });
      await get(`/invoices/${foreign.id}`).expect(404);
      await send('post', `/invoices/${foreign.id}/void`).send({ reason: 'না' }).expect(404);
      expect((await list()).items.some((item) => item.id === foreign.id)).toBe(false);
    });

    it('keeps a Block C user to Block C', async () => {
      const inD = await create(bill(ids.d1, [line(ids.service, '500')]));
      const res = await send('post', '/invoices', users.blockC).send(bill(ids.d1, [line(ids.service, '500')])).expect(404);
      expect(res.body.code).toBe('unit_not_found');
      await get(`/invoices/${inD.id}`, users.blockC).expect(404);
      await send('post', `/invoices/${inD.id}/void`, users.blockC).send({ reason: 'ভুল' }).expect(404);

      const inC = await create(bill(ids.c3, [line(ids.service, '500')]), users.blockC);
      const mine = await list('?pageSize=100', users.blockC);
      expect(mine.items.some((item) => item.id === inC.id)).toBe(true);
      expect(mine.items.every((item) => item.billTo.unit?.address.includes('ব্লক সি'))).toBe(true);
      const lookup = billingLookupSchema.parse((await get('/billing/lookup?q=ফ্ল্যাট', users.blockC).expect(200)).body);
      expect(lookup.units.map((u) => u.id)).not.toContain(ids.d1);
      expect(lookup.members).toEqual([]);
    });
  });

  describe('making a bill', () => {
    it('bills the largest co-owner, with exact money and a fresh number', async () => {
      const made = await create(
        bill(ids.c1, [line(ids.service, '0.10'), line(ids.service, '০.২০', { description: 'জেনারেটর', descriptionEn: '' })], {
          periodFrom: '2026-10',
          periodTo: '2026-12',
        }),
      );
      expect(made).toMatchObject({
        kind: 'regular',
        status: 'unpaid',
        total: '0.30',
        paid: '0.00',
        due: '0.30',
        overdue: false,
        issueDate: today(),
        periodStart: '2026-10-01',
        periodEnd: '2026-12-31',
        billTo: { kind: 'person', id: ids.karim, role: 'owner', unit: { id: ids.c1, name: 'ফ্ল্যাট ১এ', address: ['ব্লক সি', 'ভবন ৯'] } },
      });
      expect(made.invoiceNo).toMatch(new RegExp(`^INV-${today().slice(2, 4)}${today().slice(5, 7)}-\\d{4}$`));
      expect(made.lines.map((l) => [l.description, l.descriptionEn, l.amount])).toEqual([
        ['সার্ভিস চার্জ', 'সার্ভিস চার্জ en', '0.10'],
        ['জেনারেটর', null, '0.20'],
      ]);
      expect(made.can.void).toBe(true);
      const audit = await prisma.audit_logs.findFirstOrThrow({ where: { society_id: societyId, entity_type: 'invoice', entity_id: made.id } });
      expect(audit.action).toBe('create');
      expect(audit.after_data).toMatchObject({ total: '0.30', invoiceNo: made.invoiceNo });
    });

    it('bills the renter when the unit says so, and the owner above when the unit has none', async () => {
      const rented = await create(bill(ids.c2, [line(ids.service, '1500')]));
      expect(rented.billTo).toMatchObject({ kind: 'organisation', id: ids.shop, name: 'কাশেম ফার্মেসি', role: 'renter' });
      const above = await create(bill(ids.c3, [line(ids.service, '1500')]));
      expect(above.billTo).toMatchObject({ id: ids.buildingOwner, role: 'owner' });
    });

    it('refuses a unit with nobody to bill', async () => {
      const res = await send('post', '/invoices').send(bill(ids.c4, [line(ids.service, '100')])).expect(400);
      expect(res.body.code).toBe('no_bill_to');
    });

    it('keeps the payer as they were on the day', async () => {
      const made = await create(bill(ids.d1, [line(ids.service, '100')]));
      await prisma.persons.update({ where: { id: ids.karim }, data: { full_name: 'করিম মিয়া (নতুন)' } });
      expect((await get(`/invoices/${made.id}`).expect(200)).body.billTo.name).toBe('করিম মিয়া');
      await prisma.persons.update({ where: { id: ids.karim }, data: { full_name: 'করিম মিয়া' } });
    });

    it('refuses lines from two funds, retired charge types and impossible dates', async () => {
      const mixed = await send('post', '/invoices').send(bill(ids.c1, [line(ids.service, '1'), line(ids.mosque, '1')])).expect(400);
      expect(mixed.body.code).toBe('mixed_funds');
      const retired = await send('post', '/invoices').send(bill(ids.c1, [line(ids.retired, '1')])).expect(400);
      expect(retired.body.code).toBe('charge_type_archived');
      const early = await send('post', '/invoices').send(bill(ids.c1, [line(ids.service, '1')], { dueDate: inDays(-1) })).expect(400);
      expect(early.body.code).toBe('due_before_issue');
      const unknown = await send('post', '/invoices').send(bill(ids.c1, [line(randomUUID(), '1')])).expect(400);
      expect(unknown.body.code).toBe('invalid_charge_type');
    });

    it('puts a bill in the fund of its charge types', async () => {
      const made = await create(bill(ids.c1, [line(ids.mosque, '250')]));
      expect(made.fund.id).toBe(ids.mosqueFund);
    });

    it('bills a member with no unit, for society-wide roles only', async () => {
      const fee = await create({ personId: ids.rahim, dueDate: inDays(30), lines: [line(ids.service, '1200')] });
      expect(fee).toMatchObject({ kind: 'membership', billTo: { id: ids.rahim, role: 'member', memberNo: 7, unit: null } });
      const scoped = await send('post', '/invoices', users.blockC).send({ personId: ids.rahim, dueDate: inDays(30), lines: [line(ids.service, '1')] });
      expect(scoped.status).toBe(403);
      await get(`/invoices/${fee.id}`, users.blockC).expect(404);
      const none = await send('post', '/invoices').send({ personId: ids.karim, dueDate: inDays(30), lines: [line(ids.service, '1')] }).expect(400);
      expect(none.body.code).toBe('no_membership');
      const lookup = billingLookupSchema.parse((await get('/billing/lookup?q=রহিম').expect(200)).body);
      expect(lookup.members).toMatchObject([{ id: ids.rahim, memberNo: 7 }]);
    });

    it('bills an organisation member, found by name or membership ID', async () => {
      const org = (await prisma.organisations.create({ data: { society_id: societyId, name: 'নূর ট্রেডার্স' } })).id;
      const { membership_code: code } = await prisma.memberships.create({
        data: { society_id: societyId, organisation_id: org, member_no: 8, joined_on: new Date('2025-01-01') },
      });
      for (const q of ['নূর', code!, '৮']) {
        const lookup = billingLookupSchema.parse((await get(`/billing/lookup?q=${encodeURIComponent(q)}`).expect(200)).body);
        expect(lookup.members).toContainEqual(expect.objectContaining({ kind: 'organisation', id: org, memberNo: 8, membershipCode: code }));
      }
      const fee = await create({ organisationId: org, dueDate: inDays(30), lines: [line(ids.service, '900')] });
      expect(fee).toMatchObject({ kind: 'membership', billTo: { kind: 'organisation', id: org, role: 'member', memberNo: 8, unit: null } });
      const theirs = await list(`?organisationId=${org}&kind=membership`);
      expect(theirs.items.map((item) => item.id)).toEqual([fee.id]);
      const both = await send('post', '/invoices').send({ personId: ids.rahim, organisationId: org, dueDate: inDays(30), lines: [line(ids.service, '1')] });
      expect(both.status).toBe(400);
      const stranger = (await prisma.organisations.create({ data: { society_id: societyId, name: 'অচেনা দোকান' } })).id;
      const none = await send('post', '/invoices').send({ organisationId: stranger, dueDate: inDays(30), lines: [line(ids.service, '1')] }).expect(400);
      expect(none.body.code).toBe('no_membership');
    });

    it('gives two bills made at once two different numbers', async () => {
      const made = await Promise.all([1, 2, 3, 4].map(() => create(bill(ids.c1, [line(ids.service, '10')]))));
      expect(new Set(made.map((m) => m.invoiceNo)).size).toBe(4);
    });
  });

  describe('opening arrears', () => {
    it('enters a unit’s earlier dues once, dated in the past and already overdue', async () => {
      const asOf = inDays(-30);
      const res = await send('post', '/invoices/opening')
        .send({ unitId: ids.d1, asOf, chargeTypeId: ids.service, amount: '৭২,০০০.৫০', note: '২০২৪-২৫' })
        .expect(201);
      const opening = invoiceDetailSchema.parse(res.body);
      expect(opening).toMatchObject({ kind: 'opening', issueDate: asOf, dueDate: asOf, total: '72000.50', overdue: true, periodStart: null });
      expect(opening.lines[0]).toMatchObject({ description: 'আগের বকেয়া (২০২৪-২৫)', descriptionEn: 'Earlier arrears (২০২৪-২৫)' });

      const again = await send('post', '/invoices/opening').send({ unitId: ids.d1, asOf, chargeTypeId: ids.service, amount: '1' }).expect(409);
      expect(again.body.code).toBe('opening_exists');
      const future = await send('post', '/invoices/opening').send({ unitId: ids.c1, asOf: inDays(2), chargeTypeId: ids.service, amount: '1' }).expect(400);
      expect(future.body.code).toBe('future_date');

      const lookup = billingLookupSchema.parse((await get(`/billing/lookup?unitId=${ids.d1}`).expect(200)).body);
      expect(lookup.units[0]).toMatchObject({ id: ids.d1, hasOpening: true, billTo: { id: ids.karim, role: 'owner' } });
    });

    it('counts earlier arrears apart, whatever the month', async () => {
      const totals = (await list(`?month=${today().slice(0, 7)}`)).totals;
      expect(totals).toMatchObject({ earlierArrears: '72000.50', earlierArrearsUnits: 1 });
      const scoped = (await list('', users.blockC)).totals;
      expect(scoped).toMatchObject({ earlierArrears: '0.00', earlierArrearsUnits: 0 });
    });
  });

  describe('the list', () => {
    it('finds bills by unit name, bill-to name and number, in either digit form', async () => {
      const byUnit = await list('?q=1এ&pageSize=100');
      expect(byUnit.items.length).toBeGreaterThan(0);
      expect(byUnit.items.every((item) => item.billTo.unit?.name === 'ফ্ল্যাট ১এ')).toBe(true);
      const byName = await list(`?q=${encodeURIComponent('কাশেম')}`);
      expect(byName.items.map((item) => item.billTo.id)).toEqual([ids.shop]);
      const one = byName.items[0]!;
      const byNo = await list(`?q=${one.invoiceNo}`);
      expect(byNo.items.map((item) => item.id)).toEqual([one.id]);
      expect(one.charges).toEqual([{ nameBn: 'সার্ভিস চার্জ', nameEn: 'সার্ভিস চার্জ en' }]);
    });

    it('filters by derived overdue, kind, unit and payer', async () => {
      const overdue = await list('?status=overdue&pageSize=100');
      expect(overdue.items.length).toBeGreaterThan(0);
      expect(overdue.items.every((item) => item.overdue)).toBe(true);
      expect((await list('?kind=opening')).items.map((item) => item.billTo.unit?.id)).toEqual([ids.d1]);
      expect((await list(`?unitId=${ids.c2}`)).items.every((item) => item.billTo.unit?.id === ids.c2)).toBe(true);
      const rahims = await list(`?personId=${ids.rahim}`);
      expect(rahims.items.map((item) => item.kind)).toEqual(['membership']);
      expect((await list(`?areaId=${ids.blockD}&pageSize=100`)).items.every((item) => item.billTo.unit?.address[0] === 'ব্লক ডি')).toBe(true);
    });

    it('sums the stat cards in SQL, leaving out void bills', async () => {
      const { totals, total } = await list('?pageSize=1');
      const rows = await prisma.invoices.findMany({ where: { society_id: societyId } });
      const live = rows.filter((row) => row.status !== 'void');
      const sum = live.reduce((acc, row) => acc.plus(row.total), new Prisma.Decimal(0));
      expect(totals.billed).toBe(sum.toFixed(2));
      expect(totals.billedCount).toBe(live.length);
      expect(totals.collected).toBe('0.00');
      expect(totals.outstanding).toBe(sum.toFixed(2));
      expect(total).toBe(rows.length);
    });
  });

  describe('voiding', () => {
    it('voids with a reason, once, and only with billing.approve there', async () => {
      const made = await create(bill(ids.c1, [line(ids.service, '300')]));
      const denied = await send('post', `/invoices/${made.id}/void`, users.viewer).send({ reason: 'ভুল' });
      expect(denied.status).toBe(403);
      await send('post', `/invoices/${made.id}/void`, users.blockC).send({ reason: '  ' }).expect(400);
      const res = await send('post', `/invoices/${made.id}/void`, users.blockC).send({ reason: 'ভুল ইউনিট' }).expect(200);
      expect(invoiceDetailSchema.parse(res.body)).toMatchObject({ status: 'void', due: '0.00', void: { reason: 'ভুল ইউনিট' }, can: { void: false } });
      const twice = await send('post', `/invoices/${made.id}/void`).send({ reason: 'আবার' }).expect(409);
      expect(twice.body.code).toBe('already_void');
      const audit = await prisma.audit_logs.findFirstOrThrow({ where: { entity_type: 'invoice', entity_id: made.id, action: 'void' } });
      expect(audit.before_data).toMatchObject({ status: 'unpaid', total: '300.00' });
    });

    it('refuses once money has been paid on the bill', async () => {
      const made = await create(bill(ids.c1, [line(ids.service, '300')]));
      // Step 14 records payments; here the columns are set directly.
      await prisma.invoices.update({ where: { id: made.id }, data: { paid: new Prisma.Decimal('100'), status: 'partial' } });
      const res = await send('post', `/invoices/${made.id}/void`).send({ reason: 'ভুল' }).expect(409);
      expect(res.body.code).toBe('invoice_has_payments');
      expect((await get(`/invoices/${made.id}`).expect(200)).body).toMatchObject({ due: '200.00', can: { void: false } });
    });

    it('lets earlier arrears be typed again once the old entry is void', async () => {
      const [opening] = (await list('?kind=opening')).items;
      await send('post', `/invoices/${opening!.id}/void`).send({ reason: 'ভুল অঙ্ক' }).expect(200);
      await send('post', '/invoices/opening').send({ unitId: ids.d1, asOf: inDays(-30), chargeTypeId: ids.service, amount: '70000' }).expect(201);
    });

    it('needs a reason, why and who for every void bill (database check)', async () => {
      const made = await create(bill(ids.c1, [line(ids.service, '1')]));
      await expect(prisma.invoices.update({ where: { id: made.id }, data: { status: 'void' } })).rejects.toThrow();
    });
  });

  describe('the printed bill', () => {
    it('notes the unit’s other unpaid bills, never itself or void ones, with the bill formats', async () => {
      const open = await prisma.invoices.findMany({
        where: { society_id: societyId, unit_id: ids.c3, status: { in: ['unpaid', 'partial'] } },
        select: { total: true, paid: true },
      });
      const owed = open.reduce((sum, row) => sum.plus(row.total.minus(row.paid)), new Prisma.Decimal(0));
      const first = await create(bill(ids.c3, [line(ids.service, '400')]));
      const voided = await create(bill(ids.c3, [line(ids.service, '900')]));
      await send('post', `/invoices/${voided.id}/void`).send({ reason: 'ভুল' }).expect(200);
      const second = await create(bill(ids.c3, [line(ids.service, '250')]));
      await prisma.invoices.update({ where: { id: second.id }, data: { paid: new Prisma.Decimal('50'), status: 'partial' } });

      const read = async (id: string) => invoiceDetailSchema.parse((await get(`/invoices/${id}`).expect(200)).body);
      expect((await read(first.id)).otherDue).toEqual({ owed: owed.plus(200).toFixed(2), bills: open.length + 1 });
      expect((await read(second.id)).otherDue).toEqual({ owed: owed.plus(400).toFixed(2), bills: open.length + 1 });
      expect((await read(voided.id)).otherDue).toEqual({ owed: owed.plus(600).toFixed(2), bills: open.length + 2 });
      expect((await read(first.id)).print).toEqual({ default: 'a4', offered: ['a4', 'a5'], noteBn: null, noteEn: null });
    });
  });
});
