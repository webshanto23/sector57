import { INestApplication } from '@nestjs/common';
import {
  AUTH_COOKIES,
  CSRF_HEADER,
  locationViewSchema,
  memberRegisterSchema,
  ownerRegisterSchema,
  ownershipSchema,
  renterRegisterSchema,
  unitDetailSchema,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-registers-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `016${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

describe('Registers: members, owners and renters (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let levels: { id: string; depth: number }[];
  const server = () => app.getHttpServer();
  // sector > block C > road 9 > plot 14 > flats 1A and 1B; block D > shop D1.
  const tree = {} as Record<'sector' | 'blockC' | 'blockD' | 'road9' | 'plot14', { id: string; path: string }>;
  const units = {} as Record<'flat1A' | 'flat1B' | 'shopD1', string>;
  const ids = {} as Record<'plotOwner' | 'shopOwner' | 'renter', string>;
  let admin: { cookie: string };
  let blockC: { cookie: string };
  let memberNo: number;

  async function makeUser(roleId: string, scope: string | null) {
    const phone = randomPhone();
    const person = await prisma.persons.create({ data: { society_id: societyId, full_name: `ব্যবহারকারী ${MARK}`, phone } });
    const user = await prisma.users.create({ data: { society_id: societyId, person_id: person.id, phone, status: 'active' } });
    await prisma.user_roles.create({ data: { user_id: user.id, role_id: roleId, scope_location_id: scope } });
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId, sessionId: randomUUID() });
    return { cookie: `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}` };
  }

  const send = (url: string, body: object) =>
    request(server()).post(url).set('Cookie', admin.cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF).send(body);
  const get = (url: string, cookie = admin.cookie) => request(server()).get(url).set('Cookie', cookie).expect(200);
  const level = (depth: number) => levels.find((l) => l.depth === depth)!.id;
  const person = (name: string) => ({ kind: 'person', person: { fullName: `${name} ${MARK}`, phone: randomPhone() } });

  async function addLocation(parent: keyof typeof tree | null, depth: number, name: string) {
    const res = await send('/locations', { parentId: parent ? tree[parent].id : null, levelId: level(depth), name, code: null }).expect(201);
    const id = locationViewSchema.parse(res.body).location!.id;
    return prisma.locations.findUniqueOrThrow({ where: { id }, select: { id: true, path: true } });
  }

  async function addUnit(parent: keyof typeof tree, name: string, unitType = 'residential') {
    const res = await send('/units', { parentId: tree[parent].id, name, code: null, unitType, sizeSqft: null, billTo: 'owner' }).expect(201);
    return unitDetailSchema.parse(res.body).id;
  }

  async function own(locationId: string, owner: object) {
    const res = await send('/ownerships', { locationId, owner, sharePercent: '100', startDate: '2020-01-01' }).expect(201);
    return ownershipSchema.parse(res.body).owner.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    societyId = (await prisma.societies.findUniqueOrThrow({ where: { slug: 'sector57' } })).id;
    levels = await prisma.location_levels.findMany({ where: { society_id: societyId }, select: { id: true, depth: true } });
    const systemRoleId = (await prisma.roles.findFirstOrThrow({ where: { society_id: societyId, is_system: true } })).id;
    admin = await makeUser(systemRoleId, null);

    tree.sector = await addLocation(null, 1, `${MARK} সেক্টর`);
    tree.blockC = await addLocation('sector', 2, 'ব্লক সি');
    tree.blockD = await addLocation('sector', 2, 'ব্লক ডি');
    tree.road9 = await addLocation('blockC', 3, 'রোড ৯');
    tree.plot14 = await addLocation('road9', 4, 'প্লট ১৪');
    units.flat1A = await addUnit('plot14', 'ফ্ল্যাট ১এ');
    units.flat1B = await addUnit('plot14', 'ফ্ল্যাট ১বি');
    units.shopD1 = await addUnit('blockD', 'দোকান ১', 'shop');

    // The plot owner also owns flat 1B and lives in 1A; the shop owner lives elsewhere and is not a member.
    const plotOwner = person('আনিস রহমান');
    ids.plotOwner = await own(tree.plot14.id, plotOwner);
    expect(await own(units.flat1B, plotOwner)).toBe(ids.plotOwner);
    await send('/occupants', { unitId: units.flat1A, tenancyId: null, personId: ids.plotOwner, relation: 'head', startDate: '2020-01-01' }).expect(201);
    ids.shopOwner = await own(units.shopD1, person('সেলিম খান'));
    memberNo = 900000 + Math.floor(Math.random() * 99999);
    await prisma.memberships.create({ data: { society_id: societyId, person_id: ids.plotOwner, member_no: memberNo, joined_on: new Date('2024-01-01') } });

    const tenancy = await send('/tenancies', {
      unitId: units.shopD1,
      renter: person('করিম স্টোর'),
      renterType: 'shop',
      status: 'active',
      startDate: '2026-03-01',
      monthlyRent: '15000',
    }).expect(201);
    ids.renter = tenancy.body.renter.id;

    const role = await prisma.roles.create({ data: { society_id: societyId, name: `${MARK}-viewer` } });
    const view = await prisma.permissions.findFirstOrThrow({ where: { module: 'members', action: 'view' } });
    await prisma.role_permissions.create({ data: { role_id: role.id, permission_id: view.id } });
    blockC = await makeUser(role.id, tree.blockC.id);
  });

  afterAll(async () => {
    if (prisma) {
      const locationIds = tree.sector
        ? (await prisma.locations.findMany({ where: { path: { startsWith: tree.sector.path } }, select: { id: true } })).map((row) => row.id)
        : [];
      const persons = (await prisma.persons.findMany({ where: { full_name: { contains: MARK } }, select: { id: true } })).map((row) => row.id);
      await prisma.memberships.deleteMany({ where: { person_id: { in: persons } } });
      await prisma.move_events.deleteMany({ where: { tenancies: { unit_id: { in: locationIds } } } });
      await prisma.occupants.deleteMany({ where: { unit_id: { in: locationIds } } });
      await prisma.tenancies.deleteMany({ where: { unit_id: { in: locationIds } } });
      await prisma.ownerships.deleteMany({ where: { location_id: { in: locationIds } } });
      const users = (await prisma.users.findMany({ where: { person_id: { in: persons } }, select: { id: true } })).map((row) => row.id);
      await prisma.audit_logs.deleteMany({ where: { user_id: { in: users } } });
      await prisma.user_roles.deleteMany({ where: { user_id: { in: users } } });
      await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
      await prisma.users.deleteMany({ where: { id: { in: users } } });
      await prisma.persons.deleteMany({ where: { id: { in: persons } } });
      const rows = tree.sector ? await prisma.locations.findMany({ where: { path: { startsWith: tree.sector.path } }, select: { id: true, path: true } }) : [];
      rows.sort((a, b) => b.path.length - a.path.length);
      for (const row of rows) await prisma.locations.delete({ where: { id: row.id } });
    }
    await app?.close();
  });

  it('lists members with what they own, by level', async () => {
    const list = memberRegisterSchema.parse((await get(`/registers/members?areaId=${tree.sector.id}`)).body);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ memberNo, status: 'active', person: { id: ids.plotOwner } });
    expect(list.items[0]!.holdings.map((holding) => holding.count)).toEqual([1, 1]);
    const lapsed = memberRegisterSchema.parse((await get(`/registers/members?status=lapsed&areaId=${tree.sector.id}`)).body);
    expect(lapsed.items).toHaveLength(0);
  });

  it('finds a member by membership ID: the full code, its number, or Bangla digits', async () => {
    const { membership_code: code } = await prisma.memberships.findFirstOrThrow({ where: { member_no: memberNo, society_id: societyId } });
    const banglaNo = String(memberNo).replace(/\d/g, (digit) => '০১২৩৪৫৬৭৮৯'[Number(digit)]!);
    for (const q of [code!.toLowerCase(), String(memberNo), banglaNo]) {
      const list = memberRegisterSchema.parse((await get(`/registers/members?q=${encodeURIComponent(q)}&areaId=${tree.sector.id}`)).body);
      expect(list.items.map((row) => row.person.id)).toEqual([ids.plotOwner]);
    }
  });

  it('lists owners with membership and where they live, and filters non-members', async () => {
    const list = ownerRegisterSchema.parse((await get(`/registers/owners?areaId=${tree.sector.id}`)).body);
    const plot = list.items.find((row) => row.id === ids.plotOwner)!;
    const shop = list.items.find((row) => row.id === ids.shopOwner)!;
    expect(plot).toMatchObject({ memberNo, livesHere: true, otherPlaces: 1, place: { id: tree.plot14.id } });
    expect(shop).toMatchObject({ memberNo: null, livesHere: false, otherPlaces: 0 });

    const notMembers = ownerRegisterSchema.parse((await get(`/registers/owners?membership=not_member&areaId=${tree.sector.id}`)).body);
    expect(notMembers.items.map((row) => row.id)).toEqual([ids.shopOwner]);
    const elsewhere = ownerRegisterSchema.parse((await get(`/registers/owners?residence=elsewhere&areaId=${tree.sector.id}`)).body);
    expect(elsewhere.items.map((row) => row.id)).toEqual([ids.shopOwner]);
  });

  it('lists renters with the unit, its type and the move-in date', async () => {
    const list = renterRegisterSchema.parse((await get(`/registers/renters?areaId=${tree.sector.id}`)).body);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      renter: { id: ids.renter },
      renterType: 'shop',
      startDate: '2026-03-01',
      monthlyRent: '15000',
      unit: { id: units.shopD1 },
      unitType: { code: 'shop' },
      residents: 1,
    });
    const flats = renterRegisterSchema.parse((await get(`/registers/renters?unitType=residential&areaId=${tree.sector.id}`)).body);
    expect(flats.items).toHaveLength(0);
  });

  it('keeps an area-limited caller to their area', async () => {
    const owners = ownerRegisterSchema.parse((await get('/registers/owners', blockC.cookie)).body);
    expect(owners.items.map((row) => row.id)).toContain(ids.plotOwner);
    expect(owners.items.map((row) => row.id)).not.toContain(ids.shopOwner);

    const renters = renterRegisterSchema.parse((await get('/registers/renters', blockC.cookie)).body);
    expect(renters.items.map((row) => row.tenancyId)).toHaveLength(0);
    const outside = renterRegisterSchema.parse((await get(`/registers/renters?areaId=${tree.blockD.id}`, blockC.cookie)).body);
    expect(outside.items).toHaveLength(0);

    const members = memberRegisterSchema.parse((await get('/registers/members', blockC.cookie)).body);
    expect(members.items.map((row) => row.person.id)).toEqual([ids.plotOwner]);
  });
});
