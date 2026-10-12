import { INestApplication } from '@nestjs/common';
import { AUTH_COOKIES, CSRF_HEADER, documentListSchema, documentSchema, MAX_RECORD_DOCUMENTS, type Document } from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-doc-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const pdf = () => Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer\n%%EOF\n', 'latin1');
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

type Caller = { cookie: string; id: string };
type Grant = [permissions: string[], scope: string | null];

/**
 * The documents library, in a society of its own. Block C holds flat C1 (Rahim owns it),
 * Block D holds flat D1 (Karim owns it). The `documents` grants are society-wide; who may see a
 * person's or flat's documents also follows the members and units grants in the area.
 */
describe('Documents library (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let otherSocietyId: string;
  const server = () => app.getHttpServer();
  const users = {} as Record<'admin' | 'clerk' | 'officeC' | 'viewerC' | 'nobody', Caller>;
  const ids = {} as Record<'blockC' | 'blockD' | 'c1' | 'd1' | 'rahim' | 'karim', string>;
  const docs = {} as Record<'agm' | 'nid' | 'deed' | 'flat', Document>;

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

  const send = (method: 'post' | 'patch', url: string, caller = users.admin) =>
    request(server())[method](url).set('Cookie', caller.cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const get = (url: string, caller = users.admin) => request(server()).get(url).set('Cookie', caller.cookie);
  const upload = (caller: Caller, fields: Record<string, string>, file = pdf(), name = 'paper.pdf') => {
    let req = send('post', '/documents', caller);
    for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
    return req.attach('file', file, name);
  };
  const list = async (query: string, caller = users.admin) => documentListSchema.parse((await get(`/documents${query}`, caller).expect(200)).body);

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
    ids.blockC = c.id;
    ids.blockD = d.id;
    for (const [key, name, parent] of [['c1', 'সি-১', c], ['d1', 'ডি-১', d]] as const) {
      ids[key] = (await place(flatLevel, name, parent)).id;
      await prisma.units.create({ data: { location_id: ids[key], society_id: societyId, unit_type: 'residential' } });
    }
    const person = (full_name: string) => prisma.persons.create({ data: { society_id: societyId, full_name, phone: randomPhone() } }).then((r) => r.id);
    ids.rahim = await person('রহিম উদ্দিন');
    ids.karim = await person('করিম মিয়া');
    await prisma.ownerships.create({ data: { society_id: societyId, location_id: ids.c1, person_id: ids.rahim, start_date: day('2020-01-01') } });
    await prisma.ownerships.create({ data: { society_id: societyId, location_id: ids.d1, person_id: ids.karim, start_date: day('2020-01-01') } });

    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: `${MARK}-other` } })).id;

    const everything = (await prisma.permissions.findMany()).map((p) => `${p.module}:${p.action}`);
    const docAll = ['documents:view', 'documents:create', 'documents:edit'];
    users.admin = await makeUser([[everything, null]]);
    users.clerk = await makeUser([[docAll, null]]);
    users.officeC = await makeUser([
      [docAll, null],
      [['members:view', 'members:edit', 'units:view', 'units:edit'], ids.blockC],
    ]);
    users.viewerC = await makeUser([
      [['documents:view'], null],
      [['members:view', 'units:view'], ids.blockC],
    ]);
    users.nobody = await makeUser([]);
  });

  afterAll(async () => {
    if (!prisma) return;
    const societies = { in: [societyId, otherSocietyId] };
    await prisma.documents.deleteMany({ where: { society_id: societies } });
    await prisma.ownerships.deleteMany({ where: { society_id: societies } });
    await prisma.persons.deleteMany({ where: { society_id: societies } });
    await prisma.user_roles.deleteMany({ where: { users_user_roles_user_idTousers: { society_id: societyId } } });
    for (const depth of [2, 1]) await prisma.locations.deleteMany({ where: { society_id: societies, location_levels: { depth } } });
    await prisma.societies.deleteMany({ where: { id: societies } });
    await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
    await app.close();
  });

  describe('society papers', () => {
    it('stores a checked PDF with a title and serves it only to documents viewers, auditing each read', async () => {
      const res = await upload(users.clerk, { entityType: 'society', docType: 'agm', title: '  বার্ষিক সাধারণ সভা ২০২৬  ' }).expect(201);
      docs.agm = documentSchema.parse(res.body);
      expect(docs.agm).toMatchObject({ entityType: 'society', entityId: societyId, docType: 'agm', title: 'বার্ষিক সাধারণ সভা ২০২৬', kind: 'pdf', uploadedBy: { id: users.clerk.id } });

      const listed = await list('', users.viewerC);
      expect(listed.items.map((doc) => doc.id)).toEqual([docs.agm.id]);
      expect(listed.can).toEqual({ create: false, edit: false });
      expect((await list('', users.clerk)).can).toEqual({ create: true, edit: true });
      expect((await list(`?q=${encodeURIComponent('2026')}`)).total).toBe(1);

      const file = await get(`/documents/${docs.agm.id}/file`, users.viewerC).buffer(true).expect(200);
      expect(file.headers['content-type']).toBe('application/pdf');
      expect(file.headers['cache-control']).toBe('private, no-store');
      expect(file.headers['content-disposition']).toMatch(/^attachment; filename="agm-\d{4}-\d{2}-\d{2}\.pdf"$/);
      expect(Buffer.from(file.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      expect(await prisma.audit_logs.count({ where: { entity_type: 'document', entity_id: docs.agm.id, action: 'view_file' } })).toBe(1);

      await get('/documents', users.nobody).expect(403);
      await request(server()).get(`/documents/${docs.agm.id}/file`).expect(401);
    });

    it('refuses other files, a type that does not fit, and a missing title or file', async () => {
      await upload(users.clerk, { entityType: 'society', docType: 'minutes', title: 'x' }, Buffer.from('hello'), 'x.txt').expect(415);
      expect(JSON.stringify((await upload(users.clerk, { entityType: 'society', docType: 'deed', title: 'দলিল' }).expect(400)).body)).toContain('invalid_doc_type');
      await upload(users.clerk, { entityType: 'society', docType: 'minutes', title: '   ' }).expect(400);
      await send('post', '/documents', users.clerk).field('entityType', 'society').field('docType', 'minutes').field('title', 'x').expect(400);
      await upload(users.viewerC, { entityType: 'society', docType: 'minutes', title: 'x' }).expect(403);
      expect(await prisma.documents.count({ where: { society_id: societyId } })).toBe(1);
    });
  });

  describe("a person's documents", () => {
    it('follows the person: their area to see, editing them to add, and only editors see an NID copy', async () => {
      docs.nid = documentSchema.parse((await upload(users.officeC, { entityType: 'person', entityId: ids.rahim, docType: 'nid', title: 'এনআইডি কপি' }).expect(201)).body);
      docs.deed = documentSchema.parse((await upload(users.officeC, { entityType: 'person', entityId: ids.rahim, docType: 'deed', title: 'দলিল সি-১' }).expect(201)).body);

      expect((await list(`?entityType=person&entityId=${ids.rahim}`, users.officeC)).total).toBe(2);
      const seen = await list(`?entityType=person&entityId=${ids.rahim}`, users.viewerC);
      expect(seen.items.map((doc) => doc.docType)).toEqual(['deed']);
      expect(seen.can).toEqual({ create: false, edit: false });
      await get(`/documents/${docs.nid.id}`, users.viewerC).expect(404);
      await get(`/documents/${docs.nid.id}/file`, users.viewerC).expect(404);
      await get(`/documents/${docs.deed.id}/file`, users.viewerC).expect(200);

      // Society papers don't come with it, and the society list doesn't carry person documents.
      expect((await list('')).items.map((doc) => doc.id)).toEqual([docs.agm.id]);

      // A documents clerk without members rights sees no person; Block C's office not Block D's owner.
      expect((await get(`/documents?entityType=person&entityId=${ids.rahim}`, users.clerk).expect(404)).body.code).toBe('person_not_found');
      await get(`/documents/${docs.deed.id}`, users.clerk).expect(404);
      await get(`/documents?entityType=person&entityId=${ids.karim}`, users.officeC).expect(404);
      await upload(users.officeC, { entityType: 'person', entityId: ids.karim, docType: 'deed', title: 'x' }).expect(404);
      await upload(users.officeC, { entityType: 'person', docType: 'deed', title: 'x' }).expect(400);
      expect(JSON.stringify((await upload(users.officeC, { entityType: 'person', entityId: ids.rahim, docType: 'minutes', title: 'x' }).expect(400)).body)).toContain(
        'invalid_doc_type',
      );
    });

    it('keeps at most the limit per person', async () => {
      await prisma.documents.createMany({
        data: Array.from({ length: MAX_RECORD_DOCUMENTS - 2 }, (_, i) => ({
          society_id: societyId,
          entity_type: 'person',
          entity_id: ids.rahim,
          doc_type: 'other',
          title: `filler ${i}`,
          file_url: `${societyId}/documents/filler-${i}.pdf`,
          file_name: 'filler.pdf',
        })),
      });
      expect((await upload(users.officeC, { entityType: 'person', entityId: ids.rahim, docType: 'other', title: 'আরও' }).expect(409)).body.code).toBe('too_many_documents');
      await prisma.documents.deleteMany({ where: { entity_id: ids.rahim, title: { startsWith: 'filler' } } });
    });
  });

  describe("a place's documents", () => {
    it('follows the units grant at the flat', async () => {
      docs.flat = documentSchema.parse((await upload(users.officeC, { entityType: 'location', entityId: ids.c1, docType: 'plan', title: 'নকশা সি-১' }).expect(201)).body);
      expect((await list(`?entityType=location&entityId=${ids.c1}`, users.viewerC)).items.map((doc) => doc.id)).toEqual([docs.flat.id]);
      expect((await get(`/documents?entityType=location&entityId=${ids.d1}`, users.officeC).expect(404)).body.code).toBe('location_not_found');
      await upload(users.officeC, { entityType: 'location', entityId: ids.d1, docType: 'plan', title: 'x' }).expect(404);
      await upload(users.viewerC, { entityType: 'location', entityId: ids.c1, docType: 'plan', title: 'x' }).expect(403);
    });
  });

  describe('changes', () => {
    it('renames, refuses a type that does not fit, archives and restores, never deleting the file', async () => {
      const renamed = documentSchema.parse((await send('patch', `/documents/${docs.deed.id}`, users.officeC).send({ title: 'জমির দলিল' }).expect(200)).body);
      expect(renamed.title).toBe('জমির দলিল');
      expect(JSON.stringify((await send('patch', `/documents/${docs.deed.id}`, users.officeC).send({ docType: 'minutes' }).expect(400)).body)).toContain('invalid_doc_type');
      await send('patch', `/documents/${docs.deed.id}`, users.viewerC).send({ title: 'x' }).expect(403);

      const archived = documentSchema.parse((await send('post', `/documents/${docs.deed.id}/archive`, users.officeC).expect(200)).body);
      expect(archived).toMatchObject({ archivedBy: { id: users.officeC.id } });
      expect(archived.archivedAt).not.toBeNull();
      expect((await send('post', `/documents/${docs.deed.id}/archive`, users.officeC).expect(409)).body.code).toBe('document_archived');
      expect((await list(`?entityType=person&entityId=${ids.rahim}`, users.officeC)).items.map((doc) => doc.docType)).toEqual(['nid']);
      expect((await list(`?entityType=person&entityId=${ids.rahim}&archived=true`, users.officeC)).items.map((doc) => doc.id)).toEqual([docs.deed.id]);
      await get(`/documents/${docs.deed.id}/file`, users.officeC).expect(200);

      const restored = documentSchema.parse((await send('post', `/documents/${docs.deed.id}/restore`, users.officeC).expect(200)).body);
      expect(restored.archivedAt).toBeNull();
      expect((await send('post', `/documents/${docs.deed.id}/restore`, users.officeC).expect(409)).body.code).toBe('document_not_archived');
      expect(await prisma.audit_logs.count({ where: { entity_type: 'document', entity_id: docs.deed.id, action: { in: ['create', 'update', 'archive', 'restore'] } } })).toBe(4);
    });

    it('never shows form files, expense vouchers or another society', async () => {
      const voucher = await prisma.documents.create({
        data: { society_id: societyId, entity_type: 'expense', entity_id: randomUUID(), doc_type: 'voucher', file_url: `${societyId}/expenses/x.pdf`, file_name: 'voucher-1.pdf' },
      });
      const foreign = await prisma.documents.create({
        data: { society_id: otherSocietyId, entity_type: 'society', entity_id: otherSocietyId, doc_type: 'minutes', title: 'অন্য', file_url: `${otherSocietyId}/documents/x.pdf`, file_name: 'x.pdf' },
      });
      for (const id of [voucher.id, foreign.id]) {
        await get(`/documents/${id}`).expect(404);
        await get(`/documents/${id}/file`).expect(404);
        await send('post', `/documents/${id}/archive`).expect(404);
      }
      expect((await list('')).items.some((doc) => doc.id === foreign.id)).toBe(false);
    });
  });
});
