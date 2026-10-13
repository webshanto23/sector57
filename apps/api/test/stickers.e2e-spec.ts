import { INestApplication } from '@nestjs/common';
import {
  AUTH_COOKIES,
  CSRF_HEADER,
  DEFAULT_STICKER_SETTINGS,
  parkingListSchema,
  parkingSlotSchema,
  stickerListSchema,
  stickerRenewResultSchema,
  stickerRowSchema,
  stickerSettingsViewSchema,
  stickerSheetSchema,
  vehicleDetailSchema,
  type StickerRow,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-stickers-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const thisYear = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric' }).format(new Date()));

type Caller = { cookie: string; id: string };

/**
 * Stickers and parking, in a society of its own. Block C has flats C-1 (Rahim owns it) and C-2
 * (Karim rents it); Block D has D-1 (Jamal). The Block C office issues stickers and manages
 * parking there; the Block C cashier may also make bills.
 */
describe('Stickers and parking (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  const server = () => app.getHttpServer();
  const users = {} as Record<'admin' | 'officeC' | 'cashierC' | 'nobody', Caller>;
  const ids = {} as Record<'blockC' | 'c1' | 'c2' | 'd1' | 'rahim' | 'karim' | 'jamal' | 'fee' | 'carC1' | 'carC2' | 'carD1' | 'tenancy', string>;
  const sticker = {} as Record<'c1' | 'c2' | 'd1', StickerRow>;

  async function makeUser(permissions: string[], scope: string | null = null): Promise<Caller> {
    const rows = await prisma.permissions.findMany();
    const user = await prisma.users.create({ data: { society_id: societyId, phone: randomPhone(), status: 'active' } });
    if (permissions.length > 0) {
      const role = await prisma.roles.create({ data: { society_id: societyId, name: `${MARK}-${randomUUID()}` } });
      await prisma.role_permissions.createMany({
        data: permissions.map((name) => ({ role_id: role.id, permission_id: rows.find((p) => `${p.module}:${p.action}` === name)!.id })),
      });
      await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.id, scope_location_id: scope } });
    }
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId, sessionId: randomUUID() });
    return { cookie: `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}`, id: user.id };
  }

  const send = (method: 'post' | 'patch' | 'put', url: string, caller = users.admin) =>
    request(server())[method](url).set('Cookie', caller.cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const get = (url: string, caller = users.admin) => request(server()).get(url).set('Cookie', caller.cookie);
  const row = (res: request.Response) => stickerRowSchema.parse(res.body);
  const issue = (vehicleId: string, caller = users.officeC, nextYear = false) => send('post', '/stickers', caller).send({ vehicleId, nextYear });
  const slot = (res: request.Response) => parkingSlotSchema.parse(res.body);

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { PrismaPg, PrismaClient } = await import('@s57/db');
    const setup = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    societyId = (await setup.societies.create({ data: { name_bn: `সমিতি ${MARK}`, slug: MARK } })).id;
    await setup.$disconnect();

    app = await createTestApp([], { DEFAULT_SOCIETY_SLUG: MARK });
    prisma = app.get(PrismaService);

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
    ids.c1 = await unit('সি-১', c);
    ids.c2 = await unit('সি-২', c);
    ids.d1 = await unit('ডি-১', d);

    const person = (full_name: string) => prisma.persons.create({ data: { society_id: societyId, full_name, phone: randomPhone() } }).then((r) => r.id);
    ids.rahim = await person('রহিম');
    ids.karim = await person('করিম');
    ids.jamal = await person('জামাল');
    const own = (location_id: string, person_id: string) => prisma.ownerships.create({ data: { society_id: societyId, location_id, person_id, start_date: day('2020-01-01') } });
    await own(ids.c1, ids.rahim);
    await own(ids.c2, ids.rahim);
    await own(ids.d1, ids.jamal);
    ids.tenancy = (
      await prisma.tenancies.create({
        data: { society_id: societyId, unit_id: ids.c2, renter_type: 'family', primary_person_id: ids.karim, start_date: day('2025-01-01'), status: 'active' },
      })
    ).id;
    const fund = await prisma.funds.create({ data: { society_id: societyId, name_bn: 'সাধারণ তহবিল', is_default: true } });
    ids.fee = (await prisma.charge_types.create({ data: { society_id: societyId, name_bn: 'স্টিকার ফি', kind: 'fee', fund_id: fund.id } })).id;

    const everything = (await prisma.permissions.findMany()).map((p) => `${p.module}:${p.action}`);
    users.admin = await makeUser(everything);
    const office = ['vehicles:view', 'vehicles:create', 'vehicles:edit', 'vehicles:export'];
    users.officeC = await makeUser(office, ids.blockC);
    users.cashierC = await makeUser([...office, 'billing:view', 'billing:create'], ids.blockC);
    users.nobody = await makeUser([]);

    const vehicle = async (regNo: string, unitId: string, personId: string) =>
      vehicleDetailSchema.parse((await send('post', '/vehicles').send({ regNo, kind: 'car', unitId, personId }).expect(201)).body).id;
    ids.carC1 = await vehicle('ঢাকা মেট্রো গ ১১-১১১১', ids.c1, ids.rahim);
    ids.carC2 = await vehicle('ঢাকা মেট্রো গ ২২-২২২২', ids.c2, ids.karim);
    ids.carD1 = await vehicle('ঢাকা মেট্রো গ ৩৩-৩৩৩৩', ids.d1, ids.jamal);
  });

  afterAll(async () => {
    if (!prisma) return;
    const society = { society_id: societyId };
    await prisma.stickers.updateMany({ where: society, data: { replaces_id: null, reason: 'new' } });
    await prisma.stickers.deleteMany({ where: society });
    await prisma.invoices.deleteMany({ where: society });
    await prisma.parking_slots.deleteMany({ where: society });
    await prisma.vehicles.deleteMany({ where: society });
    await prisma.tenancies.deleteMany({ where: society });
    await prisma.ownerships.deleteMany({ where: society });
    await prisma.persons.deleteMany({ where: society });
    await prisma.user_roles.deleteMany({ where: { users_user_roles_user_idTousers: { society_id: societyId } } });
    for (const depth of [2, 1]) await prisma.locations.deleteMany({ where: { society_id: societyId, location_levels: { depth } } });
    await prisma.societies.deleteMany({ where: { id: societyId } });
    await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
    await app.close();
  });

  it('keeps the sticker setting with settings.edit only', async () => {
    const shown = stickerSettingsViewSchema.parse((await get('/vehicles/settings', users.officeC).expect(200)).body);
    expect(shown).toEqual({ settings: DEFAULT_STICKER_SETTINGS, can: { edit: false } });
    const settings = { prefix: 'স্টি', validity: 'calendar', fee: null };
    await send('put', '/vehicles/settings', users.officeC).send(settings).expect(403);
    await send('put', '/vehicles/settings').send({ ...settings, prefix: 'S-1' }).expect(400);
    const unknown = await send('put', '/vehicles/settings').send({ ...settings, fee: { chargeTypeId: randomUUID(), amount: '200.00' } }).expect(400);
    expect(unknown.body.code).toBe('invalid_charge_type');
    expect(stickerSettingsViewSchema.parse((await send('put', '/vehicles/settings').send(settings).expect(200)).body).settings.prefix).toBe('স্টি');
  });

  it('issues a sticker to the end of the year, one in force per vehicle, only for people still at the unit', async () => {
    sticker.c1 = row(await issue(ids.carC1).expect(201));
    expect(sticker.c1).toMatchObject({ stickerNo: 'স্টি-0001', reason: 'new', state: 'active', validUntil: `${thisYear}-12-31`, invoice: null, replaces: null });
    expect((await issue(ids.carC1).expect(409)).body.code).toBe('sticker_in_force');
    expect((await issue(ids.carD1).expect(404)).body.code).toBe('vehicle_not_found');
    await issue(ids.carC2, users.nobody).expect(403);

    sticker.d1 = row(await issue(ids.carD1, users.admin, true).expect(201));
    expect(sticker.d1).toMatchObject({ stickerNo: 'স্টি-0002', validUntil: `${thisYear + 1}-12-31` });

    // Karim moves out: his car gets no sticker until it is moved to someone at the unit.
    await prisma.tenancies.update({ where: { id: ids.tenancy }, data: { status: 'ended', end_date: day('2026-01-31') } });
    expect((await issue(ids.carC2).expect(409)).body.code).toBe('vehicle_person_not_at_unit');
    await prisma.tenancies.update({ where: { id: ids.tenancy }, data: { status: 'active', end_date: null } });
    sticker.c2 = row(await issue(ids.carC2).expect(201));
  });

  it('replaces a lost sticker with a new number to the same day, and revokes', async () => {
    const replaced = row(await send('post', `/stickers/${sticker.c1.id}/replace`, users.officeC).expect(200));
    expect(replaced).toMatchObject({ stickerNo: 'স্টি-0004', reason: 'replacement', validUntil: sticker.c1.validUntil, replaces: { id: sticker.c1.id } });
    expect(row(await get(`/stickers/${sticker.c1.id}`).expect(200)).state).toBe('replaced');
    expect((await send('post', `/stickers/${sticker.c1.id}/replace`, users.officeC).expect(409)).body.code).toBe('sticker_not_active');
    sticker.c1 = replaced;

    await send('post', `/stickers/${sticker.c2.id}/revoke`, users.nobody).send({ reason: 'ভুল' }).expect(403);
    expect(row(await send('post', `/stickers/${sticker.c2.id}/revoke`, users.officeC).send({ reason: 'ভুল' }).expect(200))).toMatchObject({ state: 'revoked', revokeReason: 'ভুল' });
    expect((await send('post', `/stickers/${sticker.c2.id}/revoke`, users.officeC).send({ reason: 'আবার' }).expect(409)).body.code).toBe('sticker_not_active');
  });

  it('renews in bulk into next year, skipping what cannot be renewed', async () => {
    const missing = randomUUID();
    const result = stickerRenewResultSchema.parse(
      (await send('post', '/stickers/renew', users.officeC).send({ stickerIds: [sticker.c1.id, sticker.c2.id, sticker.d1.id, missing] }).expect(200)).body,
    );
    expect(result.renewed).toHaveLength(1);
    expect(result.renewed[0]).toMatchObject({ reason: 'renewal', validUntil: `${thisYear + 1}-12-31`, replaces: { id: sticker.c1.id } });
    expect(result.skipped).toEqual([
      { stickerId: sticker.c2.id, code: 'sticker_not_active' },
      { stickerId: sticker.d1.id, code: 'sticker_not_found' },
      { stickerId: missing, code: 'sticker_not_found' },
    ]);
    sticker.c1 = result.renewed[0]!;
  });

  it('bills the unit for the fee when the society charges one, with billing permission', async () => {
    await send('put', '/vehicles/settings').send({ prefix: 'স্টি', validity: 'calendar', fee: { chargeTypeId: ids.fee, amount: '300.00' } }).expect(200);
    expect((await issue(ids.carC2).expect(403)).body.code).toBe('sticker_fee_needs_billing');
    const paid = row(await issue(ids.carC2, users.cashierC).expect(201));
    expect(paid.invoice).not.toBeNull();
    const bill = await prisma.invoices.findUniqueOrThrow({ where: { id: paid.invoice!.id }, include: { invoice_lines: true } });
    expect(bill).toMatchObject({ unit_id: ids.c2, kind: 'regular', status: 'unpaid' });
    expect(bill.total.toFixed(2)).toBe('300.00');
    expect(bill.invoice_lines[0]!.description).toContain(paid.stickerNo);
    sticker.c2 = paid;
    await send('put', '/vehicles/settings').send({ prefix: 'স্টি', validity: 'calendar', fee: null }).expect(200);
  });

  it('lists, exports and prints stickers in the caller area', async () => {
    const office = stickerListSchema.parse((await get('/stickers', users.officeC).expect(200)).body);
    expect(office.items.every((s) => s.place.id !== ids.d1)).toBe(true);
    expect(office.counts).toEqual({ active: 2, expired: 0 });
    const active = stickerListSchema.parse((await get('/stickers?state=active').expect(200)).body);
    expect(active.items.map((s) => s.id).sort()).toEqual([sticker.c1.id, sticker.c2.id, sticker.d1.id].sort());
    const byPlate = stickerListSchema.parse((await get(`/stickers?q=${encodeURIComponent('11-1111')}`).expect(200)).body);
    expect(byPlate.items.every((s) => s.vehicle.id === ids.carC1)).toBe(true);

    const csv = await get('/stickers/csv?lang=en', users.officeC).expect(200);
    expect(csv.text).toContain('Sticker no.');
    expect(csv.text).toContain(sticker.c1.stickerNo);
    expect(csv.text).not.toContain('৩৩-৩৩৩৩');
    await get('/stickers/csv', users.nobody).expect(403);

    const sheet = stickerSheetSchema.parse((await get(`/stickers/sheet?ids=${[sticker.c1.id, sticker.d1.id, office.items.at(-1)!.id].join(',')}`, users.officeC).expect(200)).body);
    expect(sheet.items.map((s) => s.stickerNo)).toEqual([sticker.c1.stickerNo]);
    expect(sheet.header.nameBn).toBe(`সমিতি ${MARK}`);
  });

  it('removing a vehicle revokes its sticker', async () => {
    await send('post', `/vehicles/${ids.carD1}/remove`).send({ reason: 'বিক্রি' }).expect(200);
    expect(row(await get(`/stickers/${sticker.d1.id}`).expect(200)).state).toBe('revoked');
    expect((await issue(ids.carD1, users.admin).expect(409)).body.code).toBe('vehicle_removed');
  });

  it('manages parking slots: codes unique per place, one slot per vehicle', async () => {
    const add = (body: object, caller = users.officeC) => send('post', '/parking', caller).send(body);
    const p1 = slot(await add({ locationId: ids.blockC, code: 'P1' }).expect(201));
    expect((await add({ locationId: ids.blockC, code: 'p1' }).expect(409)).body.code).toBe('parking_code_taken');
    expect((await add({ locationId: ids.d1, code: 'P1' }).expect(404)).body.code).toBe('location_not_found');
    const p2 = slot(await add({ locationId: ids.blockC, code: 'P2' }).expect(201));

    const assign = (id: string, body: object) => send('post', `/parking/${id}/assign`, users.officeC).send(body);
    expect(slot(await assign(p1.id, { vehicleId: ids.carC1 }).expect(200)).assignee).toMatchObject({ kind: 'vehicle', id: ids.carC1 });
    expect((await assign(p2.id, { vehicleId: ids.carC1 }).expect(409)).body.code).toBe('parking_vehicle_taken');
    await assign(p2.id, { unitId: ids.c2, vehicleId: ids.carC2 }).expect(400);
    expect(slot(await assign(p2.id, { unitId: ids.c2 }).expect(200)).assignee).toMatchObject({ kind: 'unit', place: { id: ids.c2 } });
    expect((await assign(p2.id, { unitId: ids.d1 }).expect(404)).body.code).toBe('unit_not_found');

    const listed = parkingListSchema.parse((await get('/parking', users.officeC).expect(200)).body);
    expect(listed.counts).toEqual({ slots: 2, free: 0 });
    expect(slot(await assign(p1.id, {}).expect(200)).assignee).toBeNull();

    await send('post', `/parking/${p2.id}/remove`, users.officeC).expect(403);
    expect(slot(await send('post', `/parking/${p2.id}/remove`).expect(200))).toMatchObject({ assignee: null, can: { edit: false } });
    expect((await assign(p2.id, { unitId: ids.c2 }).expect(409)).body.code).toBe('parking_slot_removed');
    expect(parkingListSchema.parse((await get('/parking?view=free', users.officeC).expect(200)).body).items.map((s) => s.id)).toEqual([p1.id]);
    slot(await add({ locationId: ids.blockC, code: 'P2' }).expect(201));
  });
});
