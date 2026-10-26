import { INestApplication } from '@nestjs/common';
import {
  addDays,
  assetDetailSchema,
  assetListSchema,
  AUTH_COOKIES,
  CSRF_HEADER,
  custodianListSchema,
  documentListSchema,
  facilityDetailSchema,
  facilityFundsSchema,
  facilityListSchema,
  maintenanceDueSchema,
  monthsAfter,
  SETTING_KEYS,
  type AssetDetail,
  type FacilityDetail,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-facilities-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const pdf = () => Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer\n%%EOF\n', 'latin1');
const dhakaToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

type Caller = { cookie: string; id: string };
type Grant = [permissions: string[], scope: string | null];

/**
 * Facilities, assets and upkeep, in a society of its own. The sector holds Block C and Block D.
 * A guard is posted at the sector, Kalam in Block C and Jamal in Block D. The Block C office
 * may add and change things in Block C; its supervisor may only look.
 */
describe('Facilities and assets (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let otherSocietyId: string;
  const server = () => app.getHttpServer();
  const users = {} as Record<'admin' | 'officeC' | 'supervisorC' | 'nobody', Caller>;
  const ids = {} as Record<'sector' | 'blockC' | 'blockD' | 'guard' | 'kalam' | 'jamal' | 'fund' | 'defaultFund' | 'vendor' | 'otherAsset', string>;
  const facility = {} as Record<'hall' | 'pumpHouse', FacilityDetail>;
  const asset = {} as Record<'chairs' | 'pump' | 'lamp', AssetDetail>;
  const today = dhakaToday();

  async function makeUser(grants: Grant[]): Promise<Caller> {
    const rows = await prisma.permissions.findMany();
    const user = await prisma.users.create({ data: { society_id: societyId, phone: randomPhone(), status: 'active' } });
    for (const [permissions, scope] of grants) {
      const role = await prisma.roles.create({ data: { society_id: societyId, name: `${MARK}-${randomUUID()}` } });
      await prisma.role_permissions.createMany({
        data: permissions.map((name) => ({ role_id: role.id, permission_id: rows.find((p) => `${p.module}:${p.action}` === name)!.id })),
      });
      await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.id, scope_location_id: scope } });
    }
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId, sessionId: randomUUID() });
    return { cookie: `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}`, id: user.id };
  }

  const send = (method: 'post' | 'patch' | 'delete', url: string, caller = users.admin) =>
    request(server())[method](url).set('Cookie', caller.cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const get = (url: string, caller = users.admin) => request(server()).get(url).set('Cookie', caller.cookie);
  const assetOf = async (id: string, caller = users.admin) => assetDetailSchema.parse((await get(`/assets/${id}`, caller).expect(200)).body);

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { PrismaPg, PrismaClient } = await import('@s57/db');
    const setup = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    societyId = (await setup.societies.create({ data: { name_bn: `সমিতি ${MARK}`, slug: MARK } })).id;
    await setup.$disconnect();

    app = await createTestApp([], { DEFAULT_SOCIETY_SLUG: MARK });
    prisma = app.get(PrismaService);

    const level = (depth: number, name_bn: string) => prisma.location_levels.create({ data: { society_id: societyId, depth, name_bn } }).then((r) => r.id);
    const sectorLevel = await level(1, 'সেক্টর');
    const blockLevel = await level(2, 'ব্লক');
    const place = async (levelId: string, name: string, parent: { id: string; path: string } | null) => {
      const id = randomUUID();
      const path = `${parent?.path ?? '/'}${id}/`;
      await prisma.locations.create({ data: { id, society_id: societyId, level_id: levelId, parent_id: parent?.id ?? null, name, path } });
      return { id, path };
    };
    const sector = await place(sectorLevel, 'সেক্টর ১৫', null);
    ids.sector = sector.id;
    ids.blockC = (await place(blockLevel, 'ব্লক সি', sector)).id;
    ids.blockD = (await place(blockLevel, 'ব্লক ডি', sector)).id;

    const worker = async (name: string, staffNo: number, post: string) => {
      const person = await prisma.persons.create({ data: { society_id: societyId, full_name: name } });
      const row = await prisma.staff.create({
        data: { society_id: societyId, person_id: person.id, staff_no: staffNo, designation_bn: 'প্রহরী', kind: 'permanent', posted_location_id: post, joined_on: day('2026-01-01') },
      });
      return row.id;
    };
    ids.guard = await worker('সেক্টর প্রহরী', 1, ids.sector);
    ids.kalam = await worker('কালাম', 2, ids.blockC);
    ids.jamal = await worker('জামাল', 3, ids.blockD);

    ids.defaultFund = (await prisma.funds.create({ data: { society_id: societyId, name_bn: 'সাধারণ তহবিল', is_default: true } })).id;
    ids.fund = (await prisma.funds.create({ data: { society_id: societyId, name_bn: 'মসজিদ তহবিল', name_en: 'Mosque fund' } })).id;
    ids.vendor = (await prisma.vendors.create({ data: { society_id: societyId, name: 'আলম ইলেকট্রিক' } })).id;

    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: `${MARK}-other` } })).id;
    const otherLevel = await prisma.location_levels.create({ data: { society_id: otherSocietyId, depth: 1, name_bn: 'ব্লক' } });
    const otherPlaceId = randomUUID();
    await prisma.locations.create({ data: { id: otherPlaceId, society_id: otherSocietyId, level_id: otherLevel.id, name: 'ব্লক এ', path: `/${otherPlaceId}/` } });
    ids.otherAsset = (
      await prisma.assets.create({ data: { society_id: otherSocietyId, asset_no: 'AST-0001', name_bn: 'অন্য পাম্প', category: 'পাম্প', location_id: otherPlaceId } })
    ).id;

    const everything = (await prisma.permissions.findMany()).map((p) => `${p.module}:${p.action}`);
    users.admin = await makeUser([[everything, null]]);
    users.officeC = await makeUser([
      [['facilities:view', 'facilities:create', 'facilities:edit'], ids.blockC],
      [['documents:view', 'documents:create', 'documents:edit'], null],
    ]);
    users.supervisorC = await makeUser([
      [['facilities:view'], ids.blockC],
      [['documents:view', 'documents:create'], null],
    ]);
    users.nobody = await makeUser([]);
  });

  afterAll(async () => {
    if (!prisma) return;
    const societies = { in: [societyId, otherSocietyId] };
    await prisma.documents.deleteMany({ where: { society_id: societies } });
    await prisma.asset_events.deleteMany({ where: { society_id: societies } });
    await prisma.asset_maintenance_plans.deleteMany({ where: { society_id: societies } });
    await prisma.assets.deleteMany({ where: { society_id: societies } });
    await prisma.facilities.deleteMany({ where: { society_id: societies } });
    await prisma.expenses.deleteMany({ where: { society_id: societies } });
    await prisma.expense_heads.deleteMany({ where: { society_id: societies } });
    await prisma.vendors.deleteMany({ where: { society_id: societies } });
    await prisma.funds.deleteMany({ where: { society_id: societies } });
    await prisma.staff.deleteMany({ where: { society_id: societies } });
    await prisma.persons.deleteMany({ where: { society_id: societies } });
    await prisma.user_roles.deleteMany({ where: { users_user_roles_user_idTousers: { society_id: societyId } } });
    for (const depth of [2, 1]) await prisma.locations.deleteMany({ where: { society_id: societies, location_levels: { depth } } });
    await prisma.societies.deleteMany({ where: { id: societies } });
    await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
    await app.close();
  });

  describe('facilities', () => {
    it('adds facilities, with their own fund only while separate funds are on', async () => {
      const add = (body: object, caller = users.admin) => send('post', '/facilities', caller).send(body);
      facility.hall = facilityDetailSchema.parse(
        (await add({ locationId: ids.blockC, nameBn: ' কমিউনিটি হল ', nameEn: 'Community hall', kind: 'hall', bookable: true }).expect(201)).body,
      );
      expect(facility.hall).toMatchObject({ name: { bn: 'কমিউনিটি হল' }, kind: 'hall', bookable: true, fund: null, assets: 0, place: { id: ids.blockC } });
      expect((await add({ locationId: ids.blockD, nameBn: 'কমিউনিটি হল', kind: 'hall' }).expect(409)).body.code).toBe('facility_name_taken');

      const pump = { locationId: ids.blockD, nameBn: 'পাম্প ঘর', kind: 'water_pump', fundId: ids.fund };
      expect((await add(pump).expect(409)).body.code).toBe('separate_funds_off');
      expect(facilityFundsSchema.parse((await get('/facilities/funds').expect(200)).body)).toEqual({ separateFunds: false, funds: [] });

      await prisma.society_settings.create({ data: { society_id: societyId, key: SETTING_KEYS.separateFacilityFunds, value: true } });
      const funds = facilityFundsSchema.parse((await get('/facilities/funds').expect(200)).body);
      expect(funds.funds.map((fund) => fund.id)).toEqual([ids.fund]);
      expect((await add({ ...pump, fundId: ids.defaultFund }).expect(409)).body.code).toBe('fund_default');
      facility.pumpHouse = facilityDetailSchema.parse((await add(pump).expect(201)).body);
      expect(facility.pumpHouse.fund).toMatchObject({ id: ids.fund, name: { en: 'Mosque fund' } });
      expect(await prisma.audit_logs.count({ where: { society_id: societyId, entity_type: 'facility', action: 'create' } })).toBe(2);
    });

    it('keeps area offices to their area', async () => {
      const listed = facilityListSchema.parse((await get('/facilities', users.officeC).expect(200)).body);
      expect(listed.items.map((row) => row.id)).toEqual([facility.hall.id]);
      expect(listed.can.create).toBe(true);
      await get(`/facilities/${facility.pumpHouse.id}`, users.officeC).expect(404);
      // A place outside the area looks missing; one seen but not granted is refused.
      await send('post', '/facilities', users.officeC).send({ locationId: ids.blockD, nameBn: 'অফিস', kind: 'office' }).expect(404);
      await send('post', '/facilities', users.supervisorC).send({ locationId: ids.blockC, nameBn: 'অফিস', kind: 'office' }).expect(403);
      await send('patch', `/facilities/${facility.hall.id}`, users.supervisorC).send({ bookable: false }).expect(403);
      await get('/facilities', users.nobody).expect(403);
      const seen = facilityDetailSchema.parse((await get(`/facilities/${facility.hall.id}`, users.supervisorC).expect(200)).body);
      expect(seen.can).toEqual({ edit: false, archive: false, addAsset: false });
    });
  });

  describe('assets', () => {
    it('numbers assets in order, at a facility or straight on a place', async () => {
      const add = (body: object, caller = users.admin) => send('post', '/assets', caller).send(body);
      asset.chairs = assetDetailSchema.parse(
        (
          await add({
            nameBn: 'প্লাস্টিক চেয়ার (৫০টি)',
            category: 'আসবাব',
            place: { facilityId: facility.hall.id },
            custodianStaffId: ids.kalam,
            purchasedOn: '2026-03-01',
            purchaseCost: '১২,৫০০',
            vendorId: ids.vendor,
            warrantyUntil: '2027-03-01',
          }).expect(201)
        ).body,
      );
      expect(asset.chairs).toMatchObject({
        assetNo: 'AST-0001',
        status: 'in_use',
        facility: { id: facility.hall.id },
        place: { id: ids.blockC },
        custodian: { id: ids.kalam, name: 'কালাম' },
        purchaseCost: '12500.00',
        vendor: { id: ids.vendor },
      });
      expect(asset.chairs.history.map((event) => event.kind)).toEqual(['created']);
      expect(asset.chairs.can).toEqual({ edit: true, statuses: ['repair', 'retired', 'lost'] });

      asset.pump = assetDetailSchema.parse((await add({ nameBn: 'পানির পাম্প', category: 'পাম্প', place: { facilityId: facility.pumpHouse.id } }).expect(201)).body);
      asset.lamp = assetDetailSchema.parse((await add({ nameBn: 'রাস্তার বাতি', category: 'বাতি', place: { locationId: ids.blockC } }).expect(201)).body);
      expect([asset.pump.assetNo, asset.lamp.assetNo]).toEqual(['AST-0002', 'AST-0003']);
      expect(asset.lamp.facility).toBeNull();

      expect((await add({ nameBn: 'x', category: 'x', place: {} }).expect(400)).body.code).toBeDefined();
      expect((await add({ nameBn: 'x', category: 'x', place: { locationId: ids.blockC }, purchasedOn: '2026-05-01', warrantyUntil: '2026-04-01' }).expect(400)).body).toBeDefined();
    });

    it('keeps assets to the area, and custodians to staff posted in or above it', async () => {
      const listed = assetListSchema.parse((await get('/assets', users.officeC).expect(200)).body);
      expect(listed.items.map((row) => row.assetNo)).toEqual(['AST-0001', 'AST-0003']);
      expect(listed.counts).toMatchObject({ inUse: 2, repair: 0 });
      expect(listed.categories).toEqual(['আসবাব', 'বাতি']);
      expect(assetListSchema.parse((await get('/assets?q=৩').expect(200)).body).items.map((row) => row.assetNo)).toEqual(['AST-0003']);
      expect(assetListSchema.parse((await get('/assets?q=ast-0002').expect(200)).body).items.map((row) => row.id)).toEqual([asset.pump.id]);
      expect(assetListSchema.parse((await get(`/assets?facilityId=${facility.hall.id}`).expect(200)).body).total).toBe(1);

      await get(`/assets/${asset.pump.id}`, users.officeC).expect(404);
      await get(`/assets/${ids.otherAsset}`).expect(404);
      await send('post', '/assets', users.officeC).send({ nameBn: 'x', category: 'x', place: { facilityId: facility.pumpHouse.id } }).expect(404);
      await send('post', '/assets', users.officeC).send({ nameBn: 'x', category: 'x', place: { locationId: ids.blockD } }).expect(404);

      const custodians = custodianListSchema.parse((await get('/assets/custodians', users.officeC).expect(200)).body);
      expect(custodians.items.map((row) => row.id).sort()).toEqual([ids.guard, ids.kalam].sort());
      await get('/assets/custodians', users.supervisorC).expect(403);
      const jamal = await send('patch', `/assets/${asset.lamp.id}`, users.officeC).send({ custodianStaffId: ids.jamal }).expect(404);
      expect(jamal.body.code).toBe('staff_not_found');

      const handed = assetDetailSchema.parse((await send('patch', `/assets/${asset.lamp.id}`, users.officeC).send({ custodianStaffId: ids.guard, note: 'মোড়ে' }).expect(200)).body);
      expect(handed.custodian?.id).toBe(ids.guard);
      expect(handed.history.map((event) => event.kind)).toEqual(['updated', 'custodian', 'created']);
      expect(handed.history[0]!.detail.fields).toEqual(['note']);
      expect(handed.history[1]!.detail.custodian).toBe('সেক্টর প্রহরী');
    });

    it('links a paid expense by its voucher number', async () => {
      const head = await prisma.expense_heads.create({ data: { society_id: societyId, name_bn: 'যন্ত্রপাতি' } });
      const voucher = `EXP-26-${String(Math.floor(Math.random() * 9000) + 1000)}`;
      await prisma.expenses.create({
        data: {
          society_id: societyId,
          expense_head_id: head.id,
          fund_id: ids.defaultFund,
          description: 'পাম্প কেনা',
          amount: '45000',
          spent_on: day('2026-04-01'),
          status: 'paid',
          approved_by: users.admin.id,
          approved_at: new Date(),
          voucher_no: voucher,
          paid_at: new Date(),
          paid_by: users.admin.id,
          paid_account: 'cash',
          paid_method: 'cash',
        },
      });
      const linked = assetDetailSchema.parse((await send('patch', `/assets/${asset.pump.id}`).send({ expenseVoucherNo: voucher.toLowerCase() }).expect(200)).body);
      expect(linked.expense).toMatchObject({ voucherNo: voucher, amount: '45000.00', open: true });
      expect((await send('patch', `/assets/${asset.pump.id}`).send({ expenseVoucherNo: 'EXP-26-0000' }).expect(404)).body.code).toBe('expense_not_found');
      const cleared = assetDetailSchema.parse((await send('patch', `/assets/${asset.pump.id}`).send({ expenseVoucherNo: '' }).expect(200)).body);
      expect(cleared.expense).toBeNull();
    });

    it('needs an approver to retire, lose or put back an asset', async () => {
      const status = (id: string, body: object, caller = users.admin) => send('post', `/assets/${id}/status`, caller).send(body);
      const repaired = assetDetailSchema.parse((await status(asset.lamp.id, { status: 'repair' }, users.officeC).expect(200)).body);
      expect(repaired.status).toBe('repair');
      expect((await status(asset.lamp.id, { status: 'repair' }, users.officeC).expect(409)).body.code).toBe('asset_status_same');
      await status(asset.lamp.id, { status: 'retired', on: today, reason: 'নষ্ট' }, users.officeC).expect(403);
      await status(asset.lamp.id, { status: 'retired', on: addDays(today, 1), reason: 'নষ্ট' }).expect(400);

      const retired = assetDetailSchema.parse((await status(asset.lamp.id, { status: 'retired', on: today, reason: 'নষ্ট হয়ে গেছে' }).expect(200)).body);
      expect(retired).toMatchObject({ status: 'retired', retiredOn: today, retiredReason: 'নষ্ট হয়ে গেছে' });
      expect(retired.can).toEqual({ edit: false, statuses: ['in_use'] });
      expect((await send('patch', `/assets/${asset.lamp.id}`).send({ note: 'x' }).expect(409)).body.code).toBe('asset_gone');
      expect((await status(asset.lamp.id, { status: 'lost', on: today, reason: 'x' }).expect(409)).body.code).toBe('asset_status_invalid');
      expect(assetListSchema.parse((await get('/assets', users.officeC).expect(200)).body).items.map((row) => row.assetNo)).toEqual(['AST-0001']);
      expect(assetListSchema.parse((await get('/assets?state=retired', users.officeC).expect(200)).body).total).toBe(1);

      const back = assetDetailSchema.parse((await status(asset.lamp.id, { status: 'in_use' }).expect(200)).body);
      expect(back).toMatchObject({ status: 'in_use', retiredOn: null, retiredReason: null });
      expect(back.history.slice(0, 3).map((event) => [event.kind, event.detail.status])).toEqual([
        ['status', 'in_use'],
        ['status', 'retired'],
        ['status', 'repair'],
      ]);
    });

    it('moves the assets with their facility, and archives a facility only once they are gone', async () => {
      expect((await send('post', `/facilities/${facility.pumpHouse.id}/archive`).expect(409)).body.code).toBe('facility_has_assets');
      const moved = facilityDetailSchema.parse((await send('patch', `/facilities/${facility.pumpHouse.id}`).send({ locationId: ids.blockC }).expect(200)).body);
      expect(moved.place.id).toBe(ids.blockC);
      const pump = await assetOf(asset.pump.id, users.officeC);
      expect(pump.place.id).toBe(ids.blockC);
      expect(pump.history[0]).toMatchObject({ kind: 'moved', detail: { place: 'ব্লক সি' } });

      await send('patch', `/assets/${asset.pump.id}`).send({ place: { locationId: ids.blockD } }).expect(200);
      const archived = facilityDetailSchema.parse((await send('post', `/facilities/${facility.pumpHouse.id}/archive`).expect(200)).body);
      expect(archived.archivedAt).not.toBeNull();
      expect(archived.can.edit).toBe(false);
      await send('post', '/assets').send({ nameBn: 'x', category: 'x', place: { facilityId: facility.pumpHouse.id } }).expect(409);
      expect(facilityListSchema.parse((await get('/facilities?state=archived').expect(200)).body).items.map((row) => row.id)).toEqual([facility.pumpHouse.id]);
      await send('post', `/facilities/${facility.pumpHouse.id}/restore`).expect(200);
    });
  });

  describe('upkeep', () => {
    it('lists upkeep due, and moves the next due day on when done', async () => {
      const added = assetDetailSchema.parse(
        (await send('post', `/assets/${asset.chairs.id}/plans`, users.officeC).send({ taskBn: 'পরিষ্কার', everyMonths: 3, nextDueOn: addDays(today, -5) }).expect(201)).body,
      );
      const plan = added.plans[0]!;
      await send('post', `/assets/${asset.lamp.id}/plans`, users.officeC).send({ taskBn: 'বাল্ব দেখা', everyMonths: 6, nextDueOn: addDays(today, 90) }).expect(201);

      const due = maintenanceDueSchema.parse((await get('/assets/maintenance-due', users.supervisorC).expect(200)).body);
      expect(due.items.map((item) => item.plan.id)).toEqual([plan.id]);
      expect(due.items[0]).toMatchObject({ canMark: false, asset: { assetNo: 'AST-0001', custodian: { id: ids.kalam } } });
      expect(maintenanceDueSchema.parse((await get('/assets/maintenance-due?within=120').expect(200)).body).items).toHaveLength(2);
      expect(assetListSchema.parse((await get('/assets', users.officeC).expect(200)).body).counts.due).toBe(1);

      await send('post', `/assets/plans/${plan.id}/done`, users.supervisorC).send({ doneOn: today }).expect(403);
      await send('post', `/assets/plans/${plan.id}/done`, users.officeC).send({ doneOn: addDays(today, 1) }).expect(400);
      const done = assetDetailSchema.parse((await send('post', `/assets/plans/${plan.id}/done`, users.officeC).send({ doneOn: today, note: 'ধোয়া হয়েছে' }).expect(200)).body);
      expect(done.plans.find((row) => row.id === plan.id)).toMatchObject({ lastDoneOn: today, nextDueOn: monthsAfter(today, 3) });
      expect(done.history[0]).toMatchObject({ kind: 'maintenance', note: 'ধোয়া হয়েছে', detail: { task: 'পরিষ্কার', doneOn: today } });
      expect((await send('post', `/assets/plans/${plan.id}/done`, users.officeC).send({ doneOn: addDays(today, -1) }).expect(400)).body.code).toBe('done_before_last');
      expect(maintenanceDueSchema.parse((await get('/assets/maintenance-due', users.officeC).expect(200)).body).items).toHaveLength(0);

      // A plan once done is stopped, not removed.
      const stopped = assetDetailSchema.parse((await send('delete', `/assets/plans/${plan.id}`, users.officeC).expect(200)).body);
      expect(stopped.plans.map((row) => row.id)).not.toContain(plan.id);
      expect(await prisma.asset_maintenance_plans.count({ where: { id: plan.id, archived_at: { not: null } } })).toBe(1);
    });
  });

  describe('papers and CSV', () => {
    it("keeps an asset's papers with it, under the facilities grant where it is kept", async () => {
      const upload = (caller: Caller, fields: Record<string, string>) => {
        let req = send('post', '/documents', caller);
        for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
        return req.attach('file', pdf(), 'paper.pdf');
      };
      await upload(users.officeC, { entityType: 'asset', entityId: asset.chairs.id, docType: 'invoice', title: 'রসিদ' }).expect(201);
      await upload(users.officeC, { entityType: 'asset', entityId: asset.chairs.id, docType: 'nid', title: 'x' }).expect(400);
      await upload(users.officeC, { entityType: 'asset', entityId: asset.pump.id, docType: 'invoice', title: 'x' }).expect(404);
      await upload(users.supervisorC, { entityType: 'asset', entityId: asset.chairs.id, docType: 'warranty', title: 'x' }).expect(403);
      const seen = documentListSchema.parse((await get(`/documents?entityType=asset&entityId=${asset.chairs.id}`, users.supervisorC).expect(200)).body);
      expect(seen.items.map((doc) => doc.docType)).toEqual(['invoice']);
    });

    it('exports the assets', async () => {
      const csv = await get('/assets/csv?state=all&lang=en').expect(200);
      expect(csv.text).toContain('Asset no.');
      expect(csv.text).toContain('AST-0001');
      expect(csv.text).toContain('12500.00');
      await get('/assets/csv', users.officeC).expect(403);
    });
  });
});
