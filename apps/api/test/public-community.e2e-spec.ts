import { INestApplication } from '@nestjs/common';
import { albumListSchema, albumSchema, committeeSchema } from '@s57/shared';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-${Date.now()}`;
const day = (offset: number) => {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
};

// Committee and gallery: only this society's current, published, public data.
describe('Public committee and gallery API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let homeId: string;
  let otherId: string;
  const ids = { current: '', ended: '', future: '', borrowed: '', otherMember: '', published: '', draft: '', otherAlbum: '' };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    homeId = (await prisma.societies.findUniqueOrThrow({ where: { slug: 'sector57' } })).id;
    otherId = (await prisma.societies.create({ data: { slug: MARK, name_bn: 'অন্য সমিতি' } })).id;

    const person = (societyId: string, name: string) =>
      prisma.persons.create({
        data: { society_id: societyId, full_name: `${name} ${MARK}`, phone: `017${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`, nid: `NID-${MARK}-${name}` },
      });
    const seat = async (societyId: string, personId: string, start: number, end: number | null) =>
      (
        await prisma.committee_members.create({
          data: {
            society_id: societyId,
            person_id: personId,
            position: `custom ${MARK}`,
            term_start: day(start),
            term_end: end === null ? null : day(end),
          },
        })
      ).id;

    ids.current = await seat(homeId, (await person(homeId, 'বর্তমান')).id, -30, 30);
    ids.ended = await seat(homeId, (await person(homeId, 'সাবেক')).id, -400, -1);
    ids.future = await seat(homeId, (await person(homeId, 'আগামী')).id, 1, null);
    // A seat in our society pointing at another society's person must never show.
    ids.borrowed = await seat(homeId, (await person(otherId, 'ধার')).id, -30, null);
    ids.otherMember = await seat(otherId, (await person(otherId, 'অন্য')).id, -30, null);

    const album = async (societyId: string, title: string, isPublished: boolean) =>
      (
        await prisma.gallery_albums.create({
          data: {
            society_id: societyId,
            title_bn: `${title} ${MARK}`,
            is_published: isPublished,
            event_date: day(-1),
            gallery_photos: { create: [{ file_url: 'https://example.com/a.jpg', caption_bn: 'ছবি', sort_order: 0 }, { file_url: 'b.jpg', sort_order: 1 }] },
          },
        })
      ).id;
    ids.published = await album(homeId, 'প্রকাশিত', true);
    ids.draft = await album(homeId, 'খসড়া', false);
    ids.otherAlbum = await album(otherId, 'অন্যের', true);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.committee_members.deleteMany({ where: { position: `custom ${MARK}` } });
      await prisma.persons.deleteMany({ where: { full_name: { endsWith: MARK } } });
      await prisma.gallery_albums.deleteMany({ where: { title_bn: { endsWith: MARK } } });
      if (otherId) await prisma.societies.delete({ where: { id: otherId } });
    }
    await app?.close();
  });

  const server = () => app.getHttpServer();

  describe('GET /public/committee', () => {
    it("lists only today's members of this society", async () => {
      const res = await request(server()).get('/public/committee').expect(200);
      const committee = committeeSchema.parse(res.body);
      const found = committee.members.map((m) => m.id);

      expect(found).toContain(ids.current);
      for (const hidden of [ids.ended, ids.future, ids.borrowed, ids.otherMember]) expect(found).not.toContain(hidden);
    });

    it('never sends private person fields', async () => {
      const res = await request(server()).get('/public/committee').expect(200);
      const member = res.body.members.find((m: { id: string }) => m.id === ids.current);
      expect(Object.keys(member).sort()).toEqual(['id', 'nameBn', 'nameEn', 'photoUrl', 'position']);
      expect(JSON.stringify(res.body)).not.toMatch(/NID-|"phone"|"nid"/);
    });
  });

  describe('GET /public/gallery', () => {
    it('lists only published albums of this society', async () => {
      const res = await request(server()).get('/public/gallery').query({ pageSize: 100 }).expect(200);
      const list = albumListSchema.parse(res.body);
      const found = list.items.map((a) => a.id);

      expect(found).toContain(ids.published);
      expect(found).not.toContain(ids.draft);
      expect(found).not.toContain(ids.otherAlbum);
      const mine = list.items.find((a) => a.id === ids.published)!;
      expect(mine.photoCount).toBe(2);
      expect(mine.coverUrl).toBe('https://example.com/a.jpg');
    });

    it('returns a published album with its photos in order', async () => {
      const res = await request(server()).get(`/public/gallery/${ids.published}`).expect(200);
      const album = albumSchema.parse(res.body);
      expect(album.photos.map((p) => p.url)).toEqual(['https://example.com/a.jpg', null]);
      expect(album.photos[0]!.captionBn).toBe('ছবি');
    });

    it.each([
      ['an unpublished album', 'draft'],
      ["another society's album", 'otherAlbum'],
    ] as const)('404s %s', async (_label, key) => {
      const res = await request(server()).get(`/public/gallery/${ids[key]}`).expect(404);
      expect(res.body.code).toBe('album_not_found');
    });
  });
});
