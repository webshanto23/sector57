import { INestApplication } from '@nestjs/common';
import {
  AUTH_COOKIES,
  bnDigits,
  CSRF_HEADER,
  locationPeopleSchema,
  locationViewSchema,
  occupantSchema,
  ownershipSchema,
  personDetailSchema,
  renterRegisterSchema,
  tenancySchema,
  unitDetailSchema,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-members-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `016${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const randomNid = () => String(Math.floor(1e9 + Math.random() * 9e9));

describe('Members: people, owners, renters and households (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let otherSocietyId: string;
  let levels: { id: string; depth: number }[];
  const server = () => app.getHttpServer();
  // sector > block C > road 9 > plot 14 > flats 1A and 1B; block D > shop D1.
  const tree = {} as Record<'sector' | 'blockC' | 'blockD' | 'road9' | 'plot14', { id: string; path: string }>;
  const units = {} as Record<'flat1A' | 'flat1B' | 'shopD1', string>;
  let admin: { id: string; cookie: string };

  async function permissionIds(names: string[]) {
    const rows = await prisma.permissions.findMany();
    return names.map((name) => rows.find((p) => `${p.module}:${p.action}` === name)!.id);
  }

  async function makeRole(permissions: string[]) {
    const role = await prisma.roles.create({ data: { society_id: societyId, name: `${MARK}-${randomUUID()}` } });
    await prisma.role_permissions.createMany({
      data: (await permissionIds(permissions)).map((permission_id) => ({ role_id: role.id, permission_id })),
    });
    return role.id;
  }

  async function makeUser(roles: { roleId: string; scope?: string }[]) {
    const phone = randomPhone();
    const person = await prisma.persons.create({ data: { society_id: societyId, full_name: `ব্যবহারকারী ${MARK}`, phone } });
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
  const person = (name: string, extra: Record<string, unknown> = {}) => ({
    kind: 'person',
    person: { fullName: `${name} ${MARK}`, phone: randomPhone(), ...extra },
  });
  const occupancy = async (unitId: string) => unitDetailSchema.parse((await get(`/units/${unitId}`, admin.cookie).expect(200)).body).occupancy;
  const renters = async (query: string) => renterRegisterSchema.parse((await get(`/registers/renters?${query}`, admin.cookie).expect(200)).body);
  const personNamed = async (name: string) =>
    (await prisma.persons.findFirstOrThrow({ where: { AND: [{ full_name: { contains: name } }, { full_name: { contains: MARK } }] } })).id;

  async function addLocation(parent: keyof typeof tree | null, depth: number, name: string) {
    const res = await send('post', '/locations', admin.cookie)
      .send({ parentId: parent ? tree[parent].id : null, levelId: level(depth), name, code: null })
      .expect(201);
    const id = locationViewSchema.parse(res.body).location!.id;
    const row = await prisma.locations.findUniqueOrThrow({ where: { id } });
    return { id: row.id, path: row.path };
  }

  async function addUnit(parent: keyof typeof tree, name: string) {
    const res = await send('post', '/units', admin.cookie)
      .send({ parentId: tree[parent].id, name, code: null, unitType: 'residential', sizeSqft: null, billTo: 'owner' })
      .expect(201);
    return unitDetailSchema.parse(res.body).id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    societyId = (await prisma.societies.findUniqueOrThrow({ where: { slug: 'sector57' } })).id;
    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: MARK } })).id;
    const systemRoleId = (await prisma.roles.findFirstOrThrow({ where: { society_id: societyId, is_system: true } })).id;
    levels = await prisma.location_levels.findMany({ where: { society_id: societyId }, select: { id: true, depth: true } });
    admin = await makeUser([{ roleId: systemRoleId }]);

    tree.sector = await addLocation(null, 1, `${MARK} সেক্টর`);
    tree.blockC = await addLocation('sector', 2, 'ব্লক সি');
    tree.blockD = await addLocation('sector', 2, 'ব্লক ডি');
    tree.road9 = await addLocation('blockC', 3, 'রোড ৯');
    tree.plot14 = await addLocation('road9', 4, 'প্লট ১৪');
    units.flat1A = await addUnit('plot14', 'ফ্ল্যাট ১এ');
    units.flat1B = await addUnit('plot14', 'ফ্ল্যাট ১বি');
    units.shopD1 = await addUnit('blockD', 'দোকান ১');
  });

  afterAll(async () => {
    if (prisma) {
      const paths = tree.sector ? { path: { startsWith: tree.sector.path } } : { id: { in: [] } };
      const locationIds = (await prisma.locations.findMany({ where: paths, select: { id: true } })).map((row) => row.id);
      await prisma.occupants.deleteMany({ where: { unit_id: { in: locationIds } } });
      await prisma.tenancies.deleteMany({ where: { unit_id: { in: locationIds } } });
      await prisma.ownerships.deleteMany({ where: { location_id: { in: locationIds } } });
      await prisma.organisations.deleteMany({ where: { name: { contains: MARK } } });
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
      const rows = await prisma.locations.findMany({ where: { OR: [paths, { society_id: otherSocietyId }] }, select: { id: true, path: true } });
      rows.sort((a, b) => b.path.length - a.path.length);
      for (const row of rows) await prisma.locations.delete({ where: { id: row.id } });
      await prisma.audit_logs.deleteMany({ where: { society_id: otherSocietyId } });
      await prisma.societies.deleteMany({ where: { id: otherSocietyId } });
    }
    await app?.close();
  });

  describe('ownership, tenancy and the derived occupancy', () => {
    let ownerPhone: string;
    let ownerId: string;
    let ownershipId: string;

    it('owning a plot does not make the flats below owner-occupied', async () => {
      expect(await occupancy(units.flat1A)).toBe('vacant');
      const owner = person('জাহাঙ্গীর আলম');
      ownerPhone = owner.person.phone;
      const res = await send('post', '/ownerships', admin.cookie)
        .send({ locationId: tree.plot14.id, owner, sharePercent: '৬০', startDate: '2020-01-01' })
        .expect(201);
      const ownership = ownershipSchema.parse(res.body);
      ownershipId = ownership.id;
      ownerId = ownership.owner.id;
      expect(ownership).toMatchObject({ sharePercent: '60', endDate: null, place: { id: tree.plot14.id, isUnit: false } });
      // Owned, but nobody lives there yet.
      expect(await occupancy(units.flat1A)).toBe('vacant');
      expect(await occupancy(units.shopD1)).toBe('vacant');

      const flat2 = await addUnit('plot14', 'ফ্ল্যাট ২এ');
      expect(await occupancy(flat2)).toBe('vacant');
      await send('delete', `/units/${flat2}`, admin.cookie).expect(204);
    });

    it('co-owners: shares stay within 100% and nobody is listed twice', async () => {
      const over = await send('post', '/ownerships', admin.cookie)
        .send({ locationId: tree.plot14.id, owner: person('রোকেয়া বেগম'), sharePercent: '50', startDate: '2020-01-01' })
        .expect(409);
      expect(over.body.code).toBe('shares_over_100');

      // The same phone reuses the stored person: already an owner here.
      const twice = await send('post', '/ownerships', admin.cookie)
        .send({ locationId: tree.plot14.id, owner: { kind: 'person', person: { fullName: 'অন্য নাম', phone: ownerPhone } }, sharePercent: '10', startDate: '2020-01-01' })
        .expect(409);
      expect(twice.body.code).toBe('already_owner');

      const co = await send('post', '/ownerships', admin.cookie)
        .send({
          locationId: tree.plot14.id,
          owner: { kind: 'organisation', organisation: { name: `নূর ট্রেডার্স ${MARK}`, tradeLicence: `TL-${MARK}` } },
          sharePercent: '40',
          startDate: '2021-06-01',
        })
        .expect(201);
      expect(ownershipSchema.parse(co.body).owner).toMatchObject({ kind: 'organisation', verified: null });

      const bad = await send('post', '/ownerships', admin.cookie)
        .send({ locationId: tree.plot14.id, owner: person('x'), sharePercent: '0', startDate: '2020-01-01' })
        .expect(400);
      expect(JSON.stringify(bad.body)).toContain('invalid_share');
    });

    it('an owner of the plot marked as living in a flat makes only that flat owner-occupied; nobody else by id', async () => {
      const res = await send('post', '/occupants', admin.cookie)
        .send({ unitId: units.flat1A, tenancyId: null, personId: ownerId, relation: 'head', startDate: '2020-01-01' })
        .expect(201);
      expect(occupantSchema.parse(res.body)).toMatchObject({ tenancyId: null, relation: 'head', person: { id: ownerId } });
      expect(await occupancy(units.flat1A)).toBe('owner_occupied');
      expect(await occupancy(units.flat1B)).toBe('vacant');
      // Someone with no record at this unit can't be attached by id.
      const stranger = await prisma.persons.create({ data: { society_id: societyId, full_name: `অচেনা ${MARK}` } });
      const refused = await send('post', '/occupants', admin.cookie)
        .send({ unitId: units.flat1B, tenancyId: null, personId: stranger.id, relation: 'head', startDate: '2020-01-01' })
        .expect(400);
      expect(refused.body.code).toBe('invalid_person');
      await send('post', '/occupants', admin.cookie)
        .send({ unitId: units.flat1B, tenancyId: null, relation: 'head', startDate: '2020-01-01' })
        .expect(400);
    });

    it('a renter makes the flat rented once active and becomes a resident; ending the tenancy ends its household', async () => {
      const res = await send('post', '/tenancies', admin.cookie)
        .send({ unitId: units.flat1A, renter: person('রাশেদ হোসেন'), renterType: 'family', status: 'pending', startDate: '2026-01-01', monthlyRent: '২৫,০০০' })
        .expect(201);
      const tenancy = tenancySchema.parse(res.body);
      expect(tenancy).toMatchObject({ status: 'pending', monthlyRent: '25000', renterType: 'family' });
      // The renter is the head of the renter's household.
      const head = await prisma.occupants.findFirstOrThrow({ where: { tenancy_id: tenancy.id } });
      expect(head).toMatchObject({ person_id: tenancy.renter!.id, relation: 'head', end_date: null });
      // Not moved in yet: still the owner's.
      expect(await occupancy(units.flat1A)).toBe('owner_occupied');

      const second = await send('post', '/tenancies', admin.cookie)
        .send({ unitId: units.flat1A, renter: person('আরেকজন'), renterType: 'bachelor', startDate: '2026-01-01' })
        .expect(409);
      expect(second.body.code).toBe('tenancy_open_exists');

      await send('patch', `/tenancies/${tenancy.id}`, admin.cookie).send({ status: 'active' }).expect(200);
      expect(await occupancy(units.flat1A)).toBe('rented');
      expect(await occupancy(units.flat1B)).toBe('vacant');

      const spouse = occupantSchema.parse(
        (
          await send('post', '/occupants', admin.cookie)
            .send({ unitId: units.flat1A, tenancyId: tenancy.id, person: { fullName: `সালমা ${MARK}` }, relation: 'spouse', startDate: '2026-01-01' })
            .expect(201)
        ).body,
      );
      expect(spouse).toMatchObject({ tenancyId: tenancy.id, relation: 'spouse', endDate: null });

      // A tenancy of another unit can't hold this household.
      const wrong = await send('post', '/occupants', admin.cookie)
        .send({ unitId: units.flat1B, tenancyId: tenancy.id, person: { fullName: `x ${MARK}` }, relation: 'child', startDate: '2026-01-01' })
        .expect(400);
      expect(wrong.body.code).toBe('invalid_tenancy');

      const early = await send('post', `/tenancies/${tenancy.id}/end`, admin.cookie).send({ endDate: '2025-12-31' }).expect(400);
      expect(early.body.code).toBe('end_before_start');
      const ended = tenancySchema.parse((await send('post', `/tenancies/${tenancy.id}/end`, admin.cookie).send({ endDate: '2026-09-30' }).expect(200)).body);
      expect(ended).toMatchObject({ status: 'ended', endDate: '2026-09-30' });
      expect((await prisma.occupants.findUniqueOrThrow({ where: { id: spouse.id } })).end_date?.toISOString().slice(0, 10)).toBe('2026-09-30');
      expect((await prisma.occupants.findUniqueOrThrow({ where: { id: head.id } })).end_date?.toISOString().slice(0, 10)).toBe('2026-09-30');
      expect(await occupancy(units.flat1A)).toBe('owner_occupied');
      await send('patch', `/tenancies/${tenancy.id}`, admin.cookie).send({ status: 'active' }).expect(409);
    });

    it('a transfer keeps the history; with no owner left the flats are vacant', async () => {
      const early = await send('post', '/ownerships/transfer', admin.cookie)
        .send({ locationId: tree.plot14.id, date: '2020-06-01', owners: [{ owner: person('নতুন মালিক'), sharePercent: '100' }] })
        .expect(400);
      expect(early.body.code).toBe('end_before_start');

      const res = await send('post', '/ownerships/transfer', admin.cookie)
        .send({ locationId: tree.plot14.id, date: '2026-10-01', owners: [{ owner: person('নতুন মালিক'), sharePercent: '100' }] })
        .expect(200);
      expect(res.body.items).toHaveLength(1);

      const people = locationPeopleSchema.parse((await get(`/locations/${tree.plot14.id}/people`, admin.cookie).expect(200)).body);
      expect(people.owners!.filter((row) => row.endDate === null)).toHaveLength(1);
      expect(people.owners!.find((row) => row.id === ownershipId)).toMatchObject({ endDate: '2026-10-01' });
      expect(people.tenancies).toBeNull();

      const flat = locationPeopleSchema.parse((await get(`/locations/${units.flat1A}/people`, admin.cookie).expect(200)).body);
      expect(flat.ownersAbove!.map((row) => row.place.id)).toEqual([tree.plot14.id]);
      expect(flat.tenancies).toHaveLength(1);
      // The owner, the renter and the spouse; the renter's two have moved out.
      expect(flat.occupants).toHaveLength(3);
      expect(flat.occupants!.filter((row) => row.endDate === null).map((row) => row.person.id)).toEqual([ownerId]);

      const current = people.owners!.find((row) => row.endDate === null)!;
      await send('post', `/ownerships/${current.id}/end`, admin.cookie).send({ endDate: '2026-10-05' }).expect(200);
      expect(await occupancy(units.flat1B)).toBe('vacant');
      await send('post', `/ownerships/${current.id}/end`, admin.cookie).send({ endDate: '2026-10-06' }).expect(409);

      // The owner moves out of the flat: nobody of the owner's household is left.
      const ownerHome = flat.occupants!.find((row) => row.endDate === null && row.person.id === ownerId)!;
      expect(await occupancy(units.flat1A)).toBe('owner_occupied');
      await send('post', `/occupants/${ownerHome.id}/end`, admin.cookie).send({ endDate: '2026-10-07' }).expect(200);
      expect(await occupancy(units.flat1A)).toBe('vacant');

      const audit = await prisma.audit_logs.findMany({ where: { user_id: admin.id, entity_type: { in: ['ownership', 'tenancy', 'occupant', 'location'] } } });
      expect(audit.map((row) => row.action)).toEqual(expect.arrayContaining(['create', 'update', 'end', 'ownership_transfer']));
    });

    it('tenancies and households only sit on units', async () => {
      const res = await send('post', '/tenancies', admin.cookie)
        .send({ unitId: tree.plot14.id, renter: person('x'), renterType: 'family', startDate: '2026-01-01' })
        .expect(400);
      expect(res.body.code).toBe('not_a_unit');
    });
  });

  describe('people', () => {
    it('reuses a person by phone or NID, refuses a phone and NID of two people', async () => {
      const nid = randomNid();
      const first = person('করিম উদ্দিন', { nid });
      await send('post', '/occupants', admin.cookie)
        .send({ unitId: units.flat1B, tenancyId: null, person: first.person, relation: 'head', startDate: '2026-01-01' })
        .expect(201);
      // Same NID typed with Bangla digits and a new phone: the same person, so they already live here.
      const again = await send('post', '/occupants', admin.cookie)
        .send({ unitId: units.flat1B, tenancyId: null, person: { fullName: 'কে', nid: bnDigits(nid) }, relation: 'head', startDate: '2026-01-01' })
        .expect(409);
      expect(again.body.code).toBe('already_occupant');

      const other = person('অন্য কেউ');
      await send('post', '/occupants', admin.cookie)
        .send({ unitId: units.flat1B, tenancyId: null, person: other.person, relation: 'driver', startDate: '2026-01-01' })
        .expect(201);
      const conflict = await send('post', '/occupants', admin.cookie)
        .send({ unitId: units.shopD1, tenancyId: null, person: { fullName: 'x', phone: other.person.phone, nid }, relation: 'head', startDate: '2026-01-01' })
        .expect(409);
      expect(conflict.body.code).toBe('person_conflict');
    });

    it('finds a renter by name, English name or phone in either digit form', async () => {
      const phone = randomPhone();
      await send('post', '/tenancies', admin.cookie)
        .send({ unitId: units.shopD1, renter: { kind: 'person', person: { fullName: `সাব্বির ইসলাম ${MARK}`, fullNameEn: 'Sabbir Islam', phone } }, renterType: 'bachelor', startDate: '2026-02-01' })
        .expect(201);

      const byName = await renters(`q=${encodeURIComponent('সাব্বির')}`);
      const sabbir = byName.items.find((row) => row.renter?.name.includes(MARK))!;
      expect(sabbir).toMatchObject({ renterType: 'bachelor', renter: { kind: 'person', verified: false } });
      expect(sabbir.unit).toMatchObject({ id: units.shopD1, isUnit: true, address: expect.arrayContaining(['ব্লক ডি']) });

      const byEnglish = await renters('q=sabbir');
      expect(byEnglish.items.map((row) => row.tenancyId)).toContain(sabbir.tenancyId);
      const byBanglaPhone = await renters(`q=${encodeURIComponent(bnDigits(`${phone.slice(0, 5)}-${phone.slice(5)}`))}`);
      expect(byBanglaPhone.items.map((row) => row.tenancyId)).toEqual([sabbir.tenancyId]);
      const inBlockD = await renters(`areaId=${tree.blockD.id}`);
      expect(inBlockD.items.map((row) => row.tenancyId)).toEqual([sabbir.tenancyId]);
    });

    it('edits a person, keeps phones unique, and deletes only an unlinked one', async () => {
      const created = personDetailSchema.parse(
        (await send('post', '/persons', admin.cookie).send({ fullName: `  নতুন সদস্য ${MARK} `, phone: randomPhone(), nid: randomNid() }).expect(201)).body,
      );
      expect(created.fullName).toBe(`নতুন সদস্য ${MARK}`);
      expect(created.nid).toMatch(/^\d{10}$/);

      const taken = await send('post', '/persons', admin.cookie).send({ fullName: `x ${MARK}`, phone: created.phone }).expect(409);
      expect(taken.body.code).toBe('person_phone_taken');

      const edited = personDetailSchema.parse(
        (await send('patch', `/persons/${created.id}`, admin.cookie).send({ fullName: `সম্পাদিত ${MARK}`, phone: created.phone, nid: created.nid, gender: 'female' }).expect(200)).body,
      );
      expect(edited).toMatchObject({ fullName: `সম্পাদিত ${MARK}`, gender: 'female' });
      const log = await prisma.audit_logs.findFirstOrThrow({ where: { entity_id: created.id, action: 'update' } });
      // The NID itself never goes into the log.
      expect(JSON.stringify(log.after_data)).not.toContain(created.nid!);

      await send('delete', `/persons/${created.id}`, admin.cookie).expect(204);
      const inUse = await send('delete', `/persons/${await personNamed('করিম')}`, admin.cookie).expect(409);
      expect(inUse.body.code).toBe('person_in_use');
    });
  });

  describe('area scope and permissions', () => {
    let manager: { id: string; cookie: string };
    let viewer: { id: string; cookie: string };
    let personInD: string;
    let personInC: string;

    beforeAll(async () => {
      const managerRole = await makeRole([
        'members:view',
        'members:create',
        'members:edit',
        'ownerships:view',
        'ownerships:create',
        'tenancies:view',
        'tenancies:create',
        'units:view',
      ]);
      manager = await makeUser([{ roleId: managerRole, scope: tree.blockC.id }]);
      viewer = await makeUser([{ roleId: await makeRole(['members:view']) }]);
      personInD = await personNamed('সাব্বির');
      personInC = await personNamed('করিম');
    });

    it('a Block C manager sees and changes only people and rows in Block C', async () => {
      await get(`/persons/${personInD}`, manager.cookie).expect(404);
      await send('patch', `/persons/${personInD}`, manager.cookie).send({ fullName: 'x' }).expect(404);
      await get(`/locations/${units.shopD1}/people`, manager.cookie).expect(404);
      await send('post', '/tenancies', manager.cookie)
        .send({ unitId: units.shopD1, renter: person('x'), renterType: 'shop', startDate: '2026-01-01' })
        .expect(404);
      await send('post', '/ownerships', manager.cookie)
        .send({ locationId: tree.blockD.id, owner: person('x'), sharePercent: '100', startDate: '2026-01-01' })
        .expect(404);

      // Inside the block: allowed. No ownerships:edit, so no transfer.
      await get(`/persons/${personInC}`, manager.cookie).expect(200);
      await send('post', '/ownerships/transfer', manager.cookie)
        .send({ locationId: tree.plot14.id, date: '2026-10-10', owners: [{ owner: person('x'), sharePercent: '100' }] })
        .expect(403);
      // Adding someone not linked anywhere is for whole-society roles only.
      const unlinked = await send('post', '/persons', manager.cookie).send({ fullName: `x ${MARK}` }).expect(403);
      expect(unlinked.body.code).toBe('beyond_your_permissions');
    });

    it('the NID is only sent to callers who may edit the person', async () => {
      const nid = randomNid();
      await prisma.persons.update({ where: { id: personInC }, data: { nid } });
      const forViewer = personDetailSchema.parse((await get(`/persons/${personInC}`, viewer.cookie).expect(200)).body);
      expect(forViewer).toMatchObject({ nid: null, hasNid: true, can: { edit: false, verify: false } });
      const forManager = personDetailSchema.parse((await get(`/persons/${personInC}`, manager.cookie).expect(200)).body);
      expect(forManager.nid).toBe(nid);
      await send('put', `/persons/${personInC}/verified`, viewer.cookie).send({ verified: true }).expect(403);
    });

    it("another society's people and rows answer 404", async () => {
      const foreign = await prisma.persons.create({ data: { society_id: otherSocietyId, full_name: `বিদেশি ${MARK}` } });
      await get(`/persons/${foreign.id}`, admin.cookie).expect(404);
      await send('patch', `/persons/${foreign.id}`, admin.cookie).send({ fullName: 'x' }).expect(404);

      const level = await prisma.location_levels.create({ data: { society_id: otherSocietyId, depth: 1, name_bn: 'স্তর', is_unit_level: true } });
      const id = randomUUID();
      await prisma.locations.create({ data: { id, society_id: otherSocietyId, level_id: level.id, name: 'x', path: `/${id}/` } });
      await prisma.units.create({ data: { location_id: id, society_id: otherSocietyId, unit_type: 'residential' } });
      await send('post', '/tenancies', admin.cookie).send({ unitId: id, renter: person('x'), renterType: 'family', startDate: '2026-01-01' }).expect(404);
      await get(`/locations/${id}/people`, admin.cookie).expect(404);
      await prisma.units.delete({ where: { location_id: id } });
      await prisma.locations.delete({ where: { id } });
      await prisma.location_levels.delete({ where: { id: level.id } });
    });

    it('routes need their permission', async () => {
      const nobody = await makeUser([{ roleId: await makeRole(['notices:view']) }]);
      await get('/registers/owners', nobody.cookie).expect(403);
      await get(`/locations/${tree.plot14.id}/people`, nobody.cookie).expect(404);
      await send('post', '/ownerships', viewer.cookie)
        .send({ locationId: tree.plot14.id, owner: person('x'), sharePercent: '100', startDate: '2026-01-01' })
        .expect(403);
    });
  });
});
