import { INestApplication } from '@nestjs/common';
import { AUTH_COOKIES, CSRF_HEADER, vehicleDetailSchema, vehicleListSchema, vehicleLookupSchema, vehicleUnitPeopleSchema, type VehicleDetail } from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-vehicles-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

type Caller = { cookie: string; id: string };

/**
 * Vehicles, in a society of its own. Block C has building 9 with flats C-1 and C-2; Block D has
 * flat D-1. Rahim owns building 9, Karim rents C-2 and his wife Salma lives there, Jamal owns
 * D-1. The Block C office manages vehicles there; the guard may only look plates up.
 */
describe('Vehicles (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let otherSocietyId: string;
  const server = () => app.getHttpServer();
  const users = {} as Record<'admin' | 'officeC' | 'guardC' | 'nobody', Caller>;
  const ids = {} as Record<'blockC' | 'c1' | 'c2' | 'd1' | 'rahim' | 'karim' | 'salma' | 'jamal' | 'stranger' | 'otherUnit', string>;
  const car = {} as Record<'rahim' | 'karim' | 'jamal', VehicleDetail>;

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

  const send = (method: 'post' | 'patch', url: string, caller = users.admin) =>
    request(server())[method](url).set('Cookie', caller.cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const get = (url: string, caller = users.admin) => request(server()).get(url).set('Cookie', caller.cookie);
  const detail = (res: request.Response) => vehicleDetailSchema.parse(res.body);
  const list = async (query: string, caller = users.admin) => vehicleListSchema.parse((await get(`/vehicles?${query}`, caller).expect(200)).body);
  const lookup = async (plate: string, caller = users.guardC) =>
    vehicleLookupSchema.parse((await get(`/vehicles/lookup?plate=${encodeURIComponent(plate)}`, caller).expect(200)).body);

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { PrismaPg, PrismaClient } = await import('@s57/db');
    const setup = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    societyId = (await setup.societies.create({ data: { name_bn: `সমিতি ${MARK}`, slug: MARK } })).id;
    await setup.$disconnect();

    app = await createTestApp([], { DEFAULT_SOCIETY_SLUG: MARK });
    prisma = app.get(PrismaService);

    const level = (society_id: string, depth: number, name_bn: string, is_unit_level = false) =>
      prisma.location_levels.create({ data: { society_id, depth, name_bn, is_unit_level } }).then((r) => r.id);
    const place = async (society_id: string, levelId: string, name: string, parent: { id: string; path: string } | null) => {
      const id = randomUUID();
      const path = `${parent?.path ?? '/'}${id}/`;
      await prisma.locations.create({ data: { id, society_id, level_id: levelId, parent_id: parent?.id ?? null, name, path } });
      return { id, path };
    };
    const unit = async (society_id: string, levelId: string, name: string, parent: { id: string; path: string }) => {
      const row = await place(society_id, levelId, name, parent);
      await prisma.units.create({ data: { location_id: row.id, society_id, unit_type: 'residential' } });
      return row.id;
    };
    const block = await level(societyId, 1, 'ব্লক');
    const building = await level(societyId, 2, 'ভবন');
    const flat = await level(societyId, 3, 'ইউনিট', true);
    const c = await place(societyId, block, 'ব্লক সি', null);
    const d = await place(societyId, block, 'ব্লক ডি', null);
    const b9 = await place(societyId, building, 'ভবন ৯', c);
    const bD = await place(societyId, building, 'ভবন ১', d);
    ids.blockC = c.id;
    ids.c1 = await unit(societyId, flat, 'সি-১', b9);
    ids.c2 = await unit(societyId, flat, 'সি-২', b9);
    ids.d1 = await unit(societyId, flat, 'ডি-১', bD);

    const person = (full_name: string) => prisma.persons.create({ data: { society_id: societyId, full_name, phone: randomPhone() } }).then((r) => r.id);
    ids.rahim = await person('রহিম');
    ids.karim = await person('করিম');
    ids.salma = await person('সালমা');
    ids.jamal = await person('জামাল');
    ids.stranger = await person('অচেনা');
    const own = (location_id: string, person_id: string) => prisma.ownerships.create({ data: { society_id: societyId, location_id, person_id, start_date: day('2020-01-01') } });
    await own(b9.id, ids.rahim);
    await own(ids.d1, ids.jamal);
    const tenancy = await prisma.tenancies.create({
      data: { society_id: societyId, unit_id: ids.c2, renter_type: 'family', primary_person_id: ids.karim, start_date: day('2025-01-01'), status: 'active' },
    });
    await prisma.occupants.create({ data: { society_id: societyId, unit_id: ids.c2, person_id: ids.salma, tenancy_id: tenancy.id, relation: 'spouse', start_date: day('2025-01-01') } });

    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: `${MARK}-other` } })).id;
    const otherBlock = await level(otherSocietyId, 1, 'ব্লক');
    const otherFlat = await level(otherSocietyId, 2, 'ইউনিট', true);
    ids.otherUnit = await unit(otherSocietyId, otherFlat, 'এ-১', await place(otherSocietyId, otherBlock, 'ব্লক এ', null));

    const everything = (await prisma.permissions.findMany()).map((p) => `${p.module}:${p.action}`);
    users.admin = await makeUser(everything);
    users.officeC = await makeUser(['vehicles:view', 'vehicles:create', 'vehicles:edit'], ids.blockC);
    users.guardC = await makeUser(['vehicles:view'], ids.blockC);
    users.nobody = await makeUser([]);
  });

  afterAll(async () => {
    if (!prisma) return;
    const societies = { in: [societyId, otherSocietyId] };
    await prisma.stickers.deleteMany({ where: { society_id: societies } });
    await prisma.parking_slots.deleteMany({ where: { society_id: societies } });
    await prisma.vehicles.deleteMany({ where: { society_id: societies } });
    await prisma.occupants.deleteMany({ where: { society_id: societies } });
    await prisma.tenancies.deleteMany({ where: { society_id: societies } });
    await prisma.ownerships.deleteMany({ where: { society_id: societies } });
    await prisma.persons.deleteMany({ where: { society_id: societies } });
    await prisma.user_roles.deleteMany({ where: { users_user_roles_user_idTousers: { society_id: societyId } } });
    for (const depth of [3, 2, 1]) await prisma.locations.deleteMany({ where: { society_id: societies, location_levels: { depth } } });
    await prisma.societies.deleteMany({ where: { id: societies } });
    await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
    await app.close();
  });

  it('lists who a vehicle at a unit may belong to', async () => {
    const people = vehicleUnitPeopleSchema.parse((await get(`/vehicles/unit-people?unitId=${ids.c2}`, users.officeC).expect(200)).body);
    expect(Object.fromEntries(people.items.map((p) => [p.name, p.ties]))).toEqual({ করিম: ['renter'], রহিম: ['owner'], সালমা: ['resident'] });
    await get(`/vehicles/unit-people?unitId=${ids.d1}`, users.officeC).expect(404);
    await get(`/vehicles/unit-people?unitId=${ids.otherUnit}`).expect(404);
  });

  it('adds a vehicle only for a current owner, renter or resident of the unit', async () => {
    const add = (body: object, caller = users.officeC) => send('post', '/vehicles', caller).send(body);
    car.karim = detail(await add({ regNo: ' ঢাকা মেট্রো-গ ১২-৩৪৫৬ ', kind: 'car', make: 'Toyota', unitId: ids.c2, personId: ids.karim }).expect(201));
    expect(car.karim).toMatchObject({ regNo: 'ঢাকা মেট্রো-গ ১২-৩৪৫৬', place: { id: ids.c2 }, person: { id: ids.karim }, sticker: null, can: { edit: true, remove: false } });
    car.rahim = detail(await add({ regNo: 'Dhaka Metro Ha 11-2222', kind: 'motorcycle', unitId: ids.c1, personId: ids.rahim }).expect(201));

    const notThere = await add({ regNo: 'ঢাকা মেট্রো খ ৫৫-৬৬৬৬', kind: 'car', unitId: ids.c1, personId: ids.karim }).expect(409);
    expect(notThere.body.code).toBe('vehicle_person_not_at_unit');
    expect((await add({ regNo: 'ঢাকা ১-১', kind: 'car', unitId: ids.c1, personId: randomUUID() }).expect(404)).body.code).toBe('person_not_found');
    const twin = await add({ regNo: 'ঢাকা মেট্রো গ 12 3456', kind: 'car', unitId: ids.c2, personId: ids.salma }).expect(409);
    expect(twin.body.code).toBe('vehicle_exists');
    await add({ regNo: '--', kind: 'car', unitId: ids.c2, personId: ids.salma }).expect(400);

    expect((await add({ regNo: 'ঢাকা ২-২', kind: 'car', unitId: ids.d1, personId: ids.jamal }).expect(404)).body.code).toBe('unit_not_found');
    await add({ regNo: 'ঢাকা ২-২', kind: 'car', unitId: ids.c2, personId: ids.karim }, users.guardC).expect(403);
    await add({ regNo: 'ঢাকা ২-২', kind: 'car', unitId: ids.otherUnit, personId: ids.karim }, users.admin).expect(404);
    car.jamal = detail(await add({ regNo: 'ঢাকা মেট্রো ঘ ৯৯-৩৪৫৬', kind: 'microbus', unitId: ids.d1, personId: ids.jamal }, users.admin).expect(201));
  });

  it('shows vehicles in the caller area only, and searches by number or name', async () => {
    const office = await list('', users.officeC);
    expect(office.items.map((v) => v.id).sort()).toEqual([car.karim.id, car.rahim.id].sort());
    expect(office.counts).toEqual({ active: 2, noSticker: 2 });
    expect((await list('')).total).toBe(3);
    await get(`/vehicles/${car.jamal.id}`, users.officeC).expect(404);
    await get('/vehicles', users.nobody).expect(403);

    expect((await list(`q=${encodeURIComponent('12-3456')}`)).items.map((v) => v.id)).toEqual([car.karim.id]);
    expect((await list(`q=${encodeURIComponent('রহিম')}`)).items.map((v) => v.id)).toEqual([car.rahim.id]);
    expect((await list(`unitId=${ids.c2}`)).items.map((v) => v.id)).toEqual([car.karim.id]);
    expect((await list('kind=microbus')).items.map((v) => v.id)).toEqual([car.jamal.id]);
  });

  it('looks a plate up for a guard: unit and sticker only, in their area', async () => {
    const exact = await lookup('ঢাকা মেট্রো গ ১২৩৪৫৬');
    expect(exact.items).toEqual([{ regNo: 'ঢাকা মেট্রো-গ ১২-৩৪৫৬', kind: 'car', place: expect.objectContaining({ id: ids.c2 }), sticker: null }]);
    expect(JSON.stringify(exact)).not.toContain('করিম');
    // Last digits match too; Jamal's microbus in Block D is outside the guard's area.
    expect((await lookup('3456')).items.map((v) => v.regNo)).toEqual(['ঢাকা মেট্রো-গ ১২-৩৪৫৬']);
    expect((await lookup('৩৪৫৬', users.admin)).items).toHaveLength(2);
    expect((await lookup('ঢাকা ৫৫')).items).toEqual([]);
    await get('/vehicles/lookup?plate=12', users.nobody).expect(403);
  });

  it('edits a vehicle, checking the person again when the unit or person changes', async () => {
    const edit = (id: string, body: object, caller = users.officeC) => send('patch', `/vehicles/${id}`, caller).send(body);
    expect(detail(await edit(car.karim.id, { colour: 'সাদা', personId: ids.salma }).expect(200))).toMatchObject({ colour: 'সাদা', person: { id: ids.salma } });
    expect((await edit(car.karim.id, { unitId: ids.c1 }).expect(409)).body.code).toBe('vehicle_person_not_at_unit');
    expect((await edit(car.karim.id, { unitId: ids.d1, personId: ids.jamal }).expect(404)).body.code).toBe('unit_not_found');
    expect((await edit(car.rahim.id, { regNo: 'ঢাকা মেট্রো ঘ 99 3456' }, users.admin).expect(409)).body.code).toBe('vehicle_exists');
    await edit(car.karim.id, { make: 'Honda' }, users.guardC).expect(403);

    const audit = await prisma.audit_logs.findFirst({ where: { entity_id: car.karim.id, action: 'update' } });
    expect(audit?.after_data).toMatchObject({ colour: 'সাদা', personId: ids.salma });
  });

  it('removes a vehicle: revokes its sticker, frees its slot, and frees its number', async () => {
    const sticker = await prisma.stickers.create({ data: { society_id: societyId, sticker_no: 'STK-0001', vehicle_id: car.karim.id, valid_until: day('2099-12-31') } });
    const slot = await prisma.parking_slots.create({ data: { society_id: societyId, location_id: ids.c2, code: 'P1', vehicle_id: car.karim.id } });
    expect((await list('', users.officeC)).counts).toEqual({ active: 2, noSticker: 1 });
    expect((await lookup('123456')).items[0]!.sticker).toEqual({ stickerNo: 'STK-0001', validUntil: '2099-12-31', state: 'active' });

    await send('post', `/vehicles/${car.karim.id}/remove`, users.officeC).send({ reason: 'বিক্রি' }).expect(403);
    const removed = detail(await send('post', `/vehicles/${car.karim.id}/remove`).send({ reason: 'বিক্রি' }).expect(200));
    expect(removed).toMatchObject({ removeReason: 'বিক্রি', sticker: { id: sticker.id, state: 'revoked' }, can: { edit: false, remove: false } });
    expect((await prisma.parking_slots.findUniqueOrThrow({ where: { id: slot.id } })).vehicle_id).toBeNull();
    expect((await send('post', `/vehicles/${car.karim.id}/remove`).send({ reason: 'আবার' }).expect(409)).body.code).toBe('vehicle_removed');
    expect((await send('patch', `/vehicles/${car.karim.id}`).send({ make: 'X' }).expect(409)).body.code).toBe('vehicle_removed');

    expect((await lookup('123456')).items).toEqual([]);
    expect((await list('view=removed', users.officeC)).items.map((v) => v.id)).toEqual([car.karim.id]);
    // The number may be added again once the old vehicle is gone.
    await send('post', '/vehicles', users.officeC).send({ regNo: 'ঢাকা মেট্রো গ ১২-৩৪৫৬', kind: 'car', unitId: ids.c2, personId: ids.karim }).expect(201);
  });
});
