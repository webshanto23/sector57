import { INestApplication } from '@nestjs/common';
import {
  addMonths,
  AUTH_COOKIES,
  billingRunListSchema,
  billingRunPreviewSchema,
  billingRunSchema,
  CSRF_HEADER,
  invoiceListSchema,
  monthOfDay,
  scheduleListSchema,
  scheduleSchema,
  type Schedule,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { BillingRunsService } from './../src/billing/billing-runs.service.js';
import { isoDate, todayDate } from './../src/common/dates.js';
import { NumberingService } from './../src/finance/numbering.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-runs-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const today = () => isoDate(todayDate());
/** This month in Dhaka, `YYYY-MM`, and its first day. */
const M = () => monthOfDay(today());
const first = (month: string) => `${month}-01`;
const monthsAgo = (n: number) => monthOfDay(addMonths(first(M()), -n));

/**
 * Billing runs in a society of their own. Block C has Building 9 (flats C1 owned by Rahim,
 * C2 rented to a shop that pays its own bills), Building 10 (C4 with nobody to bill, C5
 * inactive) and shop S1; Block D has flat D1. Funds: general and mosque.
 */
describe('Recurring charges and billing runs (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let otherSocietyId: string;
  const server = () => app.getHttpServer();
  const users = {} as Record<'admin' | 'viewer' | 'nobody' | 'blockC', string>;
  const ids = {} as Record<
    'blockC' | 'blockD' | 'building9' | 'c1' | 'c2' | 'c4' | 'c5' | 's1' | 'd1' | 'service' | 'generator' | 'mosque' | 'retired' | 'otherLocation',
    string
  >;
  const schedules = {} as Record<'service' | 'generator' | 'mosque', Schedule>;

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

  const send = (method: 'post' | 'put', url: string, cookie = users.admin) =>
    request(server())[method](url).set('Cookie', cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const get = (url: string, cookie = users.admin) => request(server()).get(url).set('Cookie', cookie);

  const input = (extra: object = {}) => ({
    nameBn: `চার্জ ${randomUUID().slice(0, 6)}`,
    nameEn: null,
    chargeTypeId: ids.service,
    amount: '100',
    rates: [],
    frequencyMonths: 1,
    generation: 'manual',
    scopeLocationId: null,
    unitTypes: [],
    startMonth: M(),
    endMonth: null,
    dueDays: 15,
    ...extra,
  });
  const create = async (body: object) => scheduleSchema.parse((await send('post', '/schedules').send(body).expect(201)).body);
  const preview = async (month = M()) => billingRunPreviewSchema.parse((await get(`/billing-runs/preview?month=${month}`).expect(200)).body);
  const run = async (month = M()) => billingRunSchema.parse((await send('post', '/billing-runs').send({ month }).expect(201)).body);
  const linesOf = (scheduleId: string) => prisma.invoice_lines.findMany({ where: { schedule_id: scheduleId }, orderBy: { period_start: 'asc' } });
  /** Only the given schedules are due: the others are paused for the test and resumed after. */
  const only = async (keep: string[], work: () => Promise<void>) => {
    const others = await prisma.charge_schedules.findMany({ where: { society_id: societyId, status: 'active', id: { notIn: keep } }, select: { id: true } });
    await prisma.charge_schedules.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { status: 'paused' } });
    try {
      await work();
    } finally {
      await prisma.charge_schedules.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { status: 'active' } });
    }
  };

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { PrismaPg, PrismaClient } = await import('@s57/db');
    const setup = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    societyId = (await setup.societies.create({ data: { name_bn: `সমিতি ${MARK}`, slug: MARK } })).id;
    await setup.$disconnect();

    app = await createTestApp([], { DEFAULT_SOCIETY_SLUG: MARK });
    prisma = app.get(PrismaService);

    const general = await prisma.funds.create({ data: { society_id: societyId, name_bn: 'সাধারণ তহবিল', is_default: true } });
    const mosqueFund = await prisma.funds.create({ data: { society_id: societyId, name_bn: 'মসজিদ তহবিল' } });
    const chargeType = (name_bn: string, fund_id: string, extra: object = {}) =>
      prisma.charge_types.create({ data: { society_id: societyId, name_bn, kind: 'due', fund_id, ...extra } }).then((r) => r.id);
    ids.service = await chargeType('সার্ভিস চার্জ', general.id);
    ids.generator = await chargeType('জেনারেটর ফি', general.id);
    ids.mosque = await chargeType('মসজিদ চাঁদা', mosqueFund.id);
    ids.retired = await chargeType('পুরনো চার্জ', general.id, { archived_at: new Date() });

    const block = await prisma.location_levels.create({ data: { society_id: societyId, depth: 1, name_bn: 'ব্লক' } });
    const building = await prisma.location_levels.create({ data: { society_id: societyId, depth: 2, name_bn: 'ভবন' } });
    const flat = await prisma.location_levels.create({ data: { society_id: societyId, depth: 3, name_bn: 'ইউনিট', is_unit_level: true } });
    const place = async (levelId: string, name: string, parent: { id: string; path: string } | null, active = true) => {
      const id = randomUUID();
      const path = `${parent?.path ?? '/'}${id}/`;
      await prisma.locations.create({ data: { id, society_id: societyId, level_id: levelId, parent_id: parent?.id ?? null, name, path, is_active: active } });
      return { id, path };
    };
    const unit = async (name: string, parent: { id: string; path: string }, extra: { type?: string; billTo?: string; active?: boolean } = {}) => {
      const row = await place(flat.id, name, parent, extra.active ?? true);
      await prisma.units.create({ data: { location_id: row.id, society_id: societyId, unit_type: extra.type ?? 'residential', bill_to: extra.billTo ?? 'owner' } });
      return row.id;
    };
    const c = await place(block.id, 'ব্লক সি', null);
    const d = await place(block.id, 'ব্লক ডি', null);
    const b9 = await place(building.id, 'ভবন ৯', c);
    const b10 = await place(building.id, 'ভবন ১০', c);
    const bD = await place(building.id, 'ভবন ১', d);
    ids.blockC = c.id;
    ids.blockD = d.id;
    ids.building9 = b9.id;
    ids.c1 = await unit('সি-১', b9);
    ids.c2 = await unit('সি-২', b9, { billTo: 'renter' });
    ids.c4 = await unit('সি-৪', b10);
    ids.c5 = await unit('সি-৫', b10, { active: false });
    ids.s1 = await unit('দোকান ১', b10, { type: 'shop' });
    ids.d1 = await unit('ডি-১', bD);

    const person = (full_name: string) => prisma.persons.create({ data: { society_id: societyId, full_name, phone: randomPhone() } }).then((r) => r.id);
    const rahim = await person('রহিম');
    const karim = await person('করিম');
    const own = (location_id: string, person_id: string) =>
      prisma.ownerships.create({ data: { society_id: societyId, location_id, person_id, start_date: new Date('2020-01-01') } });
    await own(ids.c1, rahim);
    await own(ids.c2, rahim);
    await own(ids.c5, rahim);
    await own(ids.s1, karim);
    await own(ids.d1, karim);
    const shop = await prisma.organisations.create({ data: { society_id: societyId, name: 'কাশেম ফার্মেসি' } });
    await prisma.tenancies.create({
      data: { society_id: societyId, unit_id: ids.c2, renter_type: 'shop', organisation_id: shop.id, start_date: new Date('2025-01-01'), status: 'active' },
    });

    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: `${MARK}-other` } })).id;
    const otherLevel = await prisma.location_levels.create({ data: { society_id: otherSocietyId, depth: 1, name_bn: 'ব্লক' } });
    ids.otherLocation = randomUUID();
    await prisma.locations.create({ data: { id: ids.otherLocation, society_id: otherSocietyId, level_id: otherLevel.id, name: 'অন্য', path: `/${ids.otherLocation}/` } });

    const everything = (await prisma.permissions.findMany()).map((p) => `${p.module}:${p.action}`);
    users.admin = await makeUser(everything);
    users.viewer = await makeUser(['billing:view']);
    users.nobody = await makeUser([]);
    users.blockC = await makeUser(['billing:view', 'billing:create', 'billing:edit'], ids.blockC);
  });

  afterAll(async () => {
    if (!prisma) return;
    const societies = { in: [societyId, otherSocietyId] };
    await prisma.invoices.deleteMany({ where: { society_id: societies } });
    await prisma.billing_runs.deleteMany({ where: { society_id: societies } });
    await prisma.charge_schedules.deleteMany({ where: { society_id: societies } });
    await prisma.tenancies.deleteMany({ where: { society_id: societies } });
    await prisma.ownerships.deleteMany({ where: { society_id: societies } });
    await prisma.user_roles.deleteMany({ where: { users_user_roles_user_idTousers: { society_id: societyId } } });
    for (const depth of [3, 2, 1]) await prisma.locations.deleteMany({ where: { society_id: societies, location_levels: { depth } } });
    await prisma.societies.deleteMany({ where: { id: societies } });
    await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
    await app.close();
  });

  describe('schedules', () => {
    it('needs a society-wide billing role to change them', async () => {
      await get('/schedules', users.nobody).expect(403);
      const read = scheduleListSchema.parse((await get('/schedules', users.viewer).expect(200)).body);
      expect(read.canEdit).toBe(false);
      await send('post', '/schedules', users.viewer).send(input()).expect(403);
      const scoped = await send('post', '/schedules', users.blockC).send(input({ scopeLocationId: ids.blockC })).expect(403);
      expect(scoped.body.code).toBe('beyond_your_permissions');
    });

    it('sets rates by area and checks them', async () => {
      schedules.service = await create(
        input({
          nameBn: 'সার্ভিস চার্জ',
          nameEn: 'Service charge',
          amount: '১,৫০০.১০',
          rates: [
            { locationId: ids.building9, amount: '2000' },
            { locationId: ids.blockD, amount: '1200' },
          ],
          unitTypes: ['residential'],
          generation: 'auto',
        }),
      );
      expect(schedules.service).toMatchObject({ amount: '1500.10', nextRunOn: first(M()), status: 'active', billed: false, startMonth: M() });
      expect(schedules.service.rates.map((rate) => [rate.location.name, rate.amount]).sort(([a], [b]) => a!.localeCompare(b!))).toEqual([
        ['ব্লক ডি', '1200.00'],
        ['ভবন ৯', '2000.00'],
      ]);

      const outside = await send('post', '/schedules').send(input({ scopeLocationId: ids.blockC, rates: [{ locationId: ids.blockD, amount: '1' }] })).expect(400);
      expect(outside.body.code).toBe('rate_outside_scope');
      const foreign = await send('post', '/schedules').send(input({ scopeLocationId: ids.otherLocation })).expect(400);
      expect(foreign.body.code).toBe('location_not_found');
      const past = await send('post', '/schedules').send(input({ startMonth: monthsAgo(1) })).expect(400);
      expect(past.body.code).toBe('start_in_past');
      const retired = await send('post', '/schedules').send(input({ chargeTypeId: ids.retired })).expect(400);
      expect(retired.body.code).toBe('charge_type_archived');
    });

    it('adds a manual one for Block C and a quarterly one in another fund', async () => {
      schedules.generator = await create(input({ nameBn: 'জেনারেটর', chargeTypeId: ids.generator, amount: '0.20', scopeLocationId: ids.blockC }));
      schedules.mosque = await create(
        input({ nameBn: 'মসজিদ', chargeTypeId: ids.mosque, amount: '100', frequencyMonths: 3, generation: 'auto', unitTypes: ['residential'] }),
      );
      expect(schedules.mosque.fund.isDefault).toBe(false);
    });
  });

  describe('a run', () => {
    it('previews per unit with the nearest rate, and lists who is left out and why', async () => {
      await get(`/billing-runs/preview?month=${M()}`, users.blockC).expect(403);
      const res = await get(`/billing-runs/preview?month=${monthOfDay(addMonths(first(M()), 1))}`).expect(400);
      expect(res.body.code).toBe('future_month');

      const p = await preview();
      expect(p).toMatchObject({ invoiceCount: 7, lineCount: 9, total: '5500.60', skippedCounts: { no_bill_to: 3, inactive: 3, already_billed: 0 } });
      const rateOf = (unitId: string, scheduleId: string) => p.lines.find((l) => l.unitId === unitId && l.scheduleId === scheduleId);
      expect(rateOf(ids.c1, schedules.service.id)).toMatchObject({ amount: '2000.00', rateFrom: 'ভবন ৯', billTo: 'রহিম' });
      expect(rateOf(ids.c2, schedules.service.id)).toMatchObject({ billTo: 'কাশেম ফার্মেসি' });
      expect(rateOf(ids.d1, schedules.service.id)).toMatchObject({ amount: '1200.00', rateFrom: 'ব্লক ডি' });
      expect(rateOf(ids.s1, schedules.service.id)).toBeUndefined();
      expect(rateOf(ids.s1, schedules.generator.id)).toMatchObject({ amount: '0.20', rateFrom: null });
      expect(rateOf(ids.d1, schedules.generator.id)).toBeUndefined();
      expect(rateOf(ids.c1, schedules.mosque.id)).toMatchObject({ periodStart: first(M()), periodEnd: isoDate(new Date(Date.UTC(+M().slice(0, 4), +M().slice(5, 7) + 2, 0))) });
      expect(p.skipped.filter((s) => s.unitId === ids.c5).every((s) => s.reason === 'inactive')).toBe(true);
      expect(await prisma.invoices.count({ where: { society_id: societyId } })).toBe(0);
    });

    it('bills one bill per unit and fund, exactly, and moves the schedules on', async () => {
      const done = await run();
      expect(done).toMatchObject({ trigger: 'manual', status: 'done', invoiceCount: 7, total: '5500.60', month: M() });
      expect(done.skipped).toHaveLength(6);

      const c1 = await prisma.invoices.findMany({ where: { unit_id: ids.c1 }, include: { invoice_lines: { orderBy: { position: 'asc' } } } });
      const general = c1.find((i) => i.invoice_lines.length === 2)!;
      expect(general.total.toFixed(2)).toBe('2000.20');
      expect(general.billing_run_id).toBe(done.id);
      expect(isoDate(general.due_date) > today()).toBe(true);
      // Lines follow the schedules' names.
      expect(general.invoice_lines.map((l) => l.description)).toEqual([
        expect.stringMatching(/^জেনারেটর \(/),
        expect.stringMatching(/^সার্ভিস চার্জ \(/),
      ]);
      const quarterly = c1.find((i) => i.invoice_lines.length === 1)!;
      expect(isoDate(quarterly.period_end!)).toBe(isoDate(new Date(Date.UTC(+M().slice(0, 4), +M().slice(5, 7) + 2, 0))));

      const after = scheduleListSchema.parse((await get('/schedules').expect(200)).body).items;
      expect(after.find((s) => s.id === schedules.service.id)).toMatchObject({ nextRunOn: addMonths(first(M()), 1), billed: true });
      expect(after.find((s) => s.id === schedules.mosque.id)).toMatchObject({ nextRunOn: addMonths(first(M()), 3) });
      const audit = await prisma.audit_logs.findFirstOrThrow({ where: { entity_type: 'billing_run', entity_id: done.id } });
      expect(audit.after_data).toMatchObject({ invoices: 7, total: '5500.60' });
    });

    it('lets a Block C user see the bills it made in Block C only', async () => {
      const list = invoiceListSchema.parse((await get('/invoices?pageSize=100', users.blockC).expect(200)).body);
      expect(list.items.length).toBe(5);
      expect(list.items.every((i) => i.billTo.unit?.address[0] === 'ব্লক সি')).toBe(true);
      await get('/billing-runs', users.blockC).expect(403);
    });

    it('never bills twice', async () => {
      const again = await run();
      expect(again).toMatchObject({ invoiceCount: 0, total: '0.00' });
      expect(await app.get(BillingRunsService).runAuto(societyId, M())).toBeNull();
      expect(await prisma.invoices.count({ where: { society_id: societyId } })).toBe(7);
    });

    it('lists the runs, newest first', async () => {
      const list = billingRunListSchema.parse((await get('/billing-runs').expect(200)).body);
      expect(list.items.map((r) => r.invoiceCount)).toEqual([0, 7]);
    });
  });

  describe('catching up and skipping', () => {
    it('bills missed months oldest first, on an automatic run', async () => {
      const catchUp = await create(input({ nameBn: 'দোকান চার্জ', amount: '50', unitTypes: ['shop'], generation: 'auto' }));
      await prisma.charge_schedules.update({ where: { id: catchUp.id }, data: { next_run_on: new Date(`${first(monthsAgo(2))}T00:00:00Z`) } });
      const runId = await app.get(BillingRunsService).runAuto(societyId, M());
      expect(runId).not.toBeNull();
      const lines = await linesOf(catchUp.id);
      expect(lines.map((l) => isoDate(l.period_start!))).toEqual([first(monthsAgo(2)), first(monthsAgo(1)), first(M())]);
      expect(new Set(lines.map((l) => l.invoice_id)).size).toBe(1);
      // Manual schedules wait for a run from the dashboard.
      expect(await prisma.billing_runs.findUniqueOrThrow({ where: { id: runId! } })).toMatchObject({ trigger: 'auto', invoice_count: 1, started_by: null });

      // Put back to an already billed month: the unit is listed as already billed, nothing is made.
      await prisma.charge_schedules.update({ where: { id: catchUp.id }, data: { next_run_on: new Date(`${first(monthsAgo(1))}T00:00:00Z`) } });
      await only([catchUp.id], async () => {
        const p = await preview();
        expect(p).toMatchObject({ lineCount: 0, skippedCounts: { already_billed: 1 } });
        expect((await run()).invoiceCount).toBe(0);
      });
      expect(await linesOf(catchUp.id)).toHaveLength(3);
    });

    it('lets only one of two runs at once bill', async () => {
      const once = await create(input({ nameBn: 'একবার', amount: '10', frequencyMonths: null, scopeLocationId: ids.building9, unitTypes: ['residential'] }));
      await only([once.id], async () => {
        const results = await Promise.all([run(), run()]);
        expect(results.map((r) => r.invoiceCount).sort((a, b) => a - b)).toEqual([0, 2]);
      });
      expect(await linesOf(once.id)).toHaveLength(2);
      const ended = scheduleListSchema.parse((await get('/schedules').expect(200)).body).items.find((s) => s.id === once.id);
      expect(ended).toMatchObject({ status: 'ended', nextRunOn: null });
    });

    it('keeps nothing from a failed run, and records it', async () => {
      const failing = await create(input({ nameBn: 'ব্যর্থ', amount: '5', scopeLocationId: ids.blockD }));
      const numbering = app.get(NumberingService);
      const spy = vi.spyOn(numbering, 'reserve').mockRejectedValueOnce(new Error('disk full'));
      await only([failing.id], async () => {
        await send('post', '/billing-runs').send({ month: M() }).expect(500);
      });
      spy.mockRestore();
      expect(await linesOf(failing.id)).toHaveLength(0);
      const failed = await prisma.billing_runs.findFirstOrThrow({ where: { society_id: societyId, status: 'failed' } });
      expect(failed.error).toBe('disk full');
      const still = await prisma.charge_schedules.findUniqueOrThrow({ where: { id: failing.id } });
      expect(isoDate(still.next_run_on!)).toBe(first(M()));
    });
  });

  describe('changing schedules', () => {
    it('skips the months of a pause', async () => {
      const paused = await create(input({ nameBn: 'বিরতি', amount: '7', scopeLocationId: ids.blockD }));
      await send('post', `/schedules/${paused.id}/pause`).expect(200);
      await prisma.charge_schedules.update({ where: { id: paused.id }, data: { next_run_on: new Date(`${first(monthsAgo(3))}T00:00:00Z`) } });
      expect((await preview()).schedules.some((s) => s.id === paused.id)).toBe(false);
      const resumed = scheduleSchema.parse((await send('post', `/schedules/${paused.id}/resume`).expect(200)).body);
      expect(resumed).toMatchObject({ status: 'active', nextRunOn: first(M()) });
    });

    it('fixes the charge, frequency and start once billed; ends for good', async () => {
      const { id } = schedules.service;
      const fixed = await send('put', `/schedules/${id}`).send(input({ nameBn: 'সার্ভিস চার্জ', chargeTypeId: ids.generator })).expect(409);
      expect(fixed.body.code).toBe('schedule_in_use');
      const repriced = scheduleSchema.parse(
        (await send('put', `/schedules/${id}`).send(input({ nameBn: 'সার্ভিস চার্জ', amount: '1600', unitTypes: ['residential'], generation: 'auto' })).expect(200)).body,
      );
      expect(repriced).toMatchObject({ amount: '1600.00', rates: [], nextRunOn: addMonths(first(M()), 1) });
      const ended = scheduleSchema.parse((await send('post', `/schedules/${id}/end`).expect(200)).body);
      expect(ended).toMatchObject({ status: 'ended', nextRunOn: null });
      const after = await send('put', `/schedules/${id}`).send(input()).expect(409);
      expect(after.body.code).toBe('schedule_ended');
      await send('post', `/schedules/${randomUUID()}/end`).expect(404);
    });
  });
});
