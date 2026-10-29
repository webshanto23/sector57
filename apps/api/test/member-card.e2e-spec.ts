import { INestApplication } from '@nestjs/common';
import {
  AUTH_COOKIES,
  CSRF_HEADER,
  cardValidTill,
  locationViewSchema,
  memberCardSchema,
  memberCardSettingsSchema,
  memberCreatedSchema,
  MEMBER_CARD_KEY,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { isoDate, todayDate } from './../src/common/dates.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-member-card-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `016${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

describe('Membership ID cards (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let admin: { id: string; cookie: string };
  let savedSettings: { value: unknown } | null;
  // sector > blocks A and B.
  const tree = {} as Record<'sector' | 'blockA' | 'blockB', { id: string; path: string }>;
  const server = () => app.getHttpServer();

  async function permissionIds(names: string[]) {
    const rows = await prisma.permissions.findMany();
    return names.map((name) => rows.find((p) => `${p.module}:${p.action}` === name)!.id);
  }

  async function makeUser(roleId: string, scope: string | null = null) {
    const phone = randomPhone();
    const person = await prisma.persons.create({ data: { society_id: societyId, full_name: `ব্যবহারকারী ${MARK}`, phone } });
    const user = await prisma.users.create({ data: { society_id: societyId, person_id: person.id, phone, status: 'active' } });
    await prisma.user_roles.create({ data: { user_id: user.id, role_id: roleId, scope_location_id: scope } });
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId, sessionId: randomUUID() });
    return { id: user.id, cookie: `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}` };
  }

  async function makeRole(permissions: string[]) {
    const role = await prisma.roles.create({ data: { society_id: societyId, name: `${MARK}-${randomUUID()}` } });
    await prisma.role_permissions.createMany({ data: (await permissionIds(permissions)).map((permission_id) => ({ role_id: role.id, permission_id })) });
    return role.id;
  }

  const get = (url: string, cookie: string) => request(server()).get(url).set('Cookie', cookie);
  const post = (url: string, cookie: string) => request(server()).post(url).set('Cookie', cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const put = (url: string, cookie: string) => request(server()).put(url).set('Cookie', cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);

  async function addLocation(parent: keyof typeof tree | null, depth: number, name: string) {
    const levelId = (await prisma.location_levels.findFirstOrThrow({ where: { society_id: societyId, depth } })).id;
    const res = await post('/locations', admin.cookie).send({ parentId: parent ? tree[parent].id : null, levelId, name, code: null }).expect(201);
    const row = await prisma.locations.findUniqueOrThrow({ where: { id: locationViewSchema.parse(res.body).location!.id } });
    return { id: row.id, path: row.path };
  }

  /** A person member at a place; verified (ID issued) unless told otherwise. */
  async function personMember(place: keyof typeof tree, verified = true) {
    const res = await post('/memberships', admin.cookie)
      .send({ person: { fullName: `সদস্য ${MARK}`, fullNameEn: `Member ${MARK}`, phone: randomPhone(), email: `m${Date.now()}@example.com` }, locationId: tree[place].id })
      .expect(201);
    const created = memberCreatedSchema.parse(res.body);
    if (verified) await put(`/persons/${created.personId}/verified`, admin.cookie).send({ verified: true }).expect(200);
    return { personId: created.personId!, membershipId: (await prisma.memberships.findFirstOrThrow({ where: { person_id: created.personId! } })).id };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    societyId = (await prisma.societies.findUniqueOrThrow({ where: { slug: 'sector57' } })).id;
    savedSettings = await prisma.society_settings.findUnique({
      where: { society_id_key: { society_id: societyId, key: MEMBER_CARD_KEY } },
      select: { value: true },
    });
    const systemRoleId = (await prisma.roles.findFirstOrThrow({ where: { society_id: societyId, is_system: true } })).id;
    admin = await makeUser(systemRoleId);
    tree.sector = await addLocation(null, 1, `${MARK} সেক্টর`);
    tree.blockA = await addLocation('sector', 2, 'ব্লক এ');
    tree.blockB = await addLocation('sector', 2, 'ব্লক বি');
  });

  afterAll(async () => {
    if (prisma) {
      const where = { society_id_key: { society_id: societyId, key: MEMBER_CARD_KEY } };
      if (savedSettings) await prisma.society_settings.update({ where, data: { value: savedSettings.value as object } });
      else await prisma.society_settings.deleteMany({ where: { society_id: societyId, key: MEMBER_CARD_KEY } });
      const persons = (await prisma.persons.findMany({ where: { full_name: { contains: MARK } }, select: { id: true } })).map((p) => p.id);
      const organisations = (await prisma.organisations.findMany({ where: { name: { contains: MARK } }, select: { id: true } })).map((o) => o.id);
      const userIds = (await prisma.users.findMany({ where: { person_id: { in: persons } }, select: { id: true } })).map((u) => u.id);
      await prisma.memberships.deleteMany({ where: { OR: [{ person_id: { in: persons } }, { organisation_id: { in: organisations } }] } });
      await prisma.audit_logs.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.user_roles.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
      await prisma.users.deleteMany({ where: { id: { in: userIds } } });
      await prisma.organisations.deleteMany({ where: { id: { in: organisations } } });
      await prisma.persons.deleteMany({ where: { id: { in: persons } } });
      const locations = await prisma.locations.findMany({ where: { path: { startsWith: tree.sector?.path ?? '//' } }, select: { id: true, path: true } });
      locations.sort((x, y) => y.path.length - x.path.length);
      for (const row of locations) await prisma.locations.delete({ where: { id: row.id } });
    }
    await app?.close();
  });

  it('keeps the card settings, blank lines dropped, and refuses callers without settings rights', async () => {
    const res = await put('/settings/member-card', admin.cookie)
      .send({ termsBn: ['কার্ডটি হস্তান্তরযোগ্য নয়।', ''], termsEn: ['Not transferable.'], validYears: '২', signatureBn: 'সাধারণ সম্পাদক', signatureEn: '' })
      .expect(200);
    expect(memberCardSettingsSchema.parse(res.body)).toEqual({
      termsBn: ['কার্ডটি হস্তান্তরযোগ্য নয়।'],
      termsEn: ['Not transferable.'],
      validYears: 2,
      signatureBn: 'সাধারণ সম্পাদক',
      signatureEn: null,
    });
    expect(memberCardSettingsSchema.parse((await get('/settings/member-card', admin.cookie).expect(200)).body).validYears).toBe(2);
    const noSettings = await makeUser(await makeRole(['members:view', 'members:edit']));
    await put('/settings/member-card', noSettings.cookie).send({ termsBn: [], termsEn: [], validYears: null, signatureBn: null, signatureEn: null }).expect(403);
  });

  it('gives an active person member their card with the society header, and audits it', async () => {
    const { membershipId } = await personMember('blockA');
    const card = memberCardSchema.parse((await get(`/memberships/${membershipId}/card`, admin.cookie).expect(200)).body);
    expect(card).toMatchObject({ kind: 'person', name: `সদস্য ${MARK}`, nameEn: `Member ${MARK}`, status: 'active', photoUrl: null });
    expect(card.membershipCode).toMatch(/-\d{6}$/);
    expect(card.validTill).toBe(cardValidTill(isoDate(todayDate()), 2));
    expect(card.header.nameBn).toBeTruthy();
    expect(card.settings.termsEn).toEqual(['Not transferable.']);
    expect(await prisma.audit_logs.count({ where: { entity_type: 'membership', entity_id: membershipId, action: 'card' } })).toBe(1);
  });

  it('an organisation member: its name, its contact phone, no photo', async () => {
    const phone = randomPhone();
    const res = await post('/memberships', admin.cookie)
      .send({ organisation: { name: `সংস্থা ${MARK}`, tradeLicence: `TL-${Date.now()}`, contact: { fullName: `যোগাযোগ ${MARK}`, phone } }, locationId: tree.blockA.id })
      .expect(201);
    const organisationId = memberCreatedSchema.parse(res.body).organisationId!;
    await put(`/organisations/${organisationId}/verified`, admin.cookie).send({ verified: true }).expect(200);
    const membershipId = (await prisma.memberships.findFirstOrThrow({ where: { organisation_id: organisationId } })).id;
    const card = memberCardSchema.parse((await get(`/memberships/${membershipId}/card`, admin.cookie).expect(200)).body);
    expect(card).toMatchObject({ kind: 'organisation', name: `সংস্থা ${MARK}`, phone, photoUrl: null });
  });

  it('no card while the ID is pending or the membership is not active', async () => {
    const pending = await personMember('blockA', false);
    expect((await get(`/memberships/${pending.membershipId}/card`, admin.cookie).expect(409)).body.code).toBe('membership_id_pending');
    const lapsed = await personMember('blockA');
    await prisma.memberships.update({ where: { id: lapsed.membershipId }, data: { status: 'lapsed' } });
    expect((await get(`/memberships/${lapsed.membershipId}/card`, admin.cookie).expect(409)).body.code).toBe('membership_not_active');
  });

  it('needs members.edit in the member area: 404 outside it, 403 with view only', async () => {
    const { membershipId } = await personMember('blockA');
    const editorA = await makeUser(await makeRole(['members:view', 'members:edit']), tree.blockA.id);
    await get(`/memberships/${membershipId}/card`, editorA.cookie).expect(200);
    const editorB = await makeUser(await makeRole(['members:view', 'members:edit']), tree.blockB.id);
    await get(`/memberships/${membershipId}/card`, editorB.cookie).expect(404);
    const viewerA = await makeUser(await makeRole(['members:view']), tree.blockA.id);
    await get(`/memberships/${membershipId}/card`, viewerA.cookie).expect(403);
    await get(`/memberships/${randomUUID()}/card`, admin.cookie).expect(404);
  });
});
