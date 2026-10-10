import { INestApplication } from '@nestjs/common';
import {
  albumAdminListSchema,
  albumAdminSchema,
  AUTH_COOKIES,
  committeeSeatListSchema,
  committeeSeatSchema,
  CSRF_HEADER,
  noticeAdminListSchema,
  noticeAdminSchema,
  photoAdminSchema,
  sitePageAdminSchema,
} from '@s57/shared';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { ENV, type Env } from './../src/config/env.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-cms-${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const CSRF = 'csrf-token-for-tests';

const randomPhone = () => `015${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const png = (width = 64, height = 48) =>
  sharp({ create: { width, height, channels: 3, background: '#3a8' } })
    .png()
    .toBuffer();
const isoIn = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const dateIn = (days: number) => isoIn(days).slice(0, 10);

describe('Content CMS and file storage (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let mediaDir: string;
  let societyId: string;
  let otherSocietyId: string;
  let systemRoleId: string;
  let admin: { id: string; cookie: string };
  let siteBefore: unknown;
  const server = () => app.getHttpServer();
  const onDisk = (key: string) => existsSync(join(mediaDir, ...key.split('/')));

  async function makeRole(permissions: string[]) {
    const role = await prisma.roles.create({ data: { society_id: societyId, name: `${MARK}-${randomUUID()}` } });
    const rows = await prisma.permissions.findMany();
    await prisma.role_permissions.createMany({
      data: permissions.map((name) => ({
        role_id: role.id,
        permission_id: rows.find((p) => `${p.module}:${p.action}` === name)!.id,
      })),
    });
    return role.id;
  }

  async function makeUser(roleIds: string[]) {
    const phone = randomPhone();
    const person = await prisma.persons.create({ data: { society_id: societyId, full_name: `পরীক্ষা ${MARK}`, phone } });
    const user = await prisma.users.create({ data: { society_id: societyId, person_id: person.id, phone, status: 'active' } });
    for (const role_id of roleIds) await prisma.user_roles.create({ data: { user_id: user.id, role_id } });
    const token = await app.get(TokensService).signAccess({ userId: user.id, societyId, sessionId: randomUUID() });
    return { id: user.id, cookie: `${AUTH_COOKIES.access}=${token}; ${AUTH_COOKIES.csrf}=${CSRF}` };
  }

  const userWith = async (...permissions: string[]) => makeUser([await makeRole(permissions)]);

  const send = (method: 'post' | 'put' | 'patch' | 'delete', url: string, cookie = admin.cookie) =>
    request(server())[method](url).set('Cookie', cookie).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const get = (url: string, cookie = admin.cookie) => request(server()).get(url).set('Cookie', cookie);
  const upload = (url: string, file: Buffer, cookie = admin.cookie, name = 'photo.png') =>
    send('post', url, cookie).attach('file', file, name);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    mediaDir = app.get<Env>(ENV).MEDIA_DIR;
    societyId = (await prisma.societies.findUniqueOrThrow({ where: { slug: 'sector57' } })).id;
    otherSocietyId = (await prisma.societies.create({ data: { name_bn: `অন্য ${MARK}`, slug: MARK } })).id;
    systemRoleId = (await prisma.roles.findFirstOrThrow({ where: { society_id: societyId, is_system: true } })).id;
    admin = await makeUser([systemRoleId]);
    siteBefore = (await prisma.site_pages.findUnique({ where: { society_id_slug: { society_id: societyId, slug: 'site' } } }))
      ?.content;
  });

  afterAll(async () => {
    if (prisma) {
      if (siteBefore !== undefined) {
        await prisma.site_pages.update({
          where: { society_id_slug: { society_id: societyId, slug: 'site' } },
          data: { content: siteBefore as object },
        });
      }
      const persons = await prisma.persons.findMany({
        where: { OR: [{ full_name: { contains: MARK } }, { society_id: otherSocietyId }] },
        select: { id: true },
      });
      const personIds = persons.map((p) => p.id);
      const users = await prisma.users.findMany({ where: { person_id: { in: personIds } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      await prisma.audit_logs.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.notices.deleteMany({ where: { title_bn: { contains: MARK } } });
      await prisma.committee_members.deleteMany({ where: { person_id: { in: personIds } } });
      await prisma.gallery_albums.deleteMany({ where: { title_bn: { contains: MARK } } });
      await prisma.user_roles.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.roles.deleteMany({ where: { name: { startsWith: MARK } } });
      await prisma.users.deleteMany({ where: { id: { in: userIds } } });
      await prisma.persons.deleteMany({ where: { id: { in: personIds } } });
      if (otherSocietyId) await prisma.societies.deleteMany({ where: { id: otherSocietyId } });
    }
    await app?.close();
  });

  describe('notices', () => {
    const input = (overrides: Record<string, unknown> = {}) => ({
      titleBn: `নোটিশ ${MARK}`,
      titleEn: null,
      bodyBn: 'প্রথম লাইন\r\nদ্বিতীয় লাইন',
      bodyEn: '',
      category: 'maintenance',
      isPublic: true,
      publishAt: isoIn(2),
      ...overrides,
    });

    it('keeps a scheduled notice off the website until its time, and audits every change', async () => {
      const created = noticeAdminSchema.parse((await send('post', '/notices').send(input()).expect(201)).body);
      expect(created).toMatchObject({ status: 'scheduled', bodyBn: 'প্রথম লাইন\nদ্বিতীয় লাইন', bodyEn: null });
      await request(server()).get(`/public/notices/${created.id}`).expect(404);

      const published = await send('put', `/notices/${created.id}`).send(input({ publishAt: isoIn(-1) })).expect(200);
      expect(published.body.status).toBe('published');
      await request(server()).get(`/public/notices/${created.id}`).expect(200);

      const list = noticeAdminListSchema.parse(
        (await get(`/notices?status=published&q=${encodeURIComponent(MARK)}`).expect(200)).body,
      );
      expect(list.items.map((n) => n.id)).toContain(created.id);

      await send('delete', `/notices/${created.id}`).expect(204);
      await get(`/notices/${created.id}`).expect(404);
      const actions = await prisma.audit_logs.findMany({
        where: { entity_id: created.id, entity_type: 'notice' },
        orderBy: { created_at: 'asc' },
      });
      expect(actions.map((row) => row.action)).toEqual(['create', 'update', 'delete']);
      expect(actions[0]!.user_id).toBe(admin.id);
    });

    it('never shows an internal notice on the website', async () => {
      const created = (await send('post', '/notices').send(input({ isPublic: false, publishAt: isoIn(-1) })).expect(201)).body;
      expect(created.status).toBe('internal');
      await request(server()).get(`/public/notices/${created.id}`).expect(404);
    });

    it('rejects an empty title', async () => {
      const res = await send('post', '/notices').send(input({ titleBn: '   ' })).expect(400);
      expect(res.body.code).toBe('validation_failed');
    });

    it('checks the permission of each action', async () => {
      const viewer = await userWith('notices:view');
      await get('/notices', viewer.cookie).expect(200);
      await send('post', '/notices', viewer.cookie).send(input()).expect(403);
      const outsider = await userWith('gallery:view');
      await get('/notices', outsider.cookie).expect(403);
    });

    it("answers 404 for another society's notice", async () => {
      const foreign = await prisma.notices.create({
        data: { society_id: otherSocietyId, title_bn: `বিদেশি ${MARK}`, body_bn: 'x', is_public: true },
      });
      await get(`/notices/${foreign.id}`).expect(404);
      await send('put', `/notices/${foreign.id}`).send(input()).expect(404);
      await send('delete', `/notices/${foreign.id}`).expect(404);
      expect(await prisma.notices.count({ where: { id: foreign.id } })).toBe(1);
    });
  });

  describe('site pages', () => {
    const site = (address: string) => ({
      content: { bn: { address, officeHours: 'সকাল ৯টা - বিকাল ৫টা', phone: '01700-000000' } },
    });

    it('saves the content NFC-normalised and the public page shows it', async () => {
      const decomposed = `রোড ${MARK} য়`;
      const saved = sitePageAdminSchema.parse((await send('put', '/site-pages/site').send(site(decomposed)).expect(200)).body);
      const address = (saved.content as { bn: { address: string } }).bn.address;
      expect(address).toBe(decomposed.normalize('NFC').trim());
      const pub = await request(server()).get('/public/pages/site').expect(200);
      expect(pub.body.content.bn.address).toBe(address);
      const audit = await prisma.audit_logs.findFirstOrThrow({
        where: { entity_type: 'site_page', user_id: admin.id },
        orderBy: { created_at: 'desc' },
      });
      expect(audit.after_data).toMatchObject({ slug: 'site' });
    });

    it('rejects content that does not match the page, naming the field', async () => {
      const res = await send('put', '/site-pages/site')
        .send({ content: { bn: { address: '', officeHours: 'x', phone: 'not a phone' } } })
        .expect(400);
      expect(res.body.code).toBe('validation_failed');
      expect(res.body.issues.map((issue: { path: string }) => issue.path)).toEqual(
        expect.arrayContaining(['content.bn.address', 'content.bn.phone']),
      );
    });

    it('only edits the known pages, with site.edit', async () => {
      await send('put', '/site-pages/about').send(site('x')).expect(400);
      const viewer = await userWith('site:view');
      await get('/site-pages/home', viewer.cookie).expect(200);
      await send('put', '/site-pages/site', viewer.cookie).send(site('x')).expect(403);
    });
  });

  describe('committee', () => {
    const seat = (overrides: Record<string, unknown> = {}) => ({
      nameBn: `সদস্য ${MARK}`,
      nameEn: 'Member',
      phone: null,
      position: 'treasurer',
      sortOrder: 3,
      termStart: dateIn(-30),
      termEnd: dateIn(300),
      ...overrides,
    });

    it('adds a seat that the public committee shows, and edits it', async () => {
      const created = committeeSeatSchema.parse((await send('post', '/committee/members').send(seat()).expect(201)).body);
      const pub = await request(server()).get('/public/committee').expect(200);
      expect(pub.body.members.map((m: { id: string }) => m.id)).toContain(created.id);

      const updated = await send('put', `/committee/members/${created.id}`)
        .send({ ...seat({ nameBn: `নতুন নাম ${MARK}`, position: 'সম্মানিত উপদেষ্টা' }), phone: undefined })
        .expect(200);
      expect(updated.body).toMatchObject({ nameBn: `নতুন নাম ${MARK}`, position: 'সম্মানিত উপদেষ্টা' });
      const list = committeeSeatListSchema.parse((await get('/committee/members').expect(200)).body);
      expect(list.items.some((s) => s.id === created.id)).toBe(true);
    });

    it('reuses the person with the same phone and keeps their names', async () => {
      const phone = randomPhone();
      const person = await prisma.persons.create({ data: { society_id: societyId, full_name: `আগের ${MARK}`, phone } });
      const created = (await send('post', '/committee/members').send(seat({ phone })).expect(201)).body;
      expect(created).toMatchObject({ personId: person.id, nameBn: `আগের ${MARK}` });
    });

    it('rejects a term that ends before it starts', async () => {
      const res = await send('post', '/committee/members')
        .send(seat({ termStart: dateIn(0), termEnd: dateIn(-5) }))
        .expect(400);
      expect(res.body.issues[0]).toMatchObject({ path: 'termEnd', message: 'term_end_before_start' });
    });

    it('stores a portrait, replaces it and deletes the old files', async () => {
      const created = (await send('post', '/committee/members').send(seat()).expect(201)).body;
      await upload(`/committee/members/${created.id}/photo`, await png()).expect(200);
      const first = (await prisma.persons.findUniqueOrThrow({ where: { id: created.personId } })).photo_url!;
      expect(first).toMatch(new RegExp(`^${societyId}/people/[0-9a-f-]{36}\\.webp$`));
      expect(onDisk(first) && onDisk(first.replace('.webp', '.thumb.webp'))).toBe(true);

      await upload(`/committee/members/${created.id}/photo`, await png(100, 100)).expect(200);
      const second = (await prisma.persons.findUniqueOrThrow({ where: { id: created.personId } })).photo_url!;
      expect(second).not.toBe(first);
      expect(onDisk(first) || onDisk(first.replace('.webp', '.thumb.webp'))).toBe(false);

      await send('delete', `/committee/members/${created.id}/photo`).expect(200);
      expect((await prisma.persons.findUniqueOrThrow({ where: { id: created.personId } })).photo_url).toBeNull();
      expect(onDisk(second)).toBe(false);
    });

    it('refuses files that are not photos, and requests without one', async () => {
      const created = (await send('post', '/committee/members').send(seat()).expect(201)).body;
      const fake = await upload(`/committee/members/${created.id}/photo`, Buffer.from('<svg/>'), admin.cookie, 'x.png').expect(415);
      expect(fake.body.code).toBe('unsupported_image');
      const none = await send('post', `/committee/members/${created.id}/photo`).expect(400);
      expect(none.body.code).toBe('file_required');
      await upload(`/committee/members/${created.id}/photo`, Buffer.alloc(11 * 1024 * 1024, 1)).expect(413);
    });

    it("removes a seat but keeps the person, and hides another society's seats", async () => {
      const created = (await send('post', '/committee/members').send(seat()).expect(201)).body;
      await send('delete', `/committee/members/${created.id}`).expect(204);
      expect(await prisma.persons.count({ where: { id: created.personId } })).toBe(1);

      const foreignPerson = await prisma.persons.create({ data: { society_id: otherSocietyId, full_name: `বিদেশি ${MARK}` } });
      const foreign = await prisma.committee_members.create({
        data: { society_id: otherSocietyId, person_id: foreignPerson.id, position: 'president', term_start: new Date() },
      });
      await get(`/committee/members/${foreign.id}`).expect(404);
      await send('put', `/committee/members/${foreign.id}`).send(seat()).expect(404);
      await upload(`/committee/members/${foreign.id}/photo`, await png()).expect(404);
    });

    it('needs committee.edit to upload, checked before the file is read', async () => {
      const created = (await send('post', '/committee/members').send(seat()).expect(201)).body;
      const viewer = await userWith('committee:view');
      await upload(`/committee/members/${created.id}/photo`, await png(), viewer.cookie).expect(403);
    });
  });

  describe('gallery', () => {
    const album = (overrides: Record<string, unknown> = {}) => ({
      titleBn: `অ্যালবাম ${MARK}`,
      titleEn: 'Album',
      eventDate: dateIn(-3),
      isPublished: false,
      ...overrides,
    });

    it('builds a draft album, publishes it and deletes it with its files', async () => {
      const created = albumAdminSchema.parse((await send('post', '/gallery/albums').send(album()).expect(201)).body);
      await request(server()).get(`/public/gallery/${created.id}`).expect(404);

      const first = photoAdminSchema.parse(
        (
          await send('post', `/gallery/albums/${created.id}/photos`)
            .field('captionBn', ' প্রথম ছবি ')
            .attach('file', await png(), 'one.png')
            .expect(201)
        ).body,
      );
      expect(first.captionBn).toBe('প্রথম ছবি');
      const second = (await upload(`/gallery/albums/${created.id}/photos`, await png(90, 60)).expect(201)).body;

      const reordered = albumAdminSchema.parse(
        (await send('put', `/gallery/albums/${created.id}/photo-order`).send({ photoIds: [second.id, first.id] }).expect(200))
          .body,
      );
      expect(reordered.photos.map((p) => p.id)).toEqual([second.id, first.id]);
      await send('put', `/gallery/albums/${created.id}/photo-order`).send({ photoIds: [second.id] }).expect(400);

      await send('patch', `/gallery/photos/${second.id}`).send({ captionBn: 'কভার', captionEn: '' }).expect(200);
      await send('put', `/gallery/albums/${created.id}`).send(album({ isPublished: true })).expect(200);
      const pub = await request(server()).get(`/public/gallery/${created.id}`).expect(200);
      expect(pub.body.photos.map((p: { id: string }) => p.id)).toEqual([second.id, first.id]);
      expect(pub.body.photos[0].captionBn).toBe('কভার');

      const list = albumAdminListSchema.parse((await get('/gallery/albums?pageSize=100').expect(200)).body);
      expect(list.items.find((a) => a.id === created.id)).toMatchObject({ photoCount: 2, isPublished: true });

      const keys = (await prisma.gallery_photos.findMany({ where: { album_id: created.id } })).map((p) => p.file_url);
      expect(keys.every((key) => key.startsWith(`${societyId}/gallery/`) && onDisk(key))).toBe(true);

      await send('delete', `/gallery/photos/${first.id}`).expect(204);
      const firstKey = keys.find((key) => !onDisk(key));
      expect(firstKey).toBeDefined();

      await send('delete', `/gallery/albums/${created.id}`).expect(204);
      expect(keys.some((key) => onDisk(key) || onDisk(key.replace('.webp', '.thumb.webp')))).toBe(false);
      expect(await prisma.gallery_photos.count({ where: { album_id: created.id } })).toBe(0);
      const actions = await prisma.audit_logs.findMany({ where: { entity_id: created.id }, orderBy: { created_at: 'asc' } });
      expect(actions.map((row) => row.action)).toEqual(['create', 'reorder', 'update', 'delete']);
    });

    it("answers 404 for another society's albums and photos", async () => {
      const foreign = await prisma.gallery_albums.create({ data: { society_id: otherSocietyId, title_bn: `বিদেশি ${MARK}` } });
      const photo = await prisma.gallery_photos.create({ data: { album_id: foreign.id, file_url: 'x/y.webp' } });
      await get(`/gallery/albums/${foreign.id}`).expect(404);
      await upload(`/gallery/albums/${foreign.id}/photos`, await png()).expect(404);
      await send('patch', `/gallery/photos/${photo.id}`).send({ captionBn: 'x' }).expect(404);
      await send('delete', `/gallery/photos/${photo.id}`).expect(404);
      await send('delete', `/gallery/albums/${foreign.id}`).expect(404);
      expect(await prisma.gallery_photos.count({ where: { id: photo.id } })).toBe(1);
      await prisma.gallery_albums.delete({ where: { id: foreign.id } });
    });

    it('needs gallery.create to upload and gallery.delete to remove', async () => {
      const created = (await send('post', '/gallery/albums').send(album()).expect(201)).body;
      const editor = await userWith('gallery:view', 'gallery:edit');
      await upload(`/gallery/albums/${created.id}/photos`, await png(), editor.cookie).expect(403);
      await send('put', `/gallery/albums/${created.id}`, editor.cookie).send(album({ titleBn: `বদল ${MARK}` })).expect(200);
      await send('delete', `/gallery/albums/${created.id}`, editor.cookie).expect(403);
    });
  });
});
