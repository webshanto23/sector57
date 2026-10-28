import { INestApplication } from '@nestjs/common';
import { Prisma } from '@s57/db';
import { AUTH_COOKIES, locationPath, unitListSchema, type UnitList } from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-unit-people-${Date.now()}`;
const KARIM_PHONE = '01711223344';
const JAMAL_PHONE = '01811556677';

/** Step 35: owners at every level and renters on the units list, and finding units by them. */
describe('Units list: owners and renters (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  const ids = {} as Record<'plot' | 'building' | 'flatA' | 'flatB' | 'flatC', string>;
  const users = {} as Record<'admin' | 'unitsOnly' | 'owners', string>;
  const names = {} as Record<'plot' | 'building' | 'flat', { levelBn: string; levelEn: string | null }>;

  async function makeUser(permissions: string[]) {
    const role = await prisma.roles.create({ data: { society_id: societyId, name: `${MARK}-${randomUUID()}` } });
    const rows = await prisma.permissions.findMany();
    await prisma.role_permissions.createMany({
      data: permissions.map((name) => ({ role_id: role.id, permission_id: rows.find((p) => `${p.module}:${p.action}` === name)!.id })),
    });
    const phone = `019${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    const person = await prisma.persons.create({ data: { society_id: societyId, full_name: `ব্যবহারকারী ${MARK}`, phone } });
    const user = await prisma.users.create({ data: { society_id: societyId, person_id: person.id, phone, status: 'active' } });
    await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.id } });
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId, sessionId: randomUUID() });
    return `${AUTH_COOKIES.access}=${token}`;
  }

  async function addLocation(levelId: string, parent: { id: string; path: string } | null, name: string) {
    const id = randomUUID();
    const path = parent ? locationPath(parent.path, id) : `/${id}/`;
    await prisma.locations.create({ data: { id, society_id: societyId, level_id: levelId, parent_id: parent?.id ?? null, name, path } });
    return { id, path };
  }

  const list = async (query: string, cookie: string): Promise<UnitList> =>
    unitListSchema.parse((await request(app.getHttpServer()).get(`/units?pageSize=100&areaId=${ids.plot}&${query}`).set('Cookie', cookie).expect(200)).body);
  const byName = (result: UnitList) => new Map(result.items.map((item) => [item.name, item]));
  const search = async (q: string, cookie: string) => (await list(`q=${encodeURIComponent(q)}`, cookie)).items.map((item) => item.name).sort();

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    societyId = (await prisma.societies.findUniqueOrThrow({ where: { slug: 'sector57' } })).id;
    // Three of the society's levels, top down: the plot sits at the top, under its own name.
    const levels = await prisma.location_levels.findMany({ where: { society_id: societyId }, orderBy: { depth: 'asc' } });
    const flatLevel = levels.find((level) => level.is_unit_level)!;
    const [plotLevel, buildingLevel] = levels.filter((level) => !level.is_unit_level).slice(-2);
    for (const [key, level] of [['plot', plotLevel!], ['building', buildingLevel!], ['flat', flatLevel]] as const) {
      names[key] = { levelBn: level.name_bn, levelEn: level.name_en };
    }

    const plot = await addLocation(plotLevel!.id, null, `${MARK} প্লট`);
    const building = await addLocation(buildingLevel!.id, plot, 'ভবন ক');
    ids.plot = plot.id;
    ids.building = building.id;
    for (const [key, name] of [['flatA', 'ফ্ল্যাট এ'], ['flatB', 'ফ্ল্যাট বি'], ['flatC', 'ফ্ল্যাট সি']] as const) {
      ids[key] = (await addLocation(flatLevel.id, building, name)).id;
      await prisma.units.create({ data: { location_id: ids[key], society_id: societyId, unit_type: 'residential' } });
    }

    const person = async (full_name: string, extra: { full_name_en?: string; phone?: string } = {}) =>
      (await prisma.persons.create({ data: { society_id: societyId, full_name: `${full_name} ${MARK}`, ...extra } })).id;
    const own = (location_id: string, party: { person_id: string } | { organisation_id: string }, share = 100) =>
      prisma.ownerships.create({ data: { society_id: societyId, location_id, ...party, share_percent: new Prisma.Decimal(share), start_date: new Date('2020-01-01') } });
    const rent = (unit_id: string, person_id: string, status: string) =>
      prisma.tenancies.create({ data: { society_id: societyId, unit_id, renter_type: 'family', primary_person_id: person_id, start_date: new Date('2025-01-01'), status } });

    await own(ids.plot, { person_id: await person('আব্দুল করিম', { phone: KARIM_PHONE }) });
    const developer = await prisma.organisations.create({ data: { society_id: societyId, name: `রূপায়ণ ডেভেলপার্স ${MARK}` } });
    await own(ids.building, { organisation_id: developer.id });
    await own(ids.flatA, { person_id: await person('রহিম উদ্দিন', { full_name_en: 'Rahim Uddin' }) }, 60);
    // Co-owners show the largest share first.
    await own(ids.flatA, { person_id: await person('সালমা বেগম') }, 40);
    await rent(ids.flatB, await person('জামাল হোসেন', { phone: JAMAL_PHONE }), 'active');
    await rent(ids.flatC, await person('নাসির আহমেদ'), 'pending');

    const everything = (await prisma.permissions.findMany()).map((p) => `${p.module}:${p.action}`);
    users.admin = await makeUser(everything);
    users.unitsOnly = await makeUser(['units:view']);
    users.owners = await makeUser(['units:view', 'ownerships:view']);
  });

  afterAll(async () => {
    if (ids.plot) {
      const flats = [ids.flatA, ids.flatB, ids.flatC].filter(Boolean);
      await prisma.tenancies.deleteMany({ where: { unit_id: { in: flats } } });
      await prisma.ownerships.deleteMany({ where: { location_id: { in: [ids.plot, ids.building, ...flats].filter(Boolean) } } });
      await prisma.organisations.deleteMany({ where: { name: { endsWith: MARK } } });
      await prisma.units.deleteMany({ where: { location_id: { in: flats } } });
      for (const id of [...flats, ids.building, ids.plot].filter(Boolean)) await prisma.locations.delete({ where: { id } });
    }
    if (prisma) {
      const persons = (await prisma.persons.findMany({ where: { full_name: { endsWith: MARK } }, select: { id: true } })).map((p) => p.id);
      const userIds = (await prisma.users.findMany({ where: { person_id: { in: persons } }, select: { id: true } })).map((u) => u.id);
      await prisma.user_roles.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
      await prisma.users.deleteMany({ where: { id: { in: userIds } } });
      await prisma.persons.deleteMany({ where: { id: { in: persons } } });
    }
    await app?.close();
  });

  it('lists the owners at every level, nearest first, and the current renter', async () => {
    const units = byName(await list('', users.admin));
    const flatA = units.get('ফ্ল্যাট এ')!;
    expect(flatA.owners).toEqual([
      { locationId: ids.flatA, isUnit: true, ...names.flat, owners: [{ name: `রহিম উদ্দিন ${MARK}`, nameEn: 'Rahim Uddin' }, { name: `সালমা বেগম ${MARK}`, nameEn: null }] },
      { locationId: ids.building, isUnit: false, ...names.building, owners: [{ name: `রূপায়ণ ডেভেলপার্স ${MARK}`, nameEn: null }] },
      { locationId: ids.plot, isUnit: false, ...names.plot, owners: [{ name: `আব্দুল করিম ${MARK}`, nameEn: null }] },
    ]);
    expect(flatA.renters).toEqual([]);
    const flatB = units.get('ফ্ল্যাট বি')!;
    expect(flatB.owners!.map((level) => level.locationId)).toEqual([ids.building, ids.plot]);
    expect(flatB.renters).toEqual([{ name: `জামাল হোসেন ${MARK}`, nameEn: null }]);
    // A pending tenancy has not moved in yet.
    expect(units.get('ফ্ল্যাট সি')!.renters).toEqual([]);
  });

  it('finds units by an owner at any level or the renter, by name or phone', async () => {
    expect(await search('Rahim Uddin', users.admin)).toEqual(['ফ্ল্যাট এ']);
    // The plot owner's phone, typed with Bangla digits, finds every flat on the plot.
    expect(await search('০১৭১১২২৩৩৪৪', users.admin)).toEqual(['ফ্ল্যাট এ', 'ফ্ল্যাট বি', 'ফ্ল্যাট সি']);
    expect(await search('রূপায়ণ', users.admin)).toHaveLength(3);
    expect(await search(JAMAL_PHONE.slice(-6), users.admin)).toEqual(['ফ্ল্যাট বি']);
    expect(await search('নাসির', users.admin)).toEqual([]);
  });

  it('shows and finds people only with the permission for them', async () => {
    const plain = await list('', users.unitsOnly);
    expect(plain.items.every((item) => item.owners === null && item.renters === null)).toBe(true);
    expect(await search(KARIM_PHONE, users.unitsOnly)).toEqual([]);
    expect(await search('রহিম', users.unitsOnly)).toEqual([]);

    const owners = byName(await list('', users.owners));
    expect(owners.get('ফ্ল্যাট এ')!.owners).toHaveLength(3);
    expect(owners.get('ফ্ল্যাট বি')!.renters).toBeNull();
    expect(await search(KARIM_PHONE, users.owners)).toHaveLength(3);
    expect(await search(JAMAL_PHONE, users.owners)).toEqual([]);
  });
});
