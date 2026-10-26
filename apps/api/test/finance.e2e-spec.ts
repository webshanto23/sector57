import { INestApplication } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  AUTH_COOKIES,
  CSRF_HEADER,
  chargeTypeListSchema,
  chargeTypeSchema,
  defaultLogoMark,
  fundListSchema,
  fundSchema,
  societySettingsSchema,
  type Fund,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { NumberingService } from './../src/finance/numbering.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-finance-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `015${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

/**
 * Ledger rows can never be deleted, so this file serves a society of its own (through
 * DEFAULT_SOCIETY_SLUG) and removes it at the end: the trigger lets the cascade from a
 * society delete through, and nothing is left behind in the seeded society.
 */
describe('Finance setup (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let otherSocietyId: string;
  let defaultFundId: string;
  let blockId: string;
  const server = () => app.getHttpServer();
  const users = {} as Record<'admin' | 'viewer' | 'nobody' | 'blockBilling', string>;

  async function makeRole(permissions: string[]) {
    const rows = await prisma.permissions.findMany();
    const role = await prisma.roles.create({ data: { society_id: societyId, name: `${MARK}-${randomUUID()}` } });
    await prisma.role_permissions.createMany({
      data: permissions.map((name) => ({ role_id: role.id, permission_id: rows.find((p) => `${p.module}:${p.action}` === name)!.id })),
    });
    return role.id;
  }

  async function makeUser(permissions: string[], scope: string | null = null) {
    const phone = randomPhone();
    const user = await prisma.users.create({ data: { society_id: societyId, phone, status: 'active' } });
    if (permissions.length) {
      await prisma.user_roles.create({ data: { user_id: user.id, role_id: await makeRole(permissions), scope_location_id: scope } });
    }
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId, sessionId: randomUUID() });
    return `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}`;
  }

  const send = (method: 'post' | 'put' | 'patch' | 'delete', url: string, cookie = users.admin) =>
    request(server())[method](url).set('Cookie', cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const get = (url: string, cookie = users.admin) => request(server()).get(url).set('Cookie', cookie);

  const funds = async () => fundListSchema.parse((await get('/funds').expect(200)).body);
  const fund = async (id: string): Promise<Fund> => (await funds()).items.find((item) => item.id === id)!;
  const addFund = async (nameBn: string) => fundSchema.parse((await send('post', '/funds').send({ nameBn, nameEn: null }).expect(201)).body);
  const setSettings = (body: object, cookie = users.admin) => send('patch', '/settings', cookie).send(body);
  const chargeType = (fundId: string, extra: object = {}) => ({
    nameBn: `চার্জ ${randomUUID().slice(0, 8)}`,
    nameEn: null,
    kind: 'due',
    fundId,
    defaultAmount: null,
    ...extra,
  });

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    // The society exists before the app starts, so the app can serve it.
    const { PrismaPg, PrismaClient } = await import('@s57/db');
    const setup = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    const society = await setup.societies.create({ data: { name_bn: `সমিতি ${MARK}`, slug: MARK, phone: '01700000000' } });
    await setup.$disconnect();
    societyId = society.id;

    app = await createTestApp([], { DEFAULT_SOCIETY_SLUG: MARK });
    prisma = app.get(PrismaService);
    defaultFundId = (await prisma.funds.create({ data: { society_id: societyId, name_bn: 'সাধারণ তহবিল', is_default: true } })).id;
    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: `${MARK}-other` } })).id;

    const level = await prisma.location_levels.create({ data: { society_id: societyId, depth: 1, name_bn: 'ব্লক' } });
    const block = await prisma.locations.create({ data: { society_id: societyId, level_id: level.id, name: 'ব্লক সি', path: '/' } });
    await prisma.locations.update({ where: { id: block.id }, data: { path: `/${block.id}/` } });
    blockId = block.id;

    const everything = (await prisma.permissions.findMany()).map((p) => `${p.module}:${p.action}`);
    users.admin = await makeUser(everything);
    users.viewer = await makeUser(['settings:view', 'ledger:view', 'billing:view']);
    users.nobody = await makeUser([]);
    users.blockBilling = await makeUser(['billing:view', 'billing:create', 'billing:edit'], blockId);
  });

  afterAll(async () => {
    if (!prisma) return;
    // Scoped grants point at a location, which the cascade removes first; locations also
    // refuse a cascade while children exist (this file makes only one).
    await prisma.user_roles.deleteMany({ where: { users_user_roles_user_idTousers: { society_id: societyId } } });
    await prisma.societies.deleteMany({ where: { id: { in: [societyId, otherSocietyId] } } });
    await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
    await app.close();
  });

  describe('settings', () => {
    it('needs the settings permissions', async () => {
      await get('/settings', users.nobody).expect(403);
      await setSettings({ separateFacilityFunds: true }, users.viewer).expect(403);
    });

    it('starts from the defaults and the society name on receipts', async () => {
      const settings = societySettingsSchema.parse((await get('/settings', users.viewer).expect(200)).body);
      expect(settings).toMatchObject({
        shareRentersWithThana: false,
        separateFacilityFunds: false,
        fiscalYearStartMonth: 7,
        fiscalYearLocked: false,
        receiptHeader: { nameBn: `সমিতি ${MARK}`, phone: '01700000000' },
      });
    });

    it('refuses unknown keys', async () => {
      const res = await setSettings({ moduleHrmEnabled: true }).expect(400);
      expect(res.body.code).toBe('validation_failed');
    });

    it('saves only what is sent, and audits it', async () => {
      const header = { nameBn: ' উত্তরা সেক্টর ১৫ কল্যাণ সমিতি ', nameEn: 'Sector 15', addressBn: 'রোড ৯', addressEn: '', phone: '01711000057' };
      const res = await setSettings({ shareRentersWithThana: true, receiptHeader: header, fiscalYearStartMonth: 1 }).expect(200);
      expect(societySettingsSchema.parse(res.body)).toMatchObject({
        shareRentersWithThana: true,
        separateFacilityFunds: false,
        fiscalYearStartMonth: 1,
        receiptHeader: { nameBn: 'উত্তরা সেক্টর ১৫ কল্যাণ সমিতি', addressEn: null },
      });
      const audit = await prisma.audit_logs.findFirstOrThrow({ where: { society_id: societyId, entity_type: 'society_settings' } });
      expect(audit.before_data).toMatchObject({ shareRentersWithThana: false, fiscalYearStartMonth: 7 });
      expect(Object.keys(audit.after_data as object).sort()).toEqual(['fiscalYearStartMonth', 'receiptHeader', 'shareRentersWithThana']);
      await setSettings({ fiscalYearStartMonth: 7 }).expect(200);
    });

    it('saves the bill paper choices and the new header contacts', async () => {
      const bill = { default: 'a5', offered: ['a4', 'a5'], noteBn: ' বিল রাখুন।\nভুল হলে জানান। ', noteEn: '' };
      for (const [wrong, code] of [
        [{ ...bill, offered: ['a4', 'thermal80'] }, 'print_format_unsupported'],
        [{ ...bill, offered: ['a4'] }, 'print_default_not_offered'],
      ] as const) {
        const res = await setSettings({ printFormats: { bill: wrong } }).expect(400);
        expect(JSON.stringify(res.body)).toContain(code);
      }
      expect((await setSettings({ receiptHeader: { nameBn: 'সমিতি', email: 'office@' } }).expect(400)).body.code).toBe('validation_failed');

      const header = { nameBn: 'সমিতি', email: 'office@sector15.org', regNo: 'DSS-1234/2019', officeHoursBn: 'শনি–বৃহস্পতি, সকাল ১০টা–সন্ধ্যা ৬টা' };
      const res = await setSettings({ printFormats: { bill }, receiptHeader: header }).expect(200);
      expect(societySettingsSchema.parse(res.body)).toMatchObject({
        printFormats: { bill: { default: 'a5', offered: ['a4', 'a5'], noteBn: 'বিল রাখুন।\nভুল হলে জানান।', noteEn: null } },
        receiptHeader: { email: 'office@sector15.org', regNo: 'DSS-1234/2019', officeHoursEn: null, phone: null },
      });
      await setSettings({ printFormats: { bill: { default: 'a4', offered: ['a4', 'a5'] } } }).expect(200);
    });

    it('edits the society profile, which the public header reads', async () => {
      const name = `সমিতি ${MARK}`;
      const before = societySettingsSchema.parse((await get('/settings', users.viewer).expect(200)).body);
      expect(before.profile).toEqual({ nameBn: name, nameEn: null, mark: defaultLogoMark(name), placeBn: null, placeEn: null });
      expect((await request(server()).get('/society').expect(200)).body).toMatchObject({ nameBn: name, mark: defaultLogoMark(name) });

      const profile = { nameBn: ' উত্তরা সেক্টর ১৫ কল্যাণ সমিতি ', nameEn: '', mark: '১৫', placeBn: 'উত্তরা, ঢাকা', placeEn: 'Uttara, Dhaka' };
      await setSettings({ profile }, users.viewer).expect(403);
      expect((await setSettings({ profile: { ...profile, mark: 'ABCD' } }).expect(400)).body.code).toBe('validation_failed');
      const res = await setSettings({ profile }).expect(200);
      expect(societySettingsSchema.parse(res.body).profile).toEqual({ ...profile, nameBn: 'উত্তরা সেক্টর ১৫ কল্যাণ সমিতি', nameEn: null });

      // The cached society is dropped, so the website sees the change at once.
      expect((await request(server()).get('/society').expect(200)).body).toMatchObject({
        nameBn: 'উত্তরা সেক্টর ১৫ কল্যাণ সমিতি',
        nameEn: null,
        mark: '১৫',
        placeBn: 'উত্তরা, ঢাকা',
        placeEn: 'Uttara, Dhaka',
      });
      const audit = await prisma.audit_logs.findFirstOrThrow({
        where: { society_id: societyId, entity_type: 'society_settings' },
        orderBy: { created_at: 'desc' },
      });
      expect(audit.before_data).toMatchObject({ profile: { nameBn: name } });

      await setSettings({ profile: { nameBn: name, mark: defaultLogoMark(name) } }).expect(200);
    });
  });

  describe('funds', () => {
    let mosque: Fund;

    it('lists the default fund, with no money yet', async () => {
      const list = await funds();
      expect(list.separateFunds).toBe(false);
      expect(list.items).toHaveLength(1);
      expect(list.items[0]).toMatchObject({ id: defaultFundId, isDefault: true, balance: { cash: '0.00', bank: '0.00', total: '0.00' }, opening: null, openingEditable: true });
      await get('/funds', users.nobody).expect(403);
    });

    it('adds funds only while separate facility funds are on', async () => {
      const off = await send('post', '/funds').send({ nameBn: 'মসজিদ তহবিল', nameEn: 'Mosque fund' }).expect(409);
      expect(off.body.code).toBe('separate_funds_off');
      await setSettings({ separateFacilityFunds: true }).expect(200);
      mosque = await addFund('মসজিদ তহবিল');
      const taken = await send('post', '/funds').send({ nameBn: 'মসজিদ তহবিল' }).expect(409);
      expect(taken.body.code).toBe('fund_name_taken');
      await send('post', '/funds', users.viewer).send({ nameBn: 'জিম' }).expect(403);
    });

    it('records the opening balance exactly, in cash and at the bank', async () => {
      const res = await send('put', `/funds/${mosque.id}/opening`).send({ date: '2026-07-01', cash: '0.10', bank: '০.২০' }).expect(200);
      expect(fundSchema.parse(res.body)).toMatchObject({
        balance: { cash: '0.10', bank: '0.20', total: '0.30' },
        opening: { date: '2026-07-01', cash: '0.10', bank: '0.20' },
      });
      const future = await send('put', `/funds/${mosque.id}/opening`).send({ date: '2999-01-01', cash: '1', bank: '0' }).expect(400);
      expect(future.body.code).toBe('future_date');
    });

    it('corrects the opening with reversing rows, never by editing', async () => {
      const res = await send('put', `/funds/${mosque.id}/opening`).send({ date: '2026-07-02', cash: '৫,০০০', bank: '0' }).expect(200);
      expect(fundSchema.parse(res.body)).toMatchObject({
        balance: { cash: '5000.00', bank: '0.00', total: '5000.00' },
        opening: { date: '2026-07-02', cash: '5000.00', bank: '0.00' },
      });
      const rows = await prisma.ledger_entries.findMany({ where: { fund_id: mosque.id }, orderBy: { id: 'asc' } });
      expect(rows.map((r) => [r.direction, r.account, r.amount.toFixed(2), r.reverses_id === null])).toEqual([
        ['in', 'cash', '0.10', true],
        ['in', 'bank', '0.20', true],
        ['out', 'cash', '0.10', false],
        ['out', 'bank', '0.20', false],
        ['in', 'cash', '5000.00', true],
      ]);
      expect(rows[2]!.reverses_id).toBe(rows[0]!.id);
      expect(rows.every((r) => r.source_type === 'opening' && r.created_by !== null)).toBe(true);
    });

    it('locks the opening once other entries arrive, and the fiscal year with it', async () => {
      await prisma.ledger_entries.create({
        data: { society_id: societyId, fund_id: mosque.id, entry_date: new Date('2026-08-01'), direction: 'in', amount: new Prisma.Decimal('100.05'), source_type: 'donation', source_id: randomUUID() },
      });
      expect(await fund(mosque.id)).toMatchObject({ openingEditable: false, balance: { cash: '5100.05' } });
      const locked = await send('put', `/funds/${mosque.id}/opening`).send({ date: '2026-07-01', cash: '1', bank: '0' }).expect(409);
      expect(locked.body.code).toBe('opening_locked');

      const settings = societySettingsSchema.parse((await get('/settings').expect(200)).body);
      expect(settings.fiscalYearLocked).toBe(true);
      expect((await setSettings({ fiscalYearStartMonth: 1 }).expect(409)).body.code).toBe('fiscal_year_locked');
      await setSettings({ fiscalYearStartMonth: 7 }).expect(200);
    });

    it('closes only an empty fund that nothing bills into', async () => {
      expect((await send('post', `/funds/${mosque.id}/close`).expect(409)).body.code).toBe('fund_not_empty');
      expect((await send('post', `/funds/${defaultFundId}/close`).expect(409)).body.code).toBe('fund_default');

      const gym = await addFund('জিম তহবিল');
      const charge = chargeTypeSchema.parse((await send('post', '/charge-types').send(chargeType(gym.id)).expect(201)).body);
      expect((await send('post', `/funds/${gym.id}/close`).expect(409)).body.code).toBe('fund_in_use');
      await send('post', `/charge-types/${charge.id}/archive`).expect(200);
      const closed = fundSchema.parse((await send('post', `/funds/${gym.id}/close`).expect(200)).body);
      expect(closed.closedAt).not.toBeNull();
      expect((await send('post', `/charge-types/${charge.id}/restore`).expect(409)).body.code).toBe('fund_closed');
      expect((await send('put', `/funds/${gym.id}/opening`).send({ date: '2026-07-01', cash: '1', bank: '0' }).expect(409)).body.code).toBe('fund_closed');
    });

    it('keeps separate funds on while another fund is open', async () => {
      expect((await setSettings({ separateFacilityFunds: false }).expect(409)).body.code).toBe('funds_open');
    });

    it('has no delete route', async () => {
      await send('delete', `/funds/${mosque.id}`).expect(404);
    });
  });

  describe('the ledger is append-only', () => {
    it('refuses updates, deletes and truncation in the database itself', async () => {
      const row = await prisma.ledger_entries.findFirstOrThrow({ where: { society_id: societyId } });
      await expect(prisma.ledger_entries.update({ where: { id: row.id }, data: { amount: new Prisma.Decimal('1') } })).rejects.toThrow(/append-only/);
      await expect(prisma.ledger_entries.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
      await expect(prisma.$executeRawUnsafe('TRUNCATE ledger_entries')).rejects.toThrow(/append-only/);
      expect(await prisma.ledger_entries.count({ where: { id: row.id } })).toBe(1);
    });
  });

  describe('charge types', () => {
    it('lists them with the open funds to choose from', async () => {
      const list = chargeTypeListSchema.parse((await get('/charge-types', users.viewer).expect(200)).body);
      expect(list.separateFunds).toBe(true);
      expect(list.funds.map((f) => f.nameBn)).toEqual(['সাধারণ তহবিল', 'মসজিদ তহবিল']);
      await get('/charge-types', users.nobody).expect(403);
    });

    it('stores the default amount exactly, from Bangla digits', async () => {
      const res = await send('post', '/charge-types').send(chargeType(defaultFundId, { nameBn: 'সার্ভিস চার্জ', kind: 'due', defaultAmount: '২,৫০০.৫' })).expect(201);
      expect(chargeTypeSchema.parse(res.body)).toMatchObject({ nameBn: 'সার্ভিস চার্জ', defaultAmount: '2500.50', fund: { id: defaultFundId }, archived: false });
      const taken = await send('post', '/charge-types').send(chargeType(defaultFundId, { nameBn: 'সার্ভিস চার্জ' })).expect(409);
      expect(taken.body.code).toBe('charge_type_name_taken');
      expect((await send('post', '/charge-types').send(chargeType(defaultFundId, { defaultAmount: '0' })).expect(400)).body.code).toBe('validation_failed');
    });

    it('edits the whole charge type and audits before and after', async () => {
      const created = chargeTypeSchema.parse((await send('post', '/charge-types').send(chargeType(defaultFundId)).expect(201)).body);
      const res = await send('put', `/charge-types/${created.id}`).send(chargeType(defaultFundId, { nameBn: 'জরিমানা', kind: 'fine', defaultAmount: '200' })).expect(200);
      expect(chargeTypeSchema.parse(res.body)).toMatchObject({ nameBn: 'জরিমানা', kind: 'fine', defaultAmount: '200.00' });
      const audit = await prisma.audit_logs.findFirstOrThrow({ where: { entity_type: 'charge_type', entity_id: created.id, action: 'update' } });
      expect(audit.before_data).toMatchObject({ nameBn: created.nameBn, kind: 'due' });
    });

    it('lets an area-scoped billing role read them but not change them', async () => {
      await get('/charge-types', users.blockBilling).expect(200);
      const res = await send('post', '/charge-types', users.blockBilling).send(chargeType(defaultFundId)).expect(403);
      expect(res.body.code).toBe('beyond_your_permissions');
    });

    it('bills only into the default fund while separate funds are off', async () => {
      const temp = await addFund('অস্থায়ী তহবিল');
      await send('post', `/funds/${temp.id}/close`).expect(200);
      // Mosque still holds money, so turn separate funds off directly for this check.
      await prisma.society_settings.update({ where: { society_id_key: { society_id: societyId, key: 'separate_facility_funds' } }, data: { value: false } });
      const mosqueId = (await funds()).items.find((f) => f.nameBn === 'মসজিদ তহবিল')!.id;
      const res = await send('post', '/charge-types').send(chargeType(mosqueId)).expect(400);
      expect(res.body.code).toBe('invalid_fund');
      const list = chargeTypeListSchema.parse((await get('/charge-types').expect(200)).body);
      expect(list.funds.map((f) => f.id)).toEqual([defaultFundId]);
      await prisma.society_settings.update({ where: { society_id_key: { society_id: societyId, key: 'separate_facility_funds' } }, data: { value: true } });
    });
  });

  describe('society boundary', () => {
    it("never shows or changes another society's funds and charge types", async () => {
      const foreignFund = await prisma.funds.create({ data: { society_id: otherSocietyId, name_bn: 'বিদেশি তহবিল', is_default: true } });
      const foreignCharge = await prisma.charge_types.create({ data: { society_id: otherSocietyId, name_bn: 'বিদেশি চার্জ', kind: 'due', fund_id: foreignFund.id } });

      expect((await funds()).items.some((f) => f.id === foreignFund.id)).toBe(false);
      const charges = chargeTypeListSchema.parse((await get('/charge-types').expect(200)).body);
      expect(charges.items.some((c) => c.id === foreignCharge.id)).toBe(false);

      await send('put', `/funds/${foreignFund.id}`).send({ nameBn: 'x' }).expect(404);
      await send('post', `/funds/${foreignFund.id}/close`).expect(404);
      await send('put', `/funds/${foreignFund.id}/opening`).send({ date: '2026-07-01', cash: '1', bank: '0' }).expect(404);
      await send('put', `/charge-types/${foreignCharge.id}`).send(chargeType(defaultFundId)).expect(404);
      await send('post', `/charge-types/${foreignCharge.id}/archive`).expect(404);
      expect((await send('post', '/charge-types').send(chargeType(foreignFund.id)).expect(400)).body.code).toBe('invalid_fund');
      expect(await prisma.ledger_entries.count({ where: { fund_id: foreignFund.id } })).toBe(0);
    });
  });

  describe('numbering', () => {
    const next = (kind: 'invoice' | 'receipt' | 'voucher', day: string) =>
      prisma.$transaction((tx) => app.get(NumberingService).next(tx, societyId, kind, day));

    it('gives concurrent saves distinct numbers without gaps', async () => {
      const numbers = await Promise.all(Array.from({ length: 6 }, () => next('receipt', '2026-10-11')));
      expect(numbers.map((n) => n.no).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(new Set(numbers.map((n) => n.formatted)).size).toBe(6);
    });

    it('gives the number back when the save fails', async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          await app.get(NumberingService).next(tx, societyId, 'receipt', '2026-10-11');
          throw new Error('save failed');
        }),
      ).rejects.toThrow('save failed');
      expect((await next('receipt', '2026-10-12')).formatted).toBe('RC-00007');
    });

    it('restarts invoices each month and vouchers each fiscal year', async () => {
      expect((await next('invoice', '2026-10-31')).formatted).toBe('INV-2610-0001');
      expect((await next('invoice', '2026-10-01')).formatted).toBe('INV-2610-0002');
      expect((await next('invoice', '2026-11-01')).formatted).toBe('INV-2611-0001');
      expect((await next('voucher', '2027-06-30')).formatted).toBe('EXP-26-0001');
      expect((await next('voucher', '2027-07-01')).formatted).toBe('EXP-27-0001');
    });
  });
});
