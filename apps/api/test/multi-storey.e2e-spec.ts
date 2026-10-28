import { INestApplication } from '@nestjs/common';
import { AUTH_COOKIES, CSRF_HEADER, locationViewSchema, unitDetailSchema, type LocationView, type UnitDetail } from '@s57/shared';
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

describe('Multi-storey buildings: covering storeys and setting up floors (e2e)', () => {
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

  const send = (method: 'post' | 'put' | 'delete', url: string, cookie: string) =>
    request(server())[method](url).set('Cookie', cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const get = (url: string, cookie: string) => request(server()).get(url).set('Cookie', cookie);
  const level = (depth: number) => levels.find((l) => l.depth === depth)!.id;
  const view = async (id: string): Promise<LocationView> => locationViewSchema.parse((await get(`/locations/${id}`, admin.cookie).expect(200)).body);
  const cover = (unitId: string, storeyIds: string[], cookie = admin.cookie) => send('put', `/units/${unitId}/storeys`, cookie).send({ storeyIds });

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

  it('covers storeys beside its own, shows on each and counts once', async () => {
    expect(duplex.coverOptions.map((option) => option.id).sort()).toEqual([places.s4, places.s5].sort());

    const saved = unitDetailSchema.parse((await cover(duplex.id, [places.s4]).expect(200)).body);
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

    const log = await prisma.audit_logs.findFirstOrThrow({ where: { entity_id: duplex.id, entity_type: 'unit', action: 'update' } });
    expect(log.after_data).toEqual({ covers: [places.s4] });
  });

  it('refuses storeys that are not beside its own', async () => {
    for (const id of [places.b3, places.s3, places.buildingA]) {
      const res = await cover(duplex.id, [id]).expect(400);
      expect(res.body.code).toBe('invalid_storey');
    }
    const other = await addUnit(places.s4, 'ফ্ল্যাট ৪বি');
    expect((await cover(duplex.id, [other.id]).expect(400)).body.code).toBe('invalid_storey');
    await cover(duplex.id, [places.s4, places.s4]).expect(400);
  });

  it('keeps a covered storey from being deleted until the link is gone', async () => {
    const empty = await addLocation(places.buildingA, 6, '৬ তলা');
    await cover(duplex.id, [places.s4, empty]).expect(200);
    expect((await send('delete', `/locations/${empty}`, admin.cookie).expect(409)).body.code).toBe('location_in_use');
    await cover(duplex.id, [places.s4]).expect(200);
    await send('delete', `/locations/${empty}`, admin.cookie).expect(204);
  });

  it('keeps to the caller\'s units area and permission', async () => {
    const editor = await makeRole(['units:view', 'units:edit']);
    const inB = await makeUser([{ roleId: editor, scope: places.buildingB }]);
    await cover(duplex.id, [], inB.cookie).expect(404);

    // Allowed on the unit's own storey only: the storey above is outside the area.
    const onS3 = await makeUser([{ roleId: editor, scope: places.s3 }]);
    const seen = unitDetailSchema.parse((await get(`/units/${duplex.id}`, onS3.cookie).expect(200)).body);
    expect(seen.coverOptions).toEqual([]);
    expect((await cover(duplex.id, [places.s5], onS3.cookie).expect(403)).body.code).toBe('beyond_your_permissions');
    // The link to storey 4 (outside the area) can be kept, not removed.
    expect(seen.covers.map((storey) => storey.id)).toEqual([places.s4]);
    await cover(duplex.id, [places.s4], onS3.cookie).expect(200);
    await cover(duplex.id, [], onS3.cookie).expect(403);

    const viewer = await makeUser([{ roleId: await makeRole(['units:view']) }]);
    expect(unitDetailSchema.parse((await get(`/units/${duplex.id}`, viewer.cookie).expect(200)).body).coverOptions).toEqual([]);
    await cover(duplex.id, [], viewer.cookie).expect(403);
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
});
