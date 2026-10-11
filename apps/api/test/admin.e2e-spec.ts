import { INestApplication } from '@nestjs/common';
import {
  AUTH_COOKIES,
  createdUserSchema,
  CSRF_HEADER,
  locationPath,
  roleDetailSchema,
  roleListSchema,
  userDetailSchema,
  userFormOptionsSchema,
  userListSchema,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-admin-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `016${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

describe('Roles and users admin (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let otherSocietyId: string;
  let systemRoleId: string;
  const server = () => app.getHttpServer();
  const tree = {} as Record<'sector' | 'blockC' | 'blockD', { id: string; path: string }>;

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

  /** A user (in `society`) holding the given roles; returns its id and login cookie. */
  async function makeUser(roles: { roleId: string; scope?: string }[], society = societyId) {
    const phone = randomPhone();
    const person = await prisma.persons.create({ data: { society_id: society, full_name: `পরীক্ষা ${MARK}`, phone } });
    const user = await prisma.users.create({ data: { society_id: society, person_id: person.id, phone, status: 'active' } });
    for (const role of roles) {
      await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.roleId, scope_location_id: role.scope ?? null } });
    }
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId: society, sessionId: randomUUID() });
    return { id: user.id, phone, cookie: `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}` };
  }

  const admin = () => makeUser([{ roleId: systemRoleId }]);

  const send = (method: 'post' | 'put' | 'patch' | 'delete', url: string, cookie: string) =>
    request(server())[method](url).set('Cookie', cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const get = (url: string, cookie: string) => request(server()).get(url).set('Cookie', cookie);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    societyId = (await prisma.societies.findUniqueOrThrow({ where: { slug: 'sector57' } })).id;
    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: MARK } })).id;
    systemRoleId = (await prisma.roles.findFirstOrThrow({ where: { society_id: societyId, is_system: true } })).id;

    const levels = await prisma.location_levels.findMany({ where: { society_id: societyId }, orderBy: { depth: 'asc' } });
    const add = async (key: keyof typeof tree, parent: keyof typeof tree | null, depth: number) => {
      const id = randomUUID();
      const path = locationPath(parent ? tree[parent].path : null, id);
      await prisma.locations.create({
        data: { id, society_id: societyId, level_id: levels[depth - 1]!.id, parent_id: parent ? tree[parent].id : null, name: `${MARK}-${key}`, path },
      });
      tree[key] = { id, path };
    };
    await add('sector', null, 1);
    await add('blockC', 'sector', 2);
    await add('blockD', 'sector', 2);
  });

  afterAll(async () => {
    if (prisma) {
      const persons = await prisma.persons.findMany({
        where: { OR: [{ full_name: { contains: MARK } }, { society_id: otherSocietyId }] },
        select: { id: true },
      });
      const users = await prisma.users.findMany({
        where: { OR: [{ person_id: { in: persons.map((p) => p.id) } }, { society_id: otherSocietyId }] },
        select: { id: true },
      });
      const userIds = users.map((u) => u.id);
      await prisma.audit_logs.deleteMany({ where: { OR: [{ user_id: { in: userIds } }, { entity_id: { in: userIds } }] } });
      await prisma.user_sessions.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.user_roles.deleteMany({ where: { user_id: { in: userIds } } });
      const roles = await prisma.roles.findMany({ where: { name: { startsWith: MARK } }, select: { id: true } });
      await prisma.audit_logs.deleteMany({ where: { entity_id: { in: roles.map((r) => r.id) } } });
      await prisma.roles.deleteMany({ where: { id: { in: roles.map((r) => r.id) } } });
      await prisma.users.deleteMany({ where: { id: { in: userIds } } });
      await prisma.persons.deleteMany({ where: { id: { in: persons.map((p) => p.id) } } });
      for (const key of ['blockC', 'blockD', 'sector'] as const) {
        if (tree[key]) await prisma.locations.deleteMany({ where: { id: tree[key].id } });
      }
      if (otherSocietyId) await prisma.societies.deleteMany({ where: { id: otherSocietyId } });
    }
    await app?.close();
  });

  describe('roles', () => {
    it('creates, edits and deletes a role, with audit rows', async () => {
      const caller = await admin();
      const created = roleDetailSchema.parse(
        (
          await send('post', '/roles', caller.cookie)
            .send({ name: `${MARK}-কোষাধ্যক্ষ`, description: 'Treasurer', permissions: [{ module: 'billing', action: 'view' }] })
            .expect(201)
        ).body,
      );
      expect(created).toMatchObject({ isSystem: false, userCount: 0, permissionCount: 1 });

      const updated = await send('put', `/roles/${created.id}`, caller.cookie)
        .send({
          name: `${MARK}-কোষাধ্যক্ষ`,
          description: null,
          permissions: [
            { module: 'billing', action: 'view' },
            { module: 'payments', action: 'create' },
          ],
        })
        .expect(200);
      expect(updated.body.permissions).toHaveLength(2);

      const list = roleListSchema.parse((await get('/roles', caller.cookie).expect(200)).body);
      expect(list.items[0]!.isSystem).toBe(true);
      expect(list.items.some((role) => role.id === created.id)).toBe(true);

      await send('delete', `/roles/${created.id}`, caller.cookie).expect(204);
      const audit = await prisma.audit_logs.findMany({ where: { entity_id: created.id }, orderBy: { created_at: 'asc' } });
      expect(audit.map((row) => row.action)).toEqual(['create', 'update', 'delete']);
    });

    it('answers 409 for a duplicate name', async () => {
      const caller = await admin();
      const name = `${MARK}-duplicate`;
      await send('post', '/roles', caller.cookie).send({ name, permissions: [] }).expect(201);
      const res = await send('post', '/roles', caller.cookie).send({ name, permissions: [] }).expect(409);
      expect(res.body.code).toBe('role_name_taken');
    });

    it('refuses to grant a permission the caller does not hold', async () => {
      const caller = await makeUser([{ roleId: await makeRole(['roles:create', 'roles:edit', 'notices:view']) }]);
      await send('post', '/roles', caller.cookie)
        .send({ name: `${MARK}-ok`, permissions: [{ module: 'notices', action: 'view' }] })
        .expect(201);
      const res = await send('post', '/roles', caller.cookie)
        .send({ name: `${MARK}-escalate`, permissions: [{ module: 'users', action: 'edit' }] })
        .expect(403);
      expect(res.body.code).toBe('beyond_your_permissions');

      // Nor remove one from a role (it would need the same power).
      const stronger = await makeRole(['audit:view']);
      await send('put', `/roles/${stronger}`, caller.cookie).send({ name: `${MARK}-weaker`, permissions: [] }).expect(403);
    });

    it('protects the system role', async () => {
      const caller = await admin();
      const put = await send('put', `/roles/${systemRoleId}`, caller.cookie).send({ name: 'x', permissions: [] }).expect(403);
      expect(put.body.code).toBe('system_role_protected');
      await send('delete', `/roles/${systemRoleId}`, caller.cookie).expect(403);
    });

    it('refuses to delete a role someone holds', async () => {
      const caller = await admin();
      const roleId = await makeRole(['notices:view']);
      await makeUser([{ roleId }]);
      const res = await send('delete', `/roles/${roleId}`, caller.cookie).expect(409);
      expect(res.body.code).toBe('role_in_use');
    });

    it("hides another society's roles", async () => {
      const caller = await admin();
      const foreign = await makeRole(['notices:view'], otherSocietyId);
      await get(`/roles/${foreign}`, caller.cookie).expect(404);
      await send('put', `/roles/${foreign}`, caller.cookie).send({ name: 'x', permissions: [] }).expect(404);
      await send('delete', `/roles/${foreign}`, caller.cookie).expect(404);
      const list = roleListSchema.parse((await get('/roles', caller.cookie).expect(200)).body);
      expect(list.items.some((role) => role.id === foreign)).toBe(false);
    });

    it('needs roles permissions', async () => {
      const caller = await makeUser([{ roleId: await makeRole(['users:view']) }]);
      await get('/roles', caller.cookie).expect(403);
      await request(server()).get('/roles').expect(401);
    });
  });

  describe('users', () => {
    it('creates an active user who can log in with the temporary password', async () => {
      const caller = await admin();
      const roleId = await makeRole(['members:view']);
      const phone = randomPhone();
      const res = await send('post', '/users', caller.cookie)
        .send({ name: `নতুন ${MARK}`, phone, roles: [{ roleId, scopeLocationId: tree.blockC.id }] })
        .expect(201);
      const created = createdUserSchema.parse(res.body);
      expect(created.temporaryPassword).toHaveLength(10);

      await request(server()).post('/auth/login').set('Origin', ORIGIN).send({ phone, password: created.temporaryPassword }).expect(200);
      const detail = userDetailSchema.parse((await get(`/users/${created.id}`, caller.cookie).expect(200)).body);
      expect(detail).toMatchObject({ status: 'active', name: `নতুন ${MARK}`, canManage: true, isSelf: false });
      expect(detail.roles).toEqual([expect.objectContaining({ roleId, scopeLocationId: tree.blockC.id, scopeName: `${MARK}-blockC` })]);

      const audit = await prisma.audit_logs.findFirstOrThrow({ where: { entity_id: created.id, action: 'create' } });
      expect(JSON.stringify(audit.after_data)).not.toContain(created.temporaryPassword);

      const dup = await send('post', '/users', caller.cookie).send({ name: `আবার ${MARK}`, phone }).expect(409);
      expect(dup.body.code).toBe('phone_taken');
    });

    it('lists and searches users of this society only', async () => {
      const caller = await admin();
      const target = await makeUser([]);
      const foreign = await makeUser([], otherSocietyId);
      const list = userListSchema.parse((await get(`/users?q=${target.phone.slice(-6)}`, caller.cookie).expect(200)).body);
      expect(list.items.map((user) => user.id)).toEqual([target.id]);
      const all = userListSchema.parse((await get(`/users?pageSize=100&q=${encodeURIComponent(MARK)}`, caller.cookie).expect(200)).body);
      expect(all.items.some((user) => user.id === foreign.id)).toBe(false);
      await get(`/users/${foreign.id}`, caller.cookie).expect(404);
      await send('patch', `/users/${foreign.id}`, caller.cookie).send({ status: 'disabled' }).expect(404);
      await send('post', `/users/${foreign.id}/reset-password`, caller.cookie).expect(404);
    });

    it('refuses a role or area from another society', async () => {
      const caller = await admin();
      const foreignRole = await makeRole(['notices:view'], otherSocietyId);
      const res = await send('post', '/users', caller.cookie)
        .send({ name: `x ${MARK}`, phone: randomPhone(), roles: [{ roleId: foreignRole, scopeLocationId: null }] })
        .expect(400);
      expect(res.body.code).toBe('invalid_assignment');
    });

    it('keeps a block manager to their block when giving roles', async () => {
      const officer = await makeRole(['users:view', 'users:create', 'users:edit']);
      const blockRole = await makeRole(['members:view']);
      const caller = await makeUser([{ roleId: officer }, { roleId: blockRole, scope: tree.blockC.id }]);

      await send('post', '/users', caller.cookie)
        .send({ name: `c ${MARK}`, phone: randomPhone(), roles: [{ roleId: blockRole, scopeLocationId: tree.blockC.id }] })
        .expect(201);
      for (const scopeLocationId of [tree.blockD.id, null]) {
        const res = await send('post', '/users', caller.cookie)
          .send({ name: `d ${MARK}`, phone: randomPhone(), roles: [{ roleId: blockRole, scopeLocationId }] })
          .expect(403);
        expect(res.body.code).toBe('beyond_your_permissions');
      }

      const options = userFormOptionsSchema.parse((await get('/users/options', caller.cookie).expect(200)).body);
      expect(options.roles.find((role) => role.id === systemRoleId)?.grantable).toBe(false);
      expect(options.roles.find((role) => role.id === officer)?.grantable).toBe(true);
      expect(options.scopes.some((scope) => scope.id === tree.blockC.id)).toBe(true);
    });

    it('lets nobody touch a user holding more than they do', async () => {
      const officer = await makeRole(['users:view', 'users:edit']);
      const caller = await makeUser([{ roleId: officer }]);
      const boss = await admin();

      const detail = userDetailSchema.parse((await get(`/users/${boss.id}`, caller.cookie).expect(200)).body);
      expect(detail.canManage).toBe(false);
      await send('patch', `/users/${boss.id}`, caller.cookie).send({ status: 'disabled' }).expect(403);
      await send('post', `/users/${boss.id}/reset-password`, caller.cookie).expect(403);
      await send('put', `/users/${boss.id}/roles`, caller.cookie).send({ roles: [] }).expect(403);

      // Only a system role holder can give the system role.
      const peer = await makeUser([]);
      await send('put', `/users/${peer.id}/roles`, caller.cookie)
        .send({ roles: [{ roleId: systemRoleId, scopeLocationId: null }] })
        .expect(403);
    });

    it('refuses changes to your own status, roles and password', async () => {
      const caller = await admin();
      for (const res of [
        await send('patch', `/users/${caller.id}`, caller.cookie).send({ status: 'disabled' }),
        await send('put', `/users/${caller.id}/roles`, caller.cookie).send({ roles: [] }),
        await send('post', `/users/${caller.id}/reset-password`, caller.cookie),
      ]) {
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('cannot_change_self');
      }
      // The profile itself is fine.
      const res = await send('patch', `/users/${caller.id}`, caller.cookie).send({ nameEn: 'Test Admin' }).expect(200);
      expect(res.body.nameEn).toBe('Test Admin');
    });

    it('lets one full-access user disable another (the caller always remains)', async () => {
      const caller = await admin();
      const target = await admin();
      await send('patch', `/users/${target.id}`, caller.cookie).send({ status: 'disabled' }).expect(200);
      // A disabled admin is cut off at once.
      await get('/roles', target.cookie).expect(403);
      await send('patch', `/users/${target.id}`, caller.cookie).send({ status: 'active' }).expect(200);
      await get('/roles', target.cookie).expect(200);
    });

    it('disables a user at once and logs them out everywhere', async () => {
      const caller = await admin();
      const roleId = await makeRole(['notices:view', 'roles:view']);
      const target = await makeUser([{ roleId }]);
      await prisma.user_sessions.create({
        data: { society_id: societyId, user_id: target.id, family_id: randomUUID(), token_hash: randomUUID(), expires_at: new Date(Date.now() + 86_400_000) },
      });
      await get('/roles', target.cookie).expect(200);

      await send('patch', `/users/${target.id}`, caller.cookie).send({ status: 'disabled' }).expect(200);
      await get('/roles', target.cookie).expect(403);
      expect(await prisma.user_sessions.count({ where: { user_id: target.id, revoked_at: null } })).toBe(0);
      expect(await prisma.audit_logs.count({ where: { entity_id: target.id, action: 'disable' } })).toBe(1);
    });

    it('applies a role change on the next request', async () => {
      const caller = await admin();
      const viewer = await makeRole(['roles:view']);
      const target = await makeUser([]);
      await get('/roles', target.cookie).expect(403);
      const res = await send('put', `/users/${target.id}/roles`, caller.cookie)
        .send({ roles: [{ roleId: viewer, scopeLocationId: null }] })
        .expect(200);
      expect(res.body.roles).toHaveLength(1);
      await get('/roles', target.cookie).expect(200);
      expect(await prisma.audit_logs.count({ where: { entity_id: target.id, action: 'update_roles' } })).toBe(1);
    });

    it('resets a password and ends every session', async () => {
      const caller = await admin();
      const target = await makeUser([]);
      await prisma.user_sessions.create({
        data: { society_id: societyId, user_id: target.id, family_id: randomUUID(), token_hash: randomUUID(), expires_at: new Date(Date.now() + 86_400_000) },
      });
      const res = await send('post', `/users/${target.id}/reset-password`, caller.cookie).expect(200);
      expect(res.body.temporaryPassword).toHaveLength(10);
      expect(await prisma.user_sessions.count({ where: { user_id: target.id, revoked_at: null } })).toBe(0);
      await request(server())
        .post('/auth/login')
        .set('Origin', ORIGIN)
        .send({ phone: target.phone, password: res.body.temporaryPassword })
        .expect(200);
      expect(await prisma.audit_logs.count({ where: { entity_id: target.id, action: 'password_reset', user_id: caller.id } })).toBe(1);
    });
  });
});
