import { INestApplication } from '@nestjs/common';
import { AUTH_COOKIES, CSRF_HEADER, documentListSchema, licencePagesSchema, MAX_LICENCE_PAGES, nidCopiesSchema } from '@s57/shared';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-idc-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const pdf = () => Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer\n%%EOF\n', 'latin1');
const photo = () => sharp({ create: { width: 12, height: 8, channels: 3, background: '#88aacc' } }).png().toBuffer();
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

type Caller = { cookie: string; id: string };
type Grant = [permissions: string[], scope: string | null];

/**
 * NID and trade licence copies on the member pages. Block C holds flat C1, owned by Rahim and
 * rented by the organisation Acme; Block D holds flat D1, owned by Karim. Only those who may
 * edit the person or organisation see or change the copies.
 */
describe('ID copies (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let otherSocietyId: string;
  const server = () => app.getHttpServer();
  const users = {} as Record<'officeC' | 'viewerC' | 'officeD', Caller>;
  const ids = {} as Record<'c1' | 'd1' | 'rahim' | 'karim' | 'acme' | 'foreign', string>;

  async function makeUser(grants: Grant[]): Promise<Caller> {
    const rows = await prisma.permissions.findMany();
    const user = await prisma.users.create({ data: { society_id: societyId, phone: randomPhone(), status: 'active' } });
    for (const [permissions, scope] of grants) {
      const role = await prisma.roles.create({ data: { society_id: societyId, name: `${MARK}-${randomUUID()}` } });
      await prisma.role_permissions.createMany({
        data: permissions.map((name) => ({ role_id: role.id, permission_id: rows.find((p) => `${p.module}:${p.action}` === name)!.id })),
      });
      await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.id, scope_location_id: scope } });
    }
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId, sessionId: randomUUID() });
    return { cookie: `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}`, id: user.id };
  }

  const send = (method: 'post' | 'delete', url: string, caller: Caller) =>
    request(server())[method](url).set('Cookie', caller.cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const get = (url: string, caller: Caller) => request(server()).get(url).set('Cookie', caller.cookie);
  const attach = (url: string, caller: Caller, file: Buffer, name: string) => send('post', url, caller).attach('file', file, name);

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { PrismaPg, PrismaClient } = await import('@s57/db');
    const setup = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    societyId = (await setup.societies.create({ data: { name_bn: `সমিতি ${MARK}`, slug: MARK } })).id;
    await setup.$disconnect();

    app = await createTestApp([], { DEFAULT_SOCIETY_SLUG: MARK });
    prisma = app.get(PrismaService);

    const level = (depth: number, name_bn: string, is_unit_level = false) =>
      prisma.location_levels.create({ data: { society_id: societyId, depth, name_bn, is_unit_level } }).then((r) => r.id);
    const blockLevel = await level(1, 'ব্লক');
    const flatLevel = await level(2, 'ইউনিট', true);
    const place = async (levelId: string, name: string, parent: { id: string; path: string } | null) => {
      const id = randomUUID();
      const path = `${parent?.path ?? '/'}${id}/`;
      await prisma.locations.create({ data: { id, society_id: societyId, level_id: levelId, parent_id: parent?.id ?? null, name, path } });
      return { id, path };
    };
    const c = await place(blockLevel, 'ব্লক সি', null);
    const d = await place(blockLevel, 'ব্লক ডি', null);
    for (const [key, name, parent] of [['c1', 'সি-১', c], ['d1', 'ডি-১', d]] as const) {
      ids[key] = (await place(flatLevel, name, parent)).id;
      await prisma.units.create({ data: { location_id: ids[key], society_id: societyId, unit_type: 'residential' } });
    }
    const person = (full_name: string) => prisma.persons.create({ data: { society_id: societyId, full_name, phone: randomPhone() } }).then((r) => r.id);
    ids.rahim = await person('রহিম উদ্দিন');
    ids.karim = await person('করিম মিয়া');
    ids.acme = (await prisma.organisations.create({ data: { society_id: societyId, name: 'অ্যাকমি' } })).id;
    await prisma.ownerships.create({ data: { society_id: societyId, location_id: ids.c1, person_id: ids.rahim, start_date: day('2020-01-01') } });
    await prisma.ownerships.create({ data: { society_id: societyId, location_id: ids.d1, person_id: ids.karim, start_date: day('2020-01-01') } });
    await prisma.ownerships.create({ data: { society_id: societyId, location_id: ids.c1, organisation_id: ids.acme, start_date: day('2021-01-01') } });

    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: `${MARK}-other` } })).id;
    ids.foreign = (await prisma.persons.create({ data: { society_id: otherSocietyId, full_name: 'অন্য', phone: randomPhone() } })).id;

    users.officeC = await makeUser([
      [['documents:view'], null],
      [['members:view', 'members:edit'], c.id],
    ]);
    users.viewerC = await makeUser([[['members:view'], c.id]]);
    users.officeD = await makeUser([[['members:view', 'members:edit'], d.id]]);
  });

  afterAll(async () => {
    if (!prisma) return;
    const societies = { in: [societyId, otherSocietyId] };
    await prisma.documents.deleteMany({ where: { society_id: societies } });
    await prisma.ownerships.deleteMany({ where: { society_id: societies } });
    await prisma.organisations.deleteMany({ where: { society_id: societies } });
    await prisma.persons.deleteMany({ where: { society_id: societies } });
    await prisma.user_roles.deleteMany({ where: { users_user_roles_user_idTousers: { society_id: societyId } } });
    for (const depth of [2, 1]) await prisma.locations.deleteMany({ where: { society_id: societies, location_levels: { depth } } });
    await prisma.societies.deleteMany({ where: { id: societies } });
    await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
    await app.close();
  });

  it('keeps one copy per NID side, archives the one it replaces and serves it to editors only', async () => {
    const base = `/persons/${ids.rahim}/nid-copy`;
    expect(nidCopiesSchema.parse((await get(base, users.officeC).expect(200)).body)).toEqual({ front: null, back: null });

    const first = nidCopiesSchema.parse((await attach(`${base}/front`, users.officeC, await photo(), 'front.png').expect(200)).body);
    const second = nidCopiesSchema.parse((await attach(`${base}/front`, users.officeC, await photo(), 'front.png').expect(200)).body);
    expect(second.front?.id).not.toBe(first.front?.id);
    expect(second).toMatchObject({ front: { kind: 'image' }, back: null });
    const old = await prisma.documents.findUniqueOrThrow({ where: { id: first.front!.id } });
    expect(old.archived_at).not.toBeNull();

    const file = await get(`/persons/${ids.rahim}/id-copies/${second.front!.id}/file`, users.officeC).expect(200);
    expect(file.headers['content-type']).toBe('image/webp');
    await get(`/persons/${ids.rahim}/id-copies/${first.front!.id}/file`, users.officeC).expect(404);

    expect((await attach(`${base}/back`, users.officeC, pdf(), 'back.pdf').expect(415)).body.code).toBe('unsupported_image');
    await attach(`${base}/back`, users.viewerC, await photo(), 'back.png').expect(403);
    await get(base, users.viewerC).expect(403);
    await get(`/persons/${ids.rahim}/id-copies/${second.front!.id}/file`, users.viewerC).expect(403);
    await get(base, users.officeD).expect(404);
    await get(`/persons/${ids.foreign}/nid-copy`, users.officeC).expect(404);

    // Never in the documents library, not even by id.
    const library = documentListSchema.parse((await get(`/documents?entityType=person&entityId=${ids.rahim}`, users.officeC).expect(200)).body);
    expect(library.items).toHaveLength(0);
    await get(`/documents/${second.front!.id}/file`, users.officeC).expect(404);

    expect(nidCopiesSchema.parse((await send('delete', `${base}/front`, users.officeC).expect(200)).body).front).toBeNull();
    expect((await send('delete', `${base}/front`, users.officeC).expect(404)).body.code).toBe('id_copy_not_found');
    expect(await prisma.documents.count({ where: { entity_id: ids.rahim } })).toBe(2);
    expect(await prisma.audit_logs.count({ where: { entity_id: ids.rahim, action: { in: ['nid_copy_set', 'nid_copy_remove'] } } })).toBe(3);
  });

  it('keeps trade licence pages in order, up to the limit', async () => {
    const base = `/organisations/${ids.acme}/licence-pages`;
    const one = licencePagesSchema.parse((await attach(base, users.officeC, pdf(), 'p1.pdf').expect(200)).body);
    const two = licencePagesSchema.parse((await attach(base, users.officeC, await photo(), 'p2.png').expect(200)).body);
    expect(two.items.map((page) => page.kind)).toEqual(['pdf', 'image']);
    expect(two.items[0]!.id).toBe(one.items[0]!.id);

    const file = await get(`${base}/${one.items[0]!.id}/file`, users.officeC).expect(200);
    expect(file.headers['content-disposition']).toMatch(/^attachment/);
    await get(base, users.viewerC).expect(403);
    await get(base, users.officeD).expect(404);

    for (let page = 2; page < MAX_LICENCE_PAGES; page++) await attach(base, users.officeC, pdf(), 'p.pdf').expect(200);
    expect((await attach(base, users.officeC, pdf(), 'p.pdf').expect(409)).body.code).toBe('too_many_licence_pages');

    const left = licencePagesSchema.parse((await send('delete', `${base}/${one.items[0]!.id}`, users.officeC).expect(200)).body);
    expect(left.items).toHaveLength(MAX_LICENCE_PAGES - 1);
    await send('delete', `${base}/${one.items[0]!.id}`, users.officeC).expect(404);
    await get(`${base}/${one.items[0]!.id}/file`, users.officeC).expect(404);
  });
});
