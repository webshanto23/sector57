import { INestApplication } from '@nestjs/common';
import {
  AUTH_COOKIES,
  billingLookupSchema,
  CSRF_HEADER,
  locationViewSchema,
  memberBulkResultSchema,
  memberCreatedSchema,
  memberRegisterSchema,
  personDetailSchema,
  renterRegisterSchema,
  unitDetailSchema,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-memberships-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `016${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

describe('Memberships: the office adds members with a global membership ID (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let societyCode: string;
  let otherSocietyId: string;
  let admin: { id: string; cookie: string };
  // sector > block > road > plot, with one flat on the plot.
  const tree = {} as Record<'sector' | 'block' | 'road' | 'plot', { id: string; path: string }>;
  let flat: string;
  const server = () => app.getHttpServer();

  async function makeUser(roleId: string, scope: string | null = null) {
    const phone = randomPhone();
    const person = await prisma.persons.create({ data: { society_id: societyId, full_name: `ব্যবহারকারী ${MARK}`, phone } });
    const user = await prisma.users.create({ data: { society_id: societyId, person_id: person.id, phone, status: 'active' } });
    await prisma.user_roles.create({ data: { user_id: user.id, role_id: roleId, scope_location_id: scope } });
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId, sessionId: randomUUID() });
    return { id: user.id, cookie: `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}` };
  }

  const post = (url: string, cookie: string) => request(server()).post(url).set('Cookie', cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const member = (name: string, phone = randomPhone(), extra: Record<string, unknown> = {}) => ({
    person: { fullName: `${name} ${MARK}`, phone },
    ...extra,
  });
  const addPerson = (name: string) =>
    prisma.persons.create({ data: { society_id: societyId, full_name: `${name} ${MARK}`, phone: randomPhone() }, select: { id: true } }).then((p) => p.id);
  const membershipOf = (personId: string) => prisma.memberships.findFirstOrThrow({ where: { person_id: personId, status: 'active' } });

  async function addLocation(parent: keyof typeof tree | null, depth: number, name: string) {
    const levelId = (await prisma.location_levels.findFirstOrThrow({ where: { society_id: societyId, depth } })).id;
    const res = await post('/locations', admin.cookie)
      .send({ parentId: parent ? tree[parent].id : null, levelId, name, code: null })
      .expect(201);
    const row = await prisma.locations.findUniqueOrThrow({ where: { id: locationViewSchema.parse(res.body).location!.id } });
    return { id: row.id, path: row.path };
  }

  const codeOf = (no: number) => `${societyCode}-${String(no).padStart(6, '0')}`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const society = await prisma.societies.findUniqueOrThrow({ where: { slug: 'sector57' } });
    societyId = society.id;
    societyCode = society.code;
    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: MARK } })).id;
    const systemRoleId = (await prisma.roles.findFirstOrThrow({ where: { society_id: societyId, is_system: true } })).id;
    admin = await makeUser(systemRoleId);

    tree.sector = await addLocation(null, 1, `${MARK} সেক্টর`);
    tree.block = await addLocation('sector', 2, 'ব্লক');
    tree.road = await addLocation('block', 3, 'রোড');
    tree.plot = await addLocation('road', 4, 'প্লট');
    const res = await post('/units', admin.cookie)
      .send({ parentId: tree.plot.id, name: 'ফ্ল্যাট', code: null, unitType: 'residential', sizeSqft: null, billTo: 'owner' })
      .expect(201);
    flat = unitDetailSchema.parse(res.body).id;
  });

  afterAll(async () => {
    if (prisma) {
      const persons = await prisma.persons.findMany({
        where: { OR: [{ full_name: { contains: MARK } }, { society_id: otherSocietyId }] },
        select: { id: true },
      });
      const personIds = persons.map((p) => p.id);
      const users = await prisma.users.findMany({ where: { person_id: { in: personIds } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      const paths = tree.sector ? { path: { startsWith: tree.sector.path } } : { id: { in: [] } };
      const locations = await prisma.locations.findMany({ where: paths, select: { id: true, path: true } });
      const locationIds = locations.map((row) => row.id);
      const organisations = (await prisma.organisations.findMany({ where: { name: { contains: MARK } }, select: { id: true } })).map((o) => o.id);
      await prisma.invoices.deleteMany({ where: { bill_to_person_id: { in: personIds } } });
      await prisma.memberships.deleteMany({ where: { OR: [{ person_id: { in: personIds } }, { organisation_id: { in: organisations } }] } });
      await prisma.tenancies.deleteMany({ where: { unit_id: { in: locationIds } } });
      await prisma.ownerships.deleteMany({ where: { location_id: { in: locationIds } } });
      await prisma.audit_logs.deleteMany({ where: { OR: [{ user_id: { in: userIds } }, { society_id: otherSocietyId }] } });
      await prisma.user_roles.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
      await prisma.users.deleteMany({ where: { id: { in: userIds } } });
      await prisma.organisations.deleteMany({ where: { id: { in: organisations } } });
      await prisma.persons.deleteMany({ where: { id: { in: personIds } } });
      await prisma.units.deleteMany({ where: { location_id: { in: locationIds } } });
      locations.sort((x, y) => y.path.length - x.path.length);
      for (const row of locations) await prisma.locations.delete({ where: { id: row.id } });
      await prisma.societies.deleteMany({ where: { id: otherSocietyId } });
    }
    await app?.close();
  });

  it('adds a person and a membership whose ID is the society code and the padded member number', async () => {
    const res = await post('/memberships', admin.cookie).send(member('রহিম', randomPhone(), { joinedOn: '2026-01-15' })).expect(201);
    const created = memberCreatedSchema.parse(res.body);
    expect(created.reusedPerson).toBe(false);
    expect(created.membershipCode).toBe(codeOf(created.memberNo));

    const person = personDetailSchema.parse((await request(server()).get(`/persons/${created.personId}`).set('Cookie', admin.cookie).expect(200)).body);
    expect(person.membership).toMatchObject({ memberNo: created.memberNo, membershipCode: created.membershipCode, status: 'active', joinedOn: '2026-01-15' });
  });

  it('reuses a person on file by phone, and refuses a second active membership', async () => {
    const phone = randomPhone();
    const existing = await prisma.persons.create({ data: { society_id: societyId, full_name: `করিম ${MARK}`, phone } });
    const first = memberCreatedSchema.parse((await post('/memberships', admin.cookie).send(member('করিম', phone)).expect(201)).body);
    expect(first).toMatchObject({ personId: existing.id, reusedPerson: true });

    const again = await post('/memberships', admin.cookie).send(member('করিম', phone)).expect(409);
    expect(again.body.code).toBe('already_member');
  });

  it('numbers members added at the same moment one after another, without clashes', async () => {
    const results = await Promise.all([1, 2, 3, 4].map((i) => post('/memberships', admin.cookie).send(member(`একসাথে ${i}`))));
    const codes = results.map((res) => memberCreatedSchema.parse(res.body).membershipCode);
    expect(new Set(codes).size).toBe(4);
  });

  it('gives the same member number in another society a different membership ID', async () => {
    const other = await prisma.societies.findUniqueOrThrow({ where: { id: otherSocietyId } });
    expect(other.code).not.toBe(societyCode);
    const person = await prisma.persons.create({ data: { society_id: otherSocietyId, full_name: `অন্য ${MARK}` } });
    const row = await prisma.memberships.create({ data: { society_id: otherSocietyId, person_id: person.id, member_no: 1, joined_on: new Date('2026-01-01') } });
    expect(row.membership_code).toBe(`${other.code}-000001`);
  });

  it('makes an owner on file a member, at the place they own when none is given', async () => {
    const owner = await addPerson('মালিক');
    await prisma.ownerships.create({ data: { society_id: societyId, location_id: tree.plot.id, person_id: owner, start_date: new Date('2020-01-01') } });
    const created = memberCreatedSchema.parse((await post('/memberships', admin.cookie).send({ personId: owner }).expect(201)).body);
    expect(created).toMatchObject({ personId: owner, reusedPerson: true, membershipCode: codeOf(created.memberNo) });
    expect((await membershipOf(owner)).location_id).toBe(tree.plot.id);

    await post('/memberships', admin.cookie).send({ personId: randomUUID() }).expect(404);
    await post('/memberships', admin.cookie).send({ personId: owner, person: { fullName: 'দুটোই' } }).expect(400);
  });

  it('makes ticked people members in order, skipping members, and shows renters as members', async () => {
    const [renter, plain, member] = [await addPerson('ভাড়াটিয়া'), await addPerson('সাধারণ'), await addPerson('আগের সদস্য')];
    await prisma.tenancies.create({
      data: { society_id: societyId, unit_id: flat, renter_type: 'family', primary_person_id: renter, start_date: new Date('2025-01-01'), status: 'active' },
    });
    await post('/memberships', admin.cookie).send({ personId: member }).expect(201);

    const res = await post('/memberships/bulk', admin.cookie).send({ personIds: [renter, member, plain], joinedOn: '2026-03-01' }).expect(201);
    const result = memberBulkResultSchema.parse(res.body);
    expect(result.skipped).toBe(1);
    expect(result.created.map((row) => row.personId)).toEqual([renter, plain]);
    expect(result.created[1]!.memberNo).toBe(result.created[0]!.memberNo + 1);
    expect(result.created[0]!.membershipCode).toBe(codeOf(result.created[0]!.memberNo));
    const renterMembership = await membershipOf(renter);
    expect(renterMembership.location_id).toBe(flat);
    expect(renterMembership.joined_on.toISOString().slice(0, 10)).toBe('2026-03-01');
    expect((await membershipOf(plain)).location_id).toBeNull();

    const register = renterRegisterSchema.parse(
      (await request(server()).get(`/registers/renters?areaId=${tree.sector.id}`).set('Cookie', admin.cookie).expect(200)).body,
    );
    expect(register.items.find((row) => row.renter?.id === renter)?.memberNo).toBe(result.created[0]!.memberNo);
  });

  it('makes an organisation a member: typed, on file or ticked, once, in the same numbering', async () => {
    const typed = memberCreatedSchema.parse(
      (await post('/memberships', admin.cookie).send({ organisation: { name: `নূর ট্রেডার্স ${MARK}`, tradeLicence: `TL-1-${MARK}` } }).expect(201)).body,
    );
    expect(typed).toMatchObject({ personId: null, reusedPerson: false, membershipCode: codeOf(typed.memberNo) });
    expect((await post('/memberships', admin.cookie).send({ organisationId: typed.organisationId }).expect(409)).body.code).toBe('already_member');
    // The same licence again finds the same organisation, already a member.
    expect((await post('/memberships', admin.cookie).send({ organisation: { name: 'অন্য নাম', tradeLicence: `TL-1-${MARK}` } }).expect(409)).body.code).toBe(
      'already_member',
    );

    const owner = (await prisma.organisations.create({ data: { society_id: societyId, name: `রহিম স্টোর ${MARK}`, trade_licence: `TL-2-${MARK}` } })).id;
    await prisma.ownerships.create({ data: { society_id: societyId, location_id: tree.plot.id, organisation_id: owner, share_percent: 100, start_date: new Date('2025-01-01') } });
    const person = await addPerson('সঙ্গে');
    const res = await post('/memberships/bulk', admin.cookie).send({ personIds: [person], organisationIds: [owner] }).expect(201);
    const result = memberBulkResultSchema.parse(res.body);
    expect(result.created.map((row) => [row.personId, row.organisationId])).toEqual([
      [person, null],
      [null, owner],
    ]);
    expect(result.created[1]!.memberNo).toBe(result.created[0]!.memberNo + 1);
    // Its place is the plot it owns.
    expect((await prisma.memberships.findFirstOrThrow({ where: { organisation_id: owner } })).location_id).toBe(tree.plot.id);

    const outsider = (await prisma.organisations.create({ data: { society_id: otherSocietyId, name: `বাইরের ${MARK}` } })).id;
    expect((await post('/memberships/bulk', admin.cookie).send({ organisationIds: [outsider] }).expect(404)).body.code).toBe('organisation_not_found');
    await post('/memberships/bulk', admin.cookie).send({}).expect(400);
  });

  it('adds nobody when a ticked id is not a person of the society', async () => {
    const fresh = await addPerson('নতুন');
    const outsider = (await prisma.persons.create({ data: { society_id: otherSocietyId, full_name: `বাইরের ${MARK}` } })).id;
    const res = await post('/memberships/bulk', admin.cookie).send({ personIds: [fresh, outsider] }).expect(404);
    expect(res.body.code).toBe('person_not_found');
    expect(await prisma.memberships.count({ where: { person_id: fresh } })).toBe(0);
  });

  it('shows the membership fee as not billed, not paid or paid, and filters by it', async () => {
    const joined = memberCreatedSchema.parse((await post('/memberships', admin.cookie).send(member('ফি'))).body);
    const get = (url: string) => request(server()).get(url).set('Cookie', admin.cookie).expect(200);
    const feeRow = async (fee = '') => {
      const res = await get(`/registers/members?q=${encodeURIComponent(`ফি ${MARK}`)}${fee ? `&fee=${fee}` : ''}`);
      const list = memberRegisterSchema.parse(res.body);
      return { row: list.items.find((row) => row.person.id === joined.personId), notPaid: list.counts.feeNotPaid };
    };
    expect((await feeRow()).row?.fee).toEqual({ state: 'not_billed', owed: null, openBillId: null });
    expect((await feeRow('not_paid')).row).toBeDefined();
    expect((await feeRow('paid')).row).toBeUndefined();

    // "Make bill" opens the bill form with the member already chosen.
    const lookup = billingLookupSchema.parse((await get(`/billing/lookup?personId=${joined.personId}`)).body);
    expect(lookup).toMatchObject({ units: [], members: [{ id: joined.personId, memberNo: joined.memberNo }] });

    const chargeType = await prisma.charge_types.findFirstOrThrow({ where: { society_id: societyId, archived_at: null } });
    const bill = async () =>
      (
        await post('/invoices', admin.cookie)
          .send({ personId: joined.personId, dueDate: '2026-12-31', lines: [{ chargeTypeId: chargeType.id, amount: '500' }] })
          .expect(201)
      ).body.id as string;
    const first = await bill();
    expect((await feeRow()).row?.fee).toEqual({ state: 'unpaid', owed: '500', openBillId: first });

    await prisma.invoices.update({ where: { id: first }, data: { status: 'paid', paid: 500 } });
    const voided = await bill();
    await post(`/invoices/${voided}/void`, admin.cookie).send({ reason: 'ভুল বিল' }).expect(200);
    const paid = await feeRow('paid');
    expect(paid.row?.fee).toEqual({ state: 'paid', owed: null, openBillId: null });
    expect((await feeRow('not_paid')).row).toBeUndefined();
    expect(paid.notPaid).toBeGreaterThanOrEqual(0);
  });

  it('refuses an unknown place and a caller limited to part of the society', async () => {
    const missing = await post('/memberships', admin.cookie).send(member('কোথাও নেই', randomPhone(), { locationId: randomUUID() })).expect(404);
    expect(missing.body.code).toBe('location_not_found');

    const permission = await prisma.permissions.findFirstOrThrow({ where: { module: 'members', action: 'create' } });
    const role = await prisma.roles.create({ data: { society_id: societyId, name: `${MARK}-scoped` } });
    await prisma.role_permissions.create({ data: { role_id: role.id, permission_id: permission.id } });
    const scoped = await makeUser(role.id, tree.block.id);
    await post('/memberships', scoped.cookie).send(member('সীমিত')).expect(403);
    await post('/memberships/bulk', scoped.cookie).send({ personIds: [await addPerson('সীমিত ২')] }).expect(403);
  });
});
