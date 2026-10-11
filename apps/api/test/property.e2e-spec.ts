import { INestApplication } from '@nestjs/common';
import {
  AUTH_COOKIES,
  CSRF_HEADER,
  locationPath,
  locationViewSchema,
  unitDetailSchema,
  unitListSchema,
  type LocationView,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { CallerAccess } from './../src/permissions/caller-access.js';
import type { Actor } from './../src/permissions/permissions.decorators.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { LevelsService } from './../src/property/levels.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-property-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `015${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

describe('Property: location tree and units (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let otherSocietyId: string;
  let systemRoleId: string;
  let levels: { id: string; depth: number }[];
  const server = () => app.getHttpServer();
  // sector > block C (> road 9) and block D, made through the API by the admin.
  const tree = {} as Record<'sector' | 'blockC' | 'blockD' | 'road9', { id: string; path: string }>;
  let admin: { id: string; cookie: string };
  const extraSocieties: string[] = [];

  async function permissionIds(names: string[]) {
    const rows = await prisma.permissions.findMany();
    return names.map((name) => rows.find((p) => `${p.module}:${p.action}` === name)!.id);
  }

  async function makeRole(permissions: string[], society = societyId) {
    const role = await prisma.roles.create({ data: { society_id: society, name: `${MARK}-${randomUUID()}` } });
    await prisma.role_permissions.createMany({
      data: (await permissionIds(permissions)).map((permission_id) => ({ role_id: role.id, permission_id })),
    });
    return role.id;
  }

  async function makeUser(roles: { roleId: string; scope?: string }[], society = societyId) {
    const phone = randomPhone();
    const person = await prisma.persons.create({ data: { society_id: society, full_name: `পরীক্ষা ${MARK}`, phone } });
    const user = await prisma.users.create({ data: { society_id: society, person_id: person.id, phone, status: 'active' } });
    for (const role of roles) {
      await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.roleId, scope_location_id: role.scope ?? null } });
    }
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId: society, sessionId: randomUUID() });
    return { id: user.id, cookie: `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}` };
  }

  const send = (method: 'post' | 'put' | 'patch' | 'delete', url: string, cookie: string) =>
    request(server())[method](url).set('Cookie', cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const get = (url: string, cookie: string) => request(server()).get(url).set('Cookie', cookie);
  const level = (depth: number) => levels.find((l) => l.depth === depth)!.id;
  const view = async (url: string, cookie: string): Promise<LocationView> =>
    locationViewSchema.parse((await get(url, cookie).expect(200)).body);

  async function addLocation(parent: keyof typeof tree | null, depth: number, name: string) {
    const res = await send('post', '/locations', admin.cookie)
      .send({ parentId: parent ? tree[parent].id : null, levelId: level(depth), name, code: null })
      .expect(201);
    const created = locationViewSchema.parse(res.body).location!;
    const row = await prisma.locations.findUniqueOrThrow({ where: { id: created.id } });
    return { id: row.id, path: row.path };
  }

  async function addUnit(parent: keyof typeof tree, name: string, extra: Record<string, unknown> = {}) {
    const res = await send('post', '/units', admin.cookie)
      .send({ parentId: tree[parent].id, name, code: null, unitType: 'residential', sizeSqft: null, billTo: 'owner', ...extra })
      .expect(201);
    return unitDetailSchema.parse(res.body);
  }

  /** Deletes locations deepest first (the parent key refuses otherwise). */
  async function removeLocations(where: object) {
    const rows = await prisma.locations.findMany({ where, select: { id: true, path: true } });
    rows.sort((a, b) => b.path.length - a.path.length);
    for (const row of rows) await prisma.locations.delete({ where: { id: row.id } });
    return rows.map((row) => row.id);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    societyId = (await prisma.societies.findUniqueOrThrow({ where: { slug: 'sector57' } })).id;
    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: MARK } })).id;
    systemRoleId = (await prisma.roles.findFirstOrThrow({ where: { society_id: societyId, is_system: true } })).id;
    levels = await prisma.location_levels.findMany({ where: { society_id: societyId }, select: { id: true, depth: true } });
    admin = await makeUser([{ roleId: systemRoleId }]);

    tree.sector = await addLocation(null, 1, `${MARK} সেক্টর`);
    tree.blockC = await addLocation('sector', 2, 'ব্লক সি');
    tree.blockD = await addLocation('sector', 2, 'ব্লক ডি');
    tree.road9 = await addLocation('blockC', 3, 'রোড ৯');
  });

  afterAll(async () => {
    if (prisma) {
      const persons = await prisma.persons.findMany({
        where: { OR: [{ full_name: { contains: MARK } }, { society_id: otherSocietyId }] },
        select: { id: true },
      });
      const users = await prisma.users.findMany({ where: { person_id: { in: persons.map((p) => p.id) } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      await prisma.audit_logs.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.user_roles.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
      await prisma.users.deleteMany({ where: { id: { in: userIds } } });
      await prisma.persons.deleteMany({ where: { id: { in: persons.map((p) => p.id) } } });
      if (tree.sector) await removeLocations({ path: { startsWith: tree.sector.path } });
      for (const society of [otherSocietyId, ...extraSocieties].filter(Boolean)) {
        await removeLocations({ society_id: society });
        await prisma.audit_logs.deleteMany({ where: { society_id: society } });
        await prisma.societies.deleteMany({ where: { id: society } });
      }
    }
    await app?.close();
  });

  describe('tree', () => {
    it('stores the path from the root down and shows the children with counts', async () => {
      expect(tree.road9.path).toBe(locationPath(locationPath(locationPath(null, tree.sector.id), tree.blockC.id), tree.road9.id));

      const top = await view('/locations', admin.cookie);
      expect(top.children.some((child) => child.id === tree.sector.id)).toBe(true);
      expect(top.can.create).toBe(true);

      const sector = await view(`/locations/${tree.sector.id}`, admin.cookie);
      expect(sector.children.map((child) => child.name).sort()).toEqual(['ব্লক ডি', 'ব্লক সি'].sort());
      expect(sector.children.find((child) => child.id === tree.blockC.id)).toMatchObject({ childCount: 1, levelBn: 'ব্লক' });

      const road = await view(`/locations/${tree.road9.id}`, admin.cookie);
      expect(road.breadcrumb.map((crumb) => crumb.id)).toEqual([tree.sector.id, tree.blockC.id]);
      expect(road.breadcrumb.every((crumb) => crumb.open)).toBe(true);
    });

    it('adds many in natural order, all or none', async () => {
      const names = ['প্লট ১০', 'প্লট ২', 'প্লট ১'];
      await send('post', '/locations/bulk', admin.cookie).send({ parentId: tree.road9.id, levelId: level(4), names }).expect(201);
      const road = await view(`/locations/${tree.road9.id}`, admin.cookie);
      expect(road.children.map((child) => child.name)).toEqual(['প্লট ১', 'প্লট ২', 'প্লট ১০']);

      const clash = await send('post', '/locations/bulk', admin.cookie)
        .send({ parentId: tree.road9.id, levelId: level(4), names: ['প্লট ৩', 'প্লট ২'] })
        .expect(409);
      expect(clash.body).toMatchObject({ code: 'location_name_taken', details: { names: ['প্লট ২'] } });
      expect(await prisma.locations.count({ where: { parent_id: tree.road9.id } })).toBe(3);
      expect(await prisma.audit_logs.count({ where: { entity_id: tree.road9.id, action: 'bulk_create' } })).toBe(1);
    });

    it('only puts a level below a shallower one, and units only through /units', async () => {
      const deeperFirst = await send('post', '/locations', admin.cookie)
        .send({ parentId: tree.road9.id, levelId: level(2), name: 'ভুল', code: null })
        .expect(400);
      expect(deeperFirst.body.code).toBe('invalid_level');
      const unitLevel = levels.reduce((a, b) => (a.depth > b.depth ? a : b)).id;
      await send('post', '/locations', admin.cookie).send({ parentId: tree.road9.id, levelId: unitLevel, name: 'ফ্ল্যাট', code: null }).expect(400);

      // Skipping levels is fine: a building straight under the block.
      await send('post', '/locations', admin.cookie).send({ parentId: tree.blockD.id, levelId: level(5), name: 'ভবন ১', code: null }).expect(201);
    });

    it('keeps names unique under a parent and holding codes unique in the society', async () => {
      const dup = await send('post', '/locations', admin.cookie)
        .send({ parentId: tree.sector.id, levelId: level(2), name: 'ব্লক সি', code: null })
        .expect(409);
      expect(dup.body.code).toBe('location_name_taken');

      const code = `${MARK}-C`;
      await send('patch', `/locations/${tree.blockC.id}`, admin.cookie).send({ code }).expect(200);
      const taken = await send('patch', `/locations/${tree.blockD.id}`, admin.cookie).send({ code }).expect(409);
      expect(taken.body.code).toBe('location_code_taken');
    });

    it('deletes only an empty location nothing refers to', async () => {
      const busy = await send('delete', `/locations/${tree.blockC.id}`, admin.cookie).expect(409);
      expect(busy.body.code).toBe('location_has_children');

      const spare = await send('post', '/locations', admin.cookie)
        .send({ parentId: tree.sector.id, levelId: level(2), name: 'ব্লক ই', code: null })
        .expect(201);
      const spareId = locationViewSchema.parse(spare.body).location!.id;
      const holder = await makeUser([{ roleId: await makeRole(['locations:view']), scope: spareId }]);
      const referred = await send('delete', `/locations/${spareId}`, admin.cookie).expect(409);
      expect(referred.body.code).toBe('location_in_use');

      await prisma.user_roles.deleteMany({ where: { user_id: holder.id } });
      await send('delete', `/locations/${spareId}`, admin.cookie).expect(204);
      expect(await prisma.audit_logs.count({ where: { entity_id: spareId, action: 'delete' } })).toBe(1);
    });

    it('refuses to add under an inactive location', async () => {
      const shut = await send('post', '/locations', admin.cookie)
        .send({ parentId: tree.sector.id, levelId: level(2), name: 'ব্লক এফ', code: null })
        .expect(201);
      const shutId = locationViewSchema.parse(shut.body).location!.id;
      await send('patch', `/locations/${shutId}`, admin.cookie).send({ isActive: false }).expect(200);
      const res = await send('post', '/locations', admin.cookie)
        .send({ parentId: shutId, levelId: level(3), name: 'রোড ১', code: null })
        .expect(409);
      expect(res.body.code).toBe('parent_inactive');
    });
  });

  describe('units', () => {
    it('creates the location and unit rows together and lists them with counts', async () => {
      // Occupancy is derived (members e2e); a typed one is ignored.
      const unit = await addUnit('road9', 'ফ্ল্যাট ৪বি', { sizeSqft: '১২৫০.৫', occupancy: 'rented', code: `${MARK}-4B` });
      expect(unit).toMatchObject({ name: 'ফ্ল্যাট ৪বি', sizeSqft: '1250.5', occupancy: 'vacant', address: expect.arrayContaining(['ব্লক সি', 'রোড ৯']) });
      const row = await prisma.locations.findUniqueOrThrow({ where: { id: unit.id } });
      expect(row.path).toBe(locationPath(tree.road9.path, unit.id));

      await send('post', '/units/bulk', admin.cookie)
        .send({ parentId: tree.road9.id, names: ['ফ্ল্যাট ১এ', 'ফ্ল্যাট ১বি'], unitType: 'residential', sizeSqft: null, billTo: 'renter' })
        .expect(201);
      // Only to exercise the filter and counts below.
      await prisma.units.update({ where: { location_id: unit.id }, data: { occupancy: 'rented' } });

      const list = unitListSchema.parse((await get(`/units?areaId=${tree.blockC.id}`, admin.cookie).expect(200)).body);
      expect(list.total).toBe(3);
      expect(list.counts).toEqual({ total: 3, owner_occupied: 0, rented: 1, vacant: 2 });

      const rented = unitListSchema.parse((await get(`/units?areaId=${tree.blockC.id}&occupancy=rented`, admin.cookie).expect(200)).body);
      expect(rented.items.map((item) => item.name)).toEqual(['ফ্ল্যাট ৪বি']);
      // Counts ignore the occupancy filter, so the stat cards stay put.
      expect(rented.counts.total).toBe(3);

      // ASCII digits find a name typed with Bangla digits.
      const found = unitListSchema.parse((await get(`/units?q=${encodeURIComponent('ফ্ল্যাট 4')}`, admin.cookie).expect(200)).body);
      expect(found.items.map((item) => item.id)).toContain(unit.id);

      const blockC = await view(`/locations/${tree.blockC.id}`, admin.cookie);
      expect(blockC.children.find((child) => child.id === tree.road9.id)!.unitCount).toBe(3);
    });

    it('edits and deletes a unit with audit rows', async () => {
      const unit = await addUnit('blockD', 'দোকান ১', { unitType: 'shop' });
      const edited = await send('patch', `/units/${unit.id}`, admin.cookie).send({ occupancy: 'owner_occupied', billTo: 'renter' }).expect(200);
      expect(unitDetailSchema.parse(edited.body)).toMatchObject({ occupancy: 'vacant', billTo: 'renter', unitType: 'shop' });

      // A unit is not a tree location: /locations does not change it.
      await send('patch', `/locations/${unit.id}`, admin.cookie).send({ name: 'x' }).expect(404);

      await send('delete', `/units/${unit.id}`, admin.cookie).expect(204);
      expect(await prisma.units.count({ where: { location_id: unit.id } })).toBe(0);
      const audit = await prisma.audit_logs.findMany({ where: { entity_id: unit.id }, orderBy: { created_at: 'asc' } });
      expect(audit.map((row) => row.action)).toEqual(['create', 'update', 'delete']);
    });

    it('refuses a unit under a unit', async () => {
      const unit = await addUnit('blockD', 'অফিস ১', { unitType: 'office' });
      const res = await send('post', '/units', admin.cookie)
        .send({ parentId: unit.id, name: 'x', code: null, unitType: 'other', sizeSqft: null, billTo: 'owner' })
        .expect(400);
      expect(res.body.code).toBe('invalid_level');
    });
  });

  describe('area scope', () => {
    let manager: { id: string; cookie: string };
    let unitInD: string;

    beforeAll(async () => {
      const roleId = await makeRole(['locations:view', 'locations:create', 'locations:edit', 'units:view', 'units:create', 'units:edit']);
      manager = await makeUser([{ roleId, scope: tree.blockC.id }]);
      unitInD = (await addUnit('blockD', 'ফ্ল্যাট ডি-১')).id;
    });

    it('a Block C manager sees Block C and below, not Block D', async () => {
      const top = await view('/locations', manager.cookie);
      expect(top.children.map((child) => child.id)).toEqual([tree.blockC.id]);
      expect(top.can.create).toBe(false);

      await get(`/locations/${tree.blockD.id}`, manager.cookie).expect(404);
      await get(`/locations/${tree.sector.id}`, manager.cookie).expect(404);
      const road = await view(`/locations/${tree.road9.id}`, manager.cookie);
      // The sector is named in the breadcrumb but not open to them.
      expect(road.breadcrumb.map((crumb) => [crumb.id, crumb.open])).toEqual([
        [tree.sector.id, false],
        [tree.blockC.id, true],
      ]);
      expect(road.can).toMatchObject({ create: true, edit: true, delete: false });

      const units = unitListSchema.parse((await get('/units?pageSize=100', manager.cookie).expect(200)).body);
      expect(units.items.length).toBeGreaterThan(0);
      expect(units.items.every((unit) => unit.address.includes('ব্লক সি'))).toBe(true);
      await get(`/units/${unitInD}`, manager.cookie).expect(404);
    });

    it('a Block C manager adds and changes only inside Block C', async () => {
      await send('post', '/locations', manager.cookie).send({ parentId: tree.blockC.id, levelId: level(3), name: 'রোড ১২', code: null }).expect(201);
      await send('post', '/locations', manager.cookie).send({ parentId: tree.blockD.id, levelId: level(3), name: 'রোড ১৩', code: null }).expect(404);
      const top = await send('post', '/locations', manager.cookie).send({ parentId: null, levelId: level(1), name: 'নতুন', code: null }).expect(403);
      expect(top.body.code).toBe('beyond_your_permissions');
      await send('patch', `/locations/${tree.blockD.id}`, manager.cookie).send({ name: 'x' }).expect(404);
      await send('post', '/units/bulk', manager.cookie)
        .send({ parentId: tree.blockD.id, names: ['x'], unitType: 'residential', sizeSqft: null, billTo: 'owner' })
        .expect(404);
      await send('patch', `/units/${unitInD}`, manager.cookie).send({ billTo: 'renter' }).expect(404);
      // No locations:delete, even inside the block.
      await send('delete', `/locations/${tree.road9.id}`, manager.cookie).expect(403);
    });
  });

  describe('society boundary', () => {
    let foreignLevel: string;
    let foreignLocation: { id: string; path: string };

    beforeAll(async () => {
      foreignLevel = (
        await prisma.location_levels.create({ data: { society_id: otherSocietyId, depth: 1, name_bn: 'ব্লক' } })
      ).id;
      const id = randomUUID();
      await prisma.locations.create({ data: { id, society_id: otherSocietyId, level_id: foreignLevel, name: 'এ', path: locationPath(null, id) } });
      foreignLocation = { id, path: locationPath(null, id) };
    });

    it("hides another society's locations, even from full access", async () => {
      await get(`/locations/${foreignLocation.id}`, admin.cookie).expect(404);
      const top = await view('/locations', admin.cookie);
      expect(top.children.some((child) => child.id === foreignLocation.id)).toBe(false);
      await send('patch', `/locations/${foreignLocation.id}`, admin.cookie).send({ name: 'x' }).expect(404);
      await send('delete', `/locations/${foreignLocation.id}`, admin.cookie).expect(404);
      await send('post', '/locations', admin.cookie).send({ parentId: foreignLocation.id, levelId: level(2), name: 'x', code: null }).expect(404);
      await send('post', '/units', admin.cookie)
        .send({ parentId: foreignLocation.id, name: 'x', code: null, unitType: 'other', sizeSqft: null, billTo: 'owner' })
        .expect(404);
      const units = unitListSchema.parse((await get(`/units?areaId=${foreignLocation.id}`, admin.cookie).expect(200)).body);
      expect(units.total).toBe(0);
    });

    it("refuses another society's level", async () => {
      const res = await send('post', '/locations', admin.cookie)
        .send({ parentId: tree.sector.id, levelId: foreignLevel, name: 'x', code: null })
        .expect(400);
      expect(res.body.code).toBe('invalid_level');
    });

    it('needs the permission', async () => {
      const viewer = await makeUser([{ roleId: await makeRole(['notices:view']) }]);
      await get('/locations', viewer.cookie).expect(403);
      await get('/units', viewer.cookie).expect(403);
      await send('put', '/location-levels', viewer.cookie).send({ levels: [] }).expect(403);
      await request(server()).get('/units').expect(401);
    });
  });

  describe('levels', () => {
    // Rules are tested on a separate society through the service, so the shared levels
    // other test files rely on never change (the API only serves DEFAULT_SOCIETY_SLUG).
    let ids: string[];
    let actor: Actor;
    let levelSociety: string;

    beforeAll(async () => {
      levelSociety = (await prisma.societies.create({ data: { name_bn: `স্তর ${MARK}`, slug: `${MARK}-levels` } })).id;
      extraSocieties.push(levelSociety);
      const made = [];
      for (const [index, name] of ['ব্লক', 'রোড', 'ইউনিট'].entries()) {
        made.push(
          await prisma.location_levels.create({
            data: { society_id: levelSociety, depth: index + 1, name_bn: name, is_unit_level: index === 2 },
          }),
        );
      }
      ids = made.map((row) => row.id);
      const id = randomUUID();
      await prisma.locations.create({ data: { id, society_id: levelSociety, level_id: ids[0]!, name: 'এ', path: locationPath(null, id) } });
      actor = { societyId: levelSociety, userId: admin.id, access: new CallerAccess([]), ip: null };
    });

    const save = (levels: { id: string | null; nameBn: string; nameEn?: string | null }[]) =>
      app.get(LevelsService).replace(actor, { levels: levels.map((l) => ({ nameEn: null, ...l })) });

    it('renames, adds and removes unused levels', async () => {
      const saved = await save([
        { id: ids[0]!, nameBn: 'ব্লক', nameEn: 'Block' },
        { id: null, nameBn: 'প্লট' },
        { id: ids[2]!, nameBn: 'ফ্ল্যাট' },
      ]);
      expect(saved.map((l) => [l.nameBn, l.depth, l.isUnitLevel])).toEqual([
        ['ব্লক', 1, false],
        ['প্লট', 2, false],
        ['ফ্ল্যাট', 3, true],
      ]);
      expect(await prisma.location_levels.count({ where: { id: ids[1]! } })).toBe(0);

      // Names can swap places in one save.
      const swapped = await save([
        { id: saved[0]!.id, nameBn: 'প্লট' },
        { id: saved[1]!.id, nameBn: 'ব্লক' },
        { id: saved[2]!.id, nameBn: 'ফ্ল্যাট' },
      ]);
      expect(swapped.map((l) => l.nameBn)).toEqual(['প্লট', 'ব্লক', 'ফ্ল্যাট']);
    });

    it('keeps a level in use', async () => {
      const current = await app.get(LevelsService).list(levelSociety);
      await expect(save(current.slice(1))).rejects.toMatchObject({ response: { code: 'level_in_use' } });
      // The used level can't become the unit level either.
      await expect(save([{ id: null, nameBn: 'নতুন' }, current[0]!])).rejects.toMatchObject({ response: { code: 'level_in_use' } });
    });

    it('lists the levels with their use', async () => {
      const res = await get('/location-levels', admin.cookie).expect(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(2);
      expect(res.body.items.at(-1).isUnitLevel).toBe(true);
    });
  });
});
