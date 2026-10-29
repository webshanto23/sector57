import { INestApplication } from '@nestjs/common';
import { AUTH_COOKIES, CSRF_HEADER, societySchema } from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-ids-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `018${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const randomNid = () => String(Math.floor(1e9 + Math.random() * 9e9));

/**
 * The `requireIdNumbers` setting, in a society of its own (switching it on would affect other
 * files sharing the test society). Owners, renters and members need an NID (a person) or a
 * trade licence (an organisation) on file; residents don't.
 */
describe('Required ID numbers (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let cookie: string;
  const ids = {} as Record<'block' | 'flatA' | 'flatB' | 'flatC', string>;
  const server = () => app.getHttpServer();
  const send = (method: 'post' | 'patch', url: string) => request(server())[method](url).set('Cookie', cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const person = (extra: Record<string, unknown> = {}) => ({ fullName: `মানুষ ${MARK}`, phone: randomPhone(), ...extra });
  const own = (locationId: string, owner: unknown) => send('post', '/ownerships').send({ locationId, owner, sharePercent: '100', startDate: '2026-01-01' });

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { PrismaPg, PrismaClient } = await import('@s57/db');
    const setup = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    societyId = (await setup.societies.create({ data: { name_bn: `সমিতি ${MARK}`, slug: MARK } })).id;
    await setup.$disconnect();

    app = await createTestApp([], { DEFAULT_SOCIETY_SLUG: MARK });
    prisma = app.get(PrismaService);

    const blockLevel = await prisma.location_levels.create({ data: { society_id: societyId, depth: 1, name_bn: 'ব্লক' } });
    const unitLevel = await prisma.location_levels.create({ data: { society_id: societyId, depth: 2, name_bn: 'ইউনিট', is_unit_level: true } });
    ids.block = randomUUID();
    await prisma.locations.create({ data: { id: ids.block, society_id: societyId, level_id: blockLevel.id, name: 'ব্লক এ', path: `/${ids.block}/` } });
    for (const key of ['flatA', 'flatB', 'flatC'] as const) {
      ids[key] = randomUUID();
      await prisma.locations.create({
        data: { id: ids[key], society_id: societyId, level_id: unitLevel.id, parent_id: ids.block, name: key, path: `/${ids.block}/${ids[key]}/` },
      });
      await prisma.units.create({ data: { location_id: ids[key], society_id: societyId, unit_type: 'residential' } });
    }

    const permissions = await prisma.permissions.findMany();
    const user = await prisma.users.create({ data: { society_id: societyId, phone: randomPhone(), status: 'active' } });
    const role = await prisma.roles.create({ data: { society_id: societyId, name: `${MARK}-admin` } });
    await prisma.role_permissions.createMany({ data: permissions.map((p) => ({ role_id: role.id, permission_id: p.id })) });
    await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.id } });
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId, sessionId: randomUUID() });
    cookie = `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}`;
  });

  afterAll(async () => {
    if (prisma) {
      const where = { society_id: societyId };
      await prisma.audit_logs.deleteMany({ where });
      await prisma.form_submissions.deleteMany({ where });
      await prisma.memberships.deleteMany({ where });
      await prisma.occupants.deleteMany({ where });
      await prisma.tenancies.deleteMany({ where });
      await prisma.ownerships.deleteMany({ where });
      await prisma.organisations.deleteMany({ where });
      await prisma.user_roles.deleteMany({ where: { users_user_roles_user_idTousers: where } });
      await prisma.users.deleteMany({ where });
      await prisma.persons.deleteMany({ where });
      await prisma.roles.deleteMany({ where });
      await prisma.society_settings.deleteMany({ where });
      await prisma.units.deleteMany({ where });
      await prisma.locations.deleteMany({ where: { ...where, parent_id: { not: null } } });
      await prisma.locations.deleteMany({ where });
      await prisma.location_levels.deleteMany({ where });
      await prisma.societies.deleteMany({ where: { id: societyId } });
    }
    await app?.close();
  });

  it('is off until the office switches it on; the public society says which', async () => {
    const noNid = await own(ids.flatA, { kind: 'person', person: person() }).expect(201);
    expect(noNid.body.owner.id).toBeTruthy();
    expect(societySchema.parse((await request(server()).get('/society').expect(200)).body).requireIdNumbers).toBe(false);

    const settings = await send('patch', '/settings').send({ requireIdNumbers: true }).expect(200);
    expect(settings.body.requireIdNumbers).toBe(true);
    expect(societySchema.parse((await request(server()).get('/society').expect(200)).body).requireIdNumbers).toBe(true);
  });

  it('refuses an owner or renter without an NID or trade licence, typed or picked', async () => {
    expect((await own(ids.flatB, { kind: 'person', person: person() }).expect(400)).body.code).toBe('nid_required');
    const org = { kind: 'organisation', organisation: { name: `দোকান ${MARK}`, tradeLicence: null } };
    expect((await own(ids.flatB, org).expect(400)).body.code).toBe('trade_licence_required');

    // The owner of flat A has no NID on file: picking them by id is refused too.
    const flatAOwner = (await prisma.ownerships.findFirstOrThrow({ where: { location_id: ids.flatA } })).person_id!;
    const picked = { kind: 'existing', party: { kind: 'person', id: flatAOwner } };
    expect((await own(ids.flatB, picked).expect(400)).body.code).toBe('nid_required');
    const tenancy = { unitId: ids.flatB, renter: picked, renterType: 'family', status: 'active', startDate: '2026-02-01', monthlyRent: '10000' };
    expect((await send('post', '/tenancies').send(tenancy).expect(400)).body.code).toBe('nid_required');

    await own(ids.flatB, { ...org, organisation: { ...org.organisation, tradeLicence: `TL-${MARK}` } }).expect(201);
    await send('post', '/tenancies').send({ ...tenancy, unitId: ids.flatC, renter: { kind: 'person', person: person({ nid: randomNid() }) } }).expect(201);
  });

  it('fills a missing NID when one is typed for someone found by phone, and then accepts them', async () => {
    const flatAOwner = await prisma.ownerships.findFirstOrThrow({ where: { location_id: ids.flatA }, include: { persons: true } });
    const nid = randomNid();
    await own(ids.flatC, { kind: 'person', person: { fullName: 'অন্য নাম', phone: flatAOwner.persons!.phone, nid } }).expect(201);
    expect((await prisma.persons.findUniqueOrThrow({ where: { id: flatAOwner.person_id! } })).nid).toBe(nid);
  });

  it('refuses a member without an NID, and clearing the NID of an owner', async () => {
    // Residents don't need one.
    const child = { fullName: `বাসিন্দা ${MARK}`, phone: randomPhone() };
    await send('post', '/occupants').send({ unitId: ids.flatA, tenancyId: null, person: child, relation: 'child', startDate: '2026-02-01' }).expect(201);
    const resident = await prisma.persons.findFirstOrThrow({ where: { society_id: societyId, phone: child.phone } });
    expect((await send('post', '/memberships').send({ personId: resident.id }).expect(400)).body.code).toBe('nid_required');

    const owner = await prisma.ownerships.findFirstOrThrow({ where: { location_id: ids.flatC }, include: { persons: true } });
    const cleared = await send('patch', `/persons/${owner.person_id}`)
      .send({ fullName: owner.persons!.full_name, phone: owner.persons!.phone, nid: null })
      .expect(400);
    expect(cleared.body.code).toBe('nid_required');
  });

  it('asks the public renter form for the NID while the rule is on', async () => {
    const form = {
      renter: { fullName: `ভাড়াটিয়া ${MARK}`, phone: randomPhone(), nid: null },
      renterType: 'family',
      unitId: ids.flatA,
      moveInDate: '2026-11-01',
      owner: { name: `মালিক ${MARK}`, phone: null },
      household: [],
    };
    const post = (data: unknown) =>
      request(server()).post('/public/forms/renter_registration').set('Origin', ORIGIN).set('X-Forwarded-For', '10.99.0.1').field('data', JSON.stringify(data));
    const refused = await post(form).expect(400);
    expect(JSON.stringify(refused.body)).toContain('renter');
    await post({ ...form, renter: { ...form.renter, nid: randomNid() } }).expect(201);
  });
});
