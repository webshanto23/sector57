import { INestApplication } from '@nestjs/common';
import { noticeListSchema, noticeSchema, sitePageSchema } from '@s57/shared';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const DAY = 24 * 60 * 60 * 1000;
const MARK = `e2e-public-${Date.now()}`;

// The public website must only ever show this society's public, published content.
describe('Public website API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let otherSocietyId: string;
  const ids = { mine: '', other: '', private: '', future: '' };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    const home = await prisma.societies.findUniqueOrThrow({ where: { slug: 'sector57' } });
    const other = await prisma.societies.create({ data: { slug: MARK, name_bn: 'অন্য সমিতি' } });
    otherSocietyId = other.id;

    const notice = (societyId: string, title: string, extra: object = {}) =>
      prisma.notices.create({
        data: {
          society_id: societyId,
          title_bn: `${title} ${MARK}`,
          body_bn: 'বিবরণ',
          category: 'agm',
          is_public: true,
          publish_at: new Date(Date.now() - DAY),
          ...extra,
        },
      });

    ids.mine = (await notice(home.id, 'নিজের')).id;
    ids.other = (await notice(other.id, 'অন্যের')).id;
    ids.private = (await notice(home.id, 'গোপন', { is_public: false })).id;
    ids.future = (await notice(home.id, 'ভবিষ্যৎ', { publish_at: new Date(Date.now() + DAY) })).id;

    await prisma.site_pages.createMany({
      data: [
        { society_id: other.id, slug: `only-other-${MARK}`, title_bn: 'অন্য', is_published: true },
        { society_id: home.id, slug: `draft-${MARK}`, title_bn: 'খসড়া', is_published: false },
      ],
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.notices.deleteMany({ where: { title_bn: { endsWith: MARK } } });
      await prisma.site_pages.deleteMany({ where: { slug: { endsWith: MARK } } });
      if (otherSocietyId) await prisma.societies.delete({ where: { id: otherSocietyId } });
    }
    await app?.close();
  });

  const server = () => app.getHttpServer();

  describe('GET /public/notices', () => {
    it('lists only public, published notices of the current society, newest first', async () => {
      const res = await request(server()).get('/public/notices').query({ pageSize: 100 }).expect(200);
      const list = noticeListSchema.parse(res.body);
      const found = list.items.map((n) => n.id);

      expect(found).toContain(ids.mine);
      expect(found).not.toContain(ids.other);
      expect(found).not.toContain(ids.private);
      expect(found).not.toContain(ids.future);
      const times = list.items.map((n) => Date.parse(n.publishAt));
      expect(times).toEqual([...times].sort((a, b) => b - a));
    });

    it('filters by category and pages', async () => {
      const res = await request(server()).get('/public/notices').query({ category: 'agm', pageSize: 1 }).expect(200);
      const list = noticeListSchema.parse(res.body);
      expect(list.items).toHaveLength(1);
      expect(list.items[0]!.category).toBe('agm');
      expect(list.pageSize).toBe(1);
      expect(list.total).toBeGreaterThanOrEqual(1);
    });

    it('rejects an unknown category', async () => {
      const res = await request(server()).get('/public/notices').query({ category: 'party' }).expect(400);
      expect(res.body.code).toBe('validation_failed');
    });
  });

  describe('GET /public/notices/:id', () => {
    it('returns a public notice', async () => {
      const res = await request(server()).get(`/public/notices/${ids.mine}`).expect(200);
      expect(noticeSchema.parse(res.body).id).toBe(ids.mine);
    });

    it.each([
      ['another society', 'other'],
      ['a private notice', 'private'],
      ['a scheduled notice', 'future'],
    ] as const)('404s %s', async (_label, key) => {
      const res = await request(server()).get(`/public/notices/${ids[key]}`).expect(404);
      expect(res.body.code).toBe('notice_not_found');
    });

    it('400s a malformed id', async () => {
      await request(server()).get('/public/notices/not-a-uuid').expect(400);
    });
  });

  describe('GET /public/pages/:slug', () => {
    it('returns the seeded home page', async () => {
      const res = await request(server()).get('/public/pages/home').expect(200);
      const page = sitePageSchema.parse(res.body);
      expect(page.slug).toBe('home');
      expect(page.content).toHaveProperty('bn');
    });

    it("404s another society's page and a draft", async () => {
      await request(server()).get(`/public/pages/only-other-${MARK}`).expect(404);
      await request(server()).get(`/public/pages/draft-${MARK}`).expect(404);
    });

    it('400s a slug with unsafe characters', async () => {
      await request(server()).get('/public/pages/Home%20Page').expect(400);
    });
  });
});
