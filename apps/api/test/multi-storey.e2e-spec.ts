import { INestApplication } from '@nestjs/common';
import { AUTH_COOKIES, buildingGridSchema, CSRF_HEADER, locationViewSchema, unitDetailSchema, unitListSchema, type LocationView, type UnitDetail } from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

// Runs against TEST_DATABASE_URL (sector57_test), migrated and seeded.
const MARK = `e2e-storeys-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

describe('Multi-storey buildings: duplexes and setting up floors (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let levels: { id: string; depth: number }[];
  let admin: { id: string; cookie: string };
  // sector > block > road > plot > building A (storeys 3, 4, 5) and building B (storey 3).
  const places = {} as Record<'sector' | 'block' | 'road' | 'plot' | 'buildingA' | 'buildingB' | 's3' | 's4' | 's5' | 'b3', string>;
  let duplex: UnitDetail;
  const server = () => app.getHttpServer();

  async function makeRole(permissions: string[]) {
    const role = await prisma.roles.create({ data: { society_id: societyId, name: `${MARK}-${randomUUID()}` } });
    const rows = await prisma.permissions.findMany();
    await prisma.role_permissions.createMany({
      data: permissions.map((name) => ({ role_id: role.id, permission_id: rows.find((p) => `${p.module}:${p.action}` === name)!.id })),
    });
    return role.id;
  }

  async function makeUser(roles: { roleId: string; scope?: string }[]) {
    const phone = randomPhone();
    const person = await prisma.persons.create({ data: { society_id: societyId, full_name: `পরীক্ষা ${MARK}`, phone } });
    const user = await prisma.users.create({ data: { society_id: societyId, person_id: person.id, phone, status: 'active' } });
    for (const role of roles) {
      await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.roleId, scope_location_id: role.scope ?? null } });
    }
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId, sessionId: randomUUID() });
    return { id: user.id, cookie: `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}` };
  }

  const send = (method: 'post' | 'put' | 'patch' | 'delete', url: string, cookie: string) =>
    request(server())[method](url).set('Cookie', cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const get = (url: string, cookie: string) => request(server()).get(url).set('Cookie', cookie);
  const level = (depth: number) => levels.find((l) => l.depth === depth)!.id;
  const view = async (id: string): Promise<LocationView> => locationViewSchema.parse((await get(`/locations/${id}`, admin.cookie).expect(200)).body);
  // Only combining units writes these links now; older duplexes kept theirs, so set them straight.
  async function cover(unitId: string, storeyIds: string[]) {
    await prisma.unit_storeys.deleteMany({ where: { unit_id: unitId } });
    await prisma.unit_storeys.createMany({ data: storeyIds.map((storeyId) => ({ unit_id: unitId, storey_id: storeyId, society_id: societyId })) });
  }

  async function addLocation(parentId: string | null, depth: number, name: string) {
    const res = await send('post', '/locations', admin.cookie).send({ parentId, levelId: level(depth), name, code: null }).expect(201);
    return locationViewSchema.parse(res.body).location!.id;
  }

  async function addUnit(parentId: string, name: string) {
    const res = await send('post', '/units', admin.cookie)
      .send({ parentId, name, code: null, unitType: 'residential', sizeSqft: null, billTo: 'owner' })
      .expect(201);
    return unitDetailSchema.parse(res.body);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    societyId = (await prisma.societies.findUniqueOrThrow({ where: { slug: 'sector57' } })).id;
    levels = await prisma.location_levels.findMany({ where: { society_id: societyId }, select: { id: true, depth: true } });
    admin = await makeUser([{ roleId: (await prisma.roles.findFirstOrThrow({ where: { society_id: societyId, is_system: true } })).id }]);

    places.sector = await addLocation(null, 1, `${MARK} সেক্টর`);
    places.block = await addLocation(places.sector, 2, 'ব্লক এ');
    places.road = await addLocation(places.block, 3, 'রোড ১');
    places.plot = await addLocation(places.road, 4, 'প্লট ১');
    places.buildingA = await addLocation(places.plot, 5, 'ভবন এ');
    places.buildingB = await addLocation(places.plot, 5, 'ভবন বি');
    places.s3 = await addLocation(places.buildingA, 6, '৩ তলা');
    places.s4 = await addLocation(places.buildingA, 6, '৪ তলা');
    places.s5 = await addLocation(places.buildingA, 6, '৫ তলা');
    places.b3 = await addLocation(places.buildingB, 6, '৩ তলা');
    duplex = await addUnit(places.s3, 'ফ্ল্যাট ৩এ');
  });

  afterAll(async () => {
    if (prisma) {
      if (places.sector) {
        const root = await prisma.locations.findUniqueOrThrow({ where: { id: places.sector }, select: { path: true } });
        const ids = (await prisma.locations.findMany({ where: { path: { startsWith: root.path } }, select: { id: true } })).map((row) => row.id);
        await prisma.occupants.deleteMany({ where: { unit_id: { in: ids } } });
        await prisma.ownerships.deleteMany({ where: { location_id: { in: ids } } });
        await prisma.units.updateMany({ where: { location_id: { in: ids } }, data: { merged_into: null, merged_on: null } });
      }
      const persons = await prisma.persons.findMany({ where: { full_name: { contains: MARK } }, select: { id: true } });
      const users = await prisma.users.findMany({ where: { person_id: { in: persons.map((p) => p.id) } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      await prisma.audit_logs.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.user_roles.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
      await prisma.users.deleteMany({ where: { id: { in: userIds } } });
      await prisma.persons.deleteMany({ where: { id: { in: persons.map((p) => p.id) } } });
      if (places.sector) {
        const root = await prisma.locations.findUniqueOrThrow({ where: { id: places.sector }, select: { path: true } });
        // Deepest first: a unit (and its storey links) goes before the storeys it covers.
        const rows = await prisma.locations.findMany({ where: { path: { startsWith: root.path } }, select: { id: true, path: true } });
        rows.sort((a, b) => b.path.length - a.path.length);
        for (const row of rows) await prisma.locations.delete({ where: { id: row.id } });
      }
    }
    await app?.close();
  });

  it('shows a duplex on each floor it covers and counts it once', async () => {
    await cover(duplex.id, [places.s4]);
    const saved = unitDetailSchema.parse((await get(`/units/${duplex.id}`, admin.cookie).expect(200)).body);
    expect(saved.covers).toEqual([{ id: places.s4, name: '৪ তলা' }]);

    const home = await view(places.s3);
    expect(home.children.find((child) => child.id === duplex.id)?.alsoOn).toEqual(['৪ তলা']);
    const upper = await view(places.s4);
    expect(upper.children.map((child) => child.id)).not.toContain(duplex.id);
    expect(upper.alsoHere).toMatchObject([{ id: duplex.id, homeName: '৩ তলা', alsoOn: ['৪ তলা'] }]);
    expect((await view(places.s5)).alsoHere).toEqual([]);

    const building = await view(places.buildingA);
    expect(building.location!.unitCount).toBe(1);
    expect(building.children.find((child) => child.id === places.s4)!.unitCount).toBe(0);
  });

  it('no longer sets covered floors by hand', async () => {
    await addUnit(places.s4, 'ফ্ল্যাট ৪বি');
    await send('put', `/units/${duplex.id}/storeys`, admin.cookie).send({ storeyIds: [] }).expect(404);
  });

  it('keeps a covered storey from being deleted until the link is gone', async () => {
    const empty = await addLocation(places.buildingA, 6, '৬ তলা');
    await cover(duplex.id, [places.s4, empty]);
    expect((await send('delete', `/locations/${empty}`, admin.cookie).expect(409)).body.code).toBe('location_in_use');
    await cover(duplex.id, [places.s4]);
    await send('delete', `/locations/${empty}`, admin.cookie).expect(204);
  });

  describe('set up floors and units', () => {
    const layout = {
      floors: { from: 0, to: 2, pattern: '{n} তলা', groundName: 'নিচ তলা', groundHasUnits: false },
      units: { letters: 'এবি', pattern: 'ফ্ল্যাট {n}{letter}' },
      bangla: true,
      unitType: 'residential',
      sizeSqft: '১২০০',
      billTo: 'owner',
    };
    const setUp = (id: string, cookie = admin.cookie, body: object = layout) => send('post', `/locations/${id}/layout`, cookie).send(body);

    it('creates the floors and the units on each, once', async () => {
      const building = await addLocation(places.plot, 5, 'ভবন সি');
      expect((await setUp(building).expect(201)).body).toEqual({ floors: 3, units: 4 });

      const made = await view(building);
      expect(made.children.map((child) => child.name).sort()).toEqual(['নিচ তলা', '১ তলা', '২ তলা'].sort());
      expect(made.location!.unitCount).toBe(4);
      const second = made.children.find((child) => child.name === '২ তলা')!;
      expect(second.levelId).toBe(level(6));
      const units = (await view(second.id)).children;
      expect(units.map((unit) => unit.name)).toEqual(['ফ্ল্যাট ২এ', 'ফ্ল্যাট ২বি']);
      const unit = unitDetailSchema.parse((await get(`/units/${units[0]!.id}`, admin.cookie).expect(200)).body);
      expect(unit).toMatchObject({ unitType: 'residential', sizeSqft: '1200', billTo: 'owner' });

      expect((await setUp(building).expect(409)).body.code).toBe('layout_not_empty');
    });

    it('needs a floor level below the place, and both create permissions', async () => {
      expect((await setUp(places.s5).expect(400)).body.code).toBe('invalid_level');
      expect((await setUp(await addLocation(places.block, 3, 'রোড খালি')).expect(400)).body.code).toBe('invalid_level');
      const building = await addLocation(places.plot, 5, 'ভবন ডি');
      const placesOnly = await makeUser([{ roleId: await makeRole(['locations:view', 'locations:create']) }]);
      expect((await setUp(building, placesOnly.cookie).expect(403)).body.code).toBe('beyond_your_permissions');
      await setUp(building, admin.cookie, { ...layout, units: { letters: 'AB', pattern: 'Flat {n}' } }).expect(400);
      expect((await view(building)).children).toEqual([]);
    });
  });

  describe('building grid and bulk type', () => {
    const setType = (unitIds: string[], unitType: string, cookie = admin.cookie) => send('post', '/units/bulk-type', cookie).send({ unitIds, unitType });

    it('lists each floor with its own units', async () => {
      const grid = buildingGridSchema.parse((await get(`/locations/${places.buildingA}/grid`, admin.cookie).expect(200)).body);
      expect(grid.canEdit).toBe(true);
      expect(grid.floors.map((floor) => floor.name)).toEqual(['৩ তলা', '৪ তলা', '৫ তলা']);
      expect(grid.floors[0]!.units).toMatchObject([{ id: duplex.id, unitType: 'residential', occupancy: 'vacant', alsoOn: ['৪ তলা'] }]);
      expect(grid.floors[0]!.coveredBy).toEqual([]);
      expect(grid.floors[1]!.units.map((unit) => unit.name)).toEqual(['ফ্ল্যাট ৪বি']);
      expect(grid.floors[1]!.coveredBy).toEqual([{ id: duplex.id, name: 'ফ্ল্যাট ৩এ' }]);
      expect(grid.floors[2]!.coveredBy).toEqual([]);
    });

    it('sets one type on many units, all or none', async () => {
      const upper = buildingGridSchema.parse((await get(`/locations/${places.buildingA}/grid`, admin.cookie).expect(200)).body).floors[1]!.units[0]!.id;
      expect((await setType([duplex.id, upper], 'shop').expect(200)).body).toEqual({ updated: 2 });
      expect(unitDetailSchema.parse((await get(`/units/${upper}`, admin.cookie).expect(200)).body).unitType).toBe('shop');
      expect((await setType([duplex.id, upper], 'shop').expect(200)).body).toEqual({ updated: 0 });
      await setType([duplex.id], 'no_such_type').expect(400);
      expect((await setType([duplex.id, randomUUID()], 'office').expect(404)).body.code).toBe('unit_not_found');

      const onS3 = await makeUser([{ roleId: await makeRole(['units:view', 'units:edit']), scope: places.s3 }]);
      await setType([duplex.id, upper], 'office', onS3.cookie).expect(404);
      await setType([duplex.id], 'residential', onS3.cookie).expect(200);
      expect(unitDetailSchema.parse((await get(`/units/${upper}`, admin.cookie).expect(200)).body).unitType).toBe('shop');
    });
  });

  describe('making a duplex', () => {
    const combine = (keepId: string, mergeIds: string[], cookie = admin.cookie) => send('post', '/units/combine', cookie).send({ keepId, mergeIds });
    const unitAt = async (floor: string, name: string) =>
      (await prisma.locations.findFirstOrThrow({ where: { parent_id: floor, name }, select: { id: true } })).id;
    let units: Record<'1A' | '1B' | '2A' | '2B', string>;
    let floors: { one: string; two: string };
    let building: string;
    let owner: string;

    beforeAll(async () => {
      building = await addLocation(places.plot, 5, 'ভবন ই');
      await send('post', `/locations/${building}/layout`, admin.cookie)
        .send({
          floors: { from: 1, to: 2, pattern: 'Floor {n}', groundName: null, groundHasUnits: true },
          units: { letters: 'AB', pattern: '{n}{letter}' },
          bangla: false,
          unitType: 'residential',
          sizeSqft: '1000',
          billTo: 'owner',
        })
        .expect(201);
      const made = await view(building);
      floors = { one: made.children.find((c) => c.name === 'Floor 1')!.id, two: made.children.find((c) => c.name === 'Floor 2')!.id };
      units = {
        '1A': await unitAt(floors.one, '1A'),
        '1B': await unitAt(floors.one, '1B'),
        '2A': await unitAt(floors.two, '2A'),
        '2B': await unitAt(floors.two, '2B'),
      };
      owner = (await prisma.persons.create({ data: { society_id: societyId, full_name: `মালিক ${MARK}` } })).id;
      const other = (await prisma.persons.create({ data: { society_id: societyId, full_name: `অন্য মালিক ${MARK}` } })).id;
      const start = new Date('2026-01-01');
      await prisma.ownerships.createMany({
        data: [
          { society_id: societyId, location_id: units['1A'], person_id: owner, start_date: start },
          { society_id: societyId, location_id: units['2A'], person_id: owner, start_date: start },
          { society_id: societyId, location_id: units['2B'], person_id: other, start_date: start },
        ],
      });
    });

    it('refuses units on one floor, different owners, other buildings and a retired unit someone lives in', async () => {
      expect((await combine(units['1A'], [units['1B']]).expect(409)).body.code).toBe('combine_same_floor');
      expect((await combine(units['1A'], [units['2B']]).expect(409)).body.code).toBe('combine_owners_differ');
      expect((await combine(units['1B'], [duplex.id]).expect(409)).body.code).toBe('combine_not_side_by_side');
      await send('post', '/occupants', admin.cookie)
        .send({ unitId: units['2A'], tenancyId: null, person: { fullName: `বাসিন্দা ${MARK}`, phone: randomPhone() }, relation: 'head', startDate: '2026-01-01' })
        .expect(201);
      expect((await combine(units['1A'], [units['2A']]).expect(409)).body.code).toBe('combine_occupants');
      await prisma.occupants.deleteMany({ where: { unit_id: units['2A'] } });

      const onFloorOne = await makeUser([{ roleId: await makeRole(['units:view', 'units:edit']), scope: floors.one }]);
      await combine(units['1A'], [units['2A']], onFloorOne.cookie).expect(404);
    });

    it('keeps one unit over both floors and retires the other as history', async () => {
      expect((await combine(units['1A'], [units['2A']]).expect(200)).body).toEqual({ keptId: units['1A'], merged: 1 });

      const kept = unitDetailSchema.parse((await get(`/units/${units['1A']}`, admin.cookie).expect(200)).body);
      expect(kept).toMatchObject({ isActive: true, sizeSqft: '2000', covers: [{ id: floors.two, name: 'Floor 2' }], mergedInto: null });
      const retired = unitDetailSchema.parse((await get(`/units/${units['2A']}`, admin.cookie).expect(200)).body);
      expect(retired).toMatchObject({ isActive: false, mergedInto: { id: units['1A'], name: '1A' }, can: { edit: false, delete: false } });
      const grid = buildingGridSchema.parse((await get(`/locations/${building}/grid`, admin.cookie).expect(200)).body);
      expect(grid.floors[0]!.units.find((unit) => unit.id === units['1A'])).toMatchObject({ mergedInto: null, includes: ['2A'] });
      expect(grid.floors[1]!.units.find((unit) => unit.id === units['2A'])).toMatchObject({ mergedInto: { id: units['1A'], name: '1A' }, includes: [] });
      // Floor 2 already shows the duplex through the retired 2A, so not twice.
      expect(grid.floors[1]!.coveredBy).toEqual([]);
      const list = unitListSchema.parse((await get(`/units?areaId=${building}`, admin.cookie).expect(200)).body);
      expect(list.items.find((unit) => unit.id === units['1A'])).toMatchObject({ mergedInto: null, includes: ['2A'] });
      expect(list.items.find((unit) => unit.id === units['2A'])).toMatchObject({ mergedInto: { id: units['1A'], name: '1A' } });
      expect(list.counts.total).toBe(3);
      const vacant = unitListSchema.parse((await get(`/units?areaId=${building}&occupancy=vacant`, admin.cookie).expect(200)).body);
      expect(vacant.items.map((unit) => unit.id)).not.toContain(units['2A']);
      expect(await prisma.ownerships.count({ where: { location_id: units['2A'], end_date: null } })).toBe(0);
      expect(await prisma.ownerships.count({ where: { location_id: units['1A'], end_date: null } })).toBe(1);

      expect((await send('patch', `/units/${units['2A']}`, admin.cookie).send({ name: 'x' }).expect(409)).body.code).toBe('unit_merged');
      expect((await combine(units['1A'], [units['2A']]).expect(409)).body.code).toBe('combine_unit_inactive');
      expect((await view(floors.two)).alsoHere.map((unit) => unit.id)).toEqual([units['1A']]);
    });

    it("shows each unit's owner or renter and how many units they hold in the building", async () => {
      const grid = async (cookie = admin.cookie) => {
        const body = buildingGridSchema.parse((await get(`/locations/${building}/grid`, cookie).expect(200)).body);
        return new Map(body.floors.flatMap((floor) => floor.units).map((unit) => [unit.id, unit.holder]));
      };
      const before = await grid();
      expect(before.get(units['1A'])).toEqual({ name: `মালিক ${MARK}`, nameEn: null, role: 'owner', more: 0, units: 1 });
      expect(before.get(units['1B'])).toBeNull();
      // Retired into the duplex: history, holding nobody.
      expect(before.get(units['2A'])).toBeNull();

      // One company over two flats on different floors.
      const other = (await prisma.persons.findFirstOrThrow({ where: { full_name: `অন্য মালিক ${MARK}` } })).id;
      await prisma.ownerships.create({ data: { society_id: societyId, location_id: units['1B'], person_id: other, start_date: new Date('2026-01-01') } });
      const after = await grid();
      expect(after.get(units['1B'])).toMatchObject({ name: `অন্য মালিক ${MARK}`, role: 'owner', units: 2 });
      expect(after.get(units['2B'])).toMatchObject({ name: `অন্য মালিক ${MARK}`, role: 'owner', units: 2 });

      const noPeople = await makeUser([{ roleId: await makeRole(['locations:view', 'units:view']) }]);
      expect([...(await grid(noPeople.cookie)).values()].every((holder) => holder === null)).toBe(true);
    });
  });
});
