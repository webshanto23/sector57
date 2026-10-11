import { Controller, Get, HttpCode, INestApplication, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import {
  AUTH_COOKIES,
  CSRF_HEADER,
  locationPath,
  meWithAccessSchema,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AuditEntity } from './../src/audit/audit.decorators.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { CallerAccess, scopeWhere } from './../src/permissions/caller-access.js';
import { Can, CurrentAccess } from './../src/permissions/permissions.decorators.js';
import { PrismaModule } from './../src/prisma/prisma.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { CurrentSociety } from './../src/society/current-society.decorator.js';
import type { SocietyContext } from './../src/society/society.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-perm-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

/**
 * Test-only routes shaped the way Steps 9 and 10 will use the engine: the guard
 * checks the module, the query is narrowed with scopeWhere, single rows with can().
 */
@Controller('test-probe')
class ProbeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('locations')
  @Can('locations', 'view')
  list(@CurrentSociety() society: SocietyContext, @CurrentAccess() access: CallerAccess, @Query('mark') mark: string) {
    return this.prisma.locations.findMany({
      where: {
        society_id: society.id,
        name: { startsWith: mark },
        ...scopeWhere(access, 'view', 'locations', (prefix) => ({ path: { startsWith: prefix } })),
      },
      select: { name: true },
      orderBy: { name: 'asc' },
    });
  }

  @Post('locations/:id')
  @HttpCode(200)
  @Can('locations', 'edit')
  @AuditEntity('location')
  async touch(@CurrentSociety() society: SocietyContext, @CurrentAccess() access: CallerAccess, @Param('id') id: string) {
    const row = await this.prisma.locations.findFirst({ where: { id, society_id: society.id }, select: { id: true, path: true } });
    // Out of scope looks the same as missing.
    if (!row || !access.can('edit', 'locations', row)) throw new NotFoundException();
    return { id: row.id };
  }

  /** Declares no permission: must be denied to everyone, even full access. */
  @Get('undeclared')
  undeclared() {
    return { ok: true };
  }
}

@Module({ imports: [PrismaModule], controllers: [ProbeController] })
class ProbeModule {}

