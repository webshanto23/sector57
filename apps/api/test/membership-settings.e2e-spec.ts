import { INestApplication } from '@nestjs/common';
import { AUTH_COOKIES, CSRF_HEADER, membershipSettingsSchema } from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { MembershipSettingsService } from './../src/members/membership-settings.service.js';
import { MembershipsService } from './../src/members/memberships.service.js';
import type { Actor } from './../src/permissions/permissions.decorators.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-member-settings-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `016${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
// Codes no other society holds: letters from the run's timestamp.
const stamp = Date.now().toString(36).toUpperCase();
const CODE = `T${stamp}`.slice(0, 10);
const CODE2 = `U${stamp}`.slice(0, 10);
const OWN_CODE = `V${stamp}`.slice(0, 10);

/**
 * Requests always act on the seeded society, which other suites number members in at the same
 * time, so over HTTP only the refusals run. Changes run through the services on a society of the
 * suite's own.
 */
describe('Membership settings: society code and first member number (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let seededId: string;
  let ownId: string;
  let office: { userId: string; cookie: string };
  let viewer: { cookie: string };
  const server = () => app.getHttpServer();

  async function makeUser(permissions: string[]) {
    const rows = await prisma.permissions.findMany();
    const role = await prisma.roles.create({ data: { society_id: seededId, name: `${MARK}-${randomUUID()}` } });
    await prisma.role_permissions.createMany({
      data: permissions.map((name) => ({ role_id: role.id, permission_id: rows.find((p) => `${p.module}:${p.action}` === name)!.id })),
    });
    const phone = randomPhone();
    const person = await prisma.persons.create({ data: { society_id: seededId, full_name: `ব্যবহারকারী ${MARK}`, phone } });
    const user = await prisma.users.create({ data: { society_id: seededId, person_id: person.id, phone, status: 'active' } });
    await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.id } });
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId: seededId, sessionId: randomUUID() });
    return { userId: user.id, cookie: `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}` };
  }

  const put = (cookie: string) => request(server()).put('/settings/membership').set('Cookie', cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const settings = () => app.get(MembershipSettingsService);
  // Only the settings service reads the actor, and only its society, user and ip.
  const ownActor = (): Actor => ({ societyId: ownId, userId: office.userId, ip: null, access: undefined as never });
  async function addMember(name: string) {
    // Verified, so the membership gets its number at once.
    const person = await prisma.persons.create({ data: { society_id: ownId, full_name: `${name} ${MARK}`, verified_at: new Date() } });
    return prisma.$transaction((tx) =>
      app.get(MembershipsService).insert(tx, ownId, { personId: person.id, organisationId: null, locationId: null, joinedOn: new Date('2026-01-01'), submissionId: null }),
    );
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    seededId = (await prisma.societies.findUniqueOrThrow({ where: { slug: 'sector57' } })).id;
    ownId = (await prisma.societies.create({ data: { name_bn: `সমিতি ${MARK}`, slug: MARK, code: OWN_CODE } })).id;
    office = await makeUser(['settings:view', 'settings:edit']);
    viewer = await makeUser(['settings:view']);
  });

  afterAll(async () => {
    if (prisma) {
      const persons = await prisma.persons.findMany({ where: { OR: [{ full_name: { contains: MARK } }, { society_id: ownId }] }, select: { id: true } });
      const personIds = persons.map((p) => p.id);
      const users = await prisma.users.findMany({ where: { person_id: { in: personIds } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      await prisma.memberships.deleteMany({ where: { person_id: { in: personIds } } });
      await prisma.audit_logs.deleteMany({ where: { OR: [{ user_id: { in: userIds } }, { society_id: ownId }] } });
      await prisma.user_roles.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
      await prisma.users.deleteMany({ where: { id: { in: userIds } } });
      await prisma.persons.deleteMany({ where: { id: { in: personIds } } });
      if (ownId) {
        await prisma.society_settings.deleteMany({ where: { society_id: ownId } });
        await prisma.societies.deleteMany({ where: { id: ownId } });
      }
    }
    await app?.close();
  });

  it('shows the seeded society its code and next ID', async () => {
    const res = await request(server()).get('/settings/membership').set('Cookie', viewer.cookie).expect(200);
    const seen = membershipSettingsSchema.parse(res.body);
    expect(seen.nextMembershipCode).toBe(`${seen.societyCode}-${String(seen.nextMemberNo).padStart(6, '0')}`);
  });

  it('refuses a code another society holds, a bad code, and a caller without settings.edit', async () => {
    const before = await settings().get(seededId);
    const own = await prisma.societies.findUniqueOrThrow({ where: { id: ownId }, select: { code: true } });
    const taken = await put(office.cookie).send({ societyCode: own.code, firstMemberNo: before.firstMemberNo }).expect(409);
    expect(taken.body.code).toBe('society_code_taken');
    expect((await settings().get(seededId)).societyCode).toBe(before.societyCode);

    await put(office.cookie).send({ societyCode: 'S-15', firstMemberNo: 1 }).expect(400);
    await put(viewer.cookie).send({ societyCode: before.societyCode, firstMemberNo: 1 }).expect(403);
  });

  it('starts from its code and number 1, then takes a set code and starter', async () => {
    const start = await settings().get(ownId);
    expect(start).toMatchObject({ firstMemberNo: 1, issued: 0, nextMemberNo: 1, nextMembershipCode: `${start.societyCode}-000001` });

    const saved = await settings().update(ownActor(), { societyCode: CODE, firstMemberNo: 1001 });
    expect(saved).toMatchObject({ societyCode: CODE, firstMemberNo: 1001, nextMemberNo: 1001, nextMembershipCode: `${CODE}-001001` });
    expect(await addMember('প্রথম')).toMatchObject({ member_no: 1001, membership_code: `${CODE}-001001` });
    expect((await addMember('দ্বিতীয়')).member_no).toBe(1002);
  });

  it('never numbers below one in use when the starter is lowered', async () => {
    expect((await settings().update(ownActor(), { societyCode: CODE, firstMemberNo: 5 })).nextMemberNo).toBe(1003);
    expect((await addMember('তৃতীয়')).member_no).toBe(1003);
  });

  it('re-issues every membership ID when the code changes', async () => {
    const saved = await settings().update(ownActor(), { societyCode: CODE2, firstMemberNo: 1 });
    expect(saved).toMatchObject({ societyCode: CODE2, issued: 3, nextMembershipCode: `${CODE2}-001004` });
    const codes = await prisma.memberships.findMany({ where: { society_id: ownId }, orderBy: { member_no: 'asc' }, select: { membership_code: true } });
    expect(codes.map((row) => row.membership_code)).toEqual([`${CODE2}-001001`, `${CODE2}-001002`, `${CODE2}-001003`]);
  });
});