describe('Permissions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let otherSocietyId: string;
  const server = () => app.getHttpServer();
  const tree = {} as Record<'sector' | 'blockC' | 'blockD' | 'roadC9' | 'foreign', { id: string; path: string }>;

  async function permissionIds(names: string[]) {
    const rows = await prisma.permissions.findMany();
    return names.map((name) => rows.find((p) => `${p.module}:${p.action}` === name)!.id);
  }

  /** A user holding one role with these permissions, optionally limited to a location. */
  async function makeUser(
    permissions: string[],
    options: { scope?: string; isSystem?: boolean; roleSociety?: string; status?: string } = {},
  ) {
    const phone = `018${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    const person = await prisma.persons.create({ data: { society_id: societyId, full_name: `পরীক্ষা ${MARK}`, phone } });
    const user = await prisma.users.create({
      data: { society_id: societyId, person_id: person.id, phone, status: options.status ?? 'active' },
    });
    const role = await prisma.roles.create({
      data: {
        society_id: options.roleSociety ?? societyId,
        name: `${MARK}-${randomUUID()}`,
        is_system: options.isSystem ?? false,
      },
    });
    await prisma.role_permissions.createMany({
      data: (await permissionIds(permissions)).map((permission_id) => ({ role_id: role.id, permission_id })),
    });
    await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.id, scope_location_id: options.scope ?? null } });
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId, sessionId: randomUUID() });
    return { id: user.id, cookie: `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}` };
  }

  const names = async (cookie: string) =>
    (await request(server()).get(`/test-probe/locations?mark=${MARK}`).set('Cookie', cookie).expect(200)).body.map(
      (row: { name: string }) => row.name.slice(MARK.length + 1),
    );

  const touch = (cookie: string, id: string) =>
    request(server()).post(`/test-probe/locations/${id}`).set('Cookie', cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);

  beforeAll(async () => {
    app = await createTestApp([ProbeModule]);
    prisma = app.get(PrismaService);
    societyId = (await prisma.societies.findUniqueOrThrow({ where: { slug: 'sector57' } })).id;
    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: MARK } })).id;

    const levels = await prisma.location_levels.findMany({ where: { society_id: societyId }, orderBy: { depth: 'asc' } });
    const otherLevel = await prisma.location_levels.create({ data: { society_id: otherSocietyId, depth: 1, name_bn: 'সেক্টর' } });

    const add = async (key: keyof typeof tree, parent: keyof typeof tree | null, depth: number, society = societyId) => {
      const id = randomUUID();
      const path = locationPath(parent ? tree[parent].path : null, id);
      const level_id = society === societyId ? levels[depth - 1]!.id : otherLevel.id;
      await prisma.locations.create({
        data: { id, society_id: society, level_id, parent_id: parent ? tree[parent].id : null, name: `${MARK}-${key}`, path },
      });
      tree[key] = { id, path };
    };
    await add('sector', null, 1);
    await add('blockC', 'sector', 2);
    await add('blockD', 'sector', 2);
    await add('roadC9', 'blockC', 3);
    await add('foreign', null, 1, otherSocietyId);
  });

  afterAll(async () => {
    if (prisma) {
      const persons = await prisma.persons.findMany({ where: { full_name: { endsWith: MARK } }, select: { id: true } });
      const users = await prisma.users.findMany({ where: { person_id: { in: persons.map((p) => p.id) } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      await prisma.audit_logs.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.user_roles.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
      await prisma.users.deleteMany({ where: { id: { in: userIds } } });
      await prisma.persons.deleteMany({ where: { id: { in: persons.map((p) => p.id) } } });
      // Children first: the tree's parent link restricts deletes.
      for (const key of ['roadC9', 'blockC', 'blockD', 'sector', 'foreign'] as const) {
        if (tree[key]) await prisma.locations.deleteMany({ where: { id: tree[key].id } });
      }
      if (otherSocietyId) await prisma.societies.deleteMany({ where: { id: otherSocietyId } });
    }
    await app?.close();
  });

  it('seeds exactly the catalogue the code knows', async () => {
    const rows = await prisma.permissions.findMany({ select: { module: true, action: true } });
    const expected = PERMISSION_MODULES.flatMap((module) => PERMISSION_ACTIONS.map((action) => `${module}:${action}`));
    expect(rows.map((p) => `${p.module}:${p.action}`).sort()).toEqual([...expected].sort());
  });

  describe('area scope', () => {
    it('shows a Block C user Block C and below, never Block D', async () => {
      const user = await makeUser(['locations:view', 'locations:edit'], { scope: tree.blockC.id });
      expect(await names(user.cookie)).toEqual(['blockC', 'roadC9']);
      await touch(user.cookie, tree.roadC9.id).expect(200);
      await touch(user.cookie, tree.blockD.id).expect(404);
      await touch(user.cookie, tree.sector.id).expect(404);
    });

    it('shows an unscoped user the whole society', async () => {
      const user = await makeUser(['locations:view']);
      expect(await names(user.cookie)).toEqual(['blockC', 'blockD', 'roadC9', 'sector']);
    });

    it('gives the system role everything without any granted permission', async () => {
      const user = await makeUser([], { isSystem: true });
      expect(await names(user.cookie)).toEqual(['blockC', 'blockD', 'roadC9', 'sector']);
      await touch(user.cookie, tree.blockD.id).expect(200);
    });

    it('treats a scope in another society as no grant at all', async () => {
      const user = await makeUser(['locations:view'], { scope: tree.foreign.id });
      await request(server()).get(`/test-probe/locations?mark=${MARK}`).set('Cookie', user.cookie).expect(403);
    });
  });

  describe('default deny', () => {
    it('refuses a route without the permission, and one that declares none', async () => {
      const viewer = await makeUser(['locations:view']);
      await touch(viewer.cookie, tree.blockC.id).expect(403);
      const admin = await makeUser([], { isSystem: true });
      await request(server()).get('/test-probe/undeclared').set('Cookie', admin.cookie).expect(403);
    });

    it("ignores a role from another society", async () => {
      const user = await makeUser(['locations:view'], { roleSociety: otherSocietyId });
      await request(server()).get(`/test-probe/locations?mark=${MARK}`).set('Cookie', user.cookie).expect(403);
    });

    it('cuts a disabled user off at once, even with a valid token', async () => {
      const user = await makeUser(['locations:view']);
      await prisma.users.update({ where: { id: user.id }, data: { status: 'disabled' } });
      await request(server()).get(`/test-probe/locations?mark=${MARK}`).set('Cookie', user.cookie).expect(403);
    });

    it('needs a login', async () => {
      await request(server()).get(`/test-probe/locations?mark=${MARK}`).expect(401);
    });
  });

  describe('GET /me', () => {
    it('lists the grants, without scoped grants on society-wide modules', async () => {
      const user = await makeUser(['members:view', 'notices:edit'], { scope: tree.blockC.id });
      const res = await request(server()).get('/me').set('Cookie', user.cookie).expect(200);
      expect(meWithAccessSchema.parse(res.body).access).toEqual({
        fullAccess: false,
        grants: [{ module: 'members', action: 'view', scopeLocationId: tree.blockC.id }],
      });
    });

    it('works for a user without any role', async () => {
      const phone = `018${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
      const person = await prisma.persons.create({ data: { society_id: societyId, full_name: `পরীক্ষা ${MARK}`, phone } });
      const bare = await prisma.users.create({ data: { society_id: societyId, person_id: person.id, phone, status: 'active' } });
      const token = await app.get(TokensService).signAccess({ userId: bare.id, societyId, sessionId: randomUUID() });
      const res = await request(server()).get('/me').set('Cookie', `${AUTH_COOKIES.access}=${token}`).expect(200);
      expect(res.body.access).toEqual({ fullAccess: false, grants: [] });
    });
  });

  describe('audit', () => {
    it('records a successful write with who, what and which row', async () => {
      const user = await makeUser(['locations:edit']);
      await touch(user.cookie, tree.blockD.id).expect(200);
      const rows = await prisma.audit_logs.findMany({ where: { user_id: user.id } });
      expect(rows).toEqual([
        expect.objectContaining({ society_id: societyId, action: 'create', entity_type: 'location', entity_id: tree.blockD.id }),
      ]);
    });

    it('records nothing for a refused write', async () => {
      const user = await makeUser(['locations:edit'], { scope: tree.blockC.id });
      await touch(user.cookie, tree.blockD.id).expect(404);
      expect(await prisma.audit_logs.count({ where: { user_id: user.id } })).toBe(0);
    });
  });
});
