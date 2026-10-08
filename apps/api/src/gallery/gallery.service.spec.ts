import type { Env } from '../config/env.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { GalleryService } from './gallery.service.js';

const SOCIETY = '00000000-0000-4000-8000-000000000001';
const ALBUM = '00000000-0000-4000-8000-0000000000a1';

const album = (photos: { id?: string; file_url: string; caption_bn?: string | null; caption_en?: string | null }[]) => ({
  id: ALBUM,
  title_bn: 'পহেলা বৈশাখ',
  title_en: null,
  event_date: new Date('2026-04-14T00:00:00Z'),
  _count: { gallery_photos: photos.length },
  gallery_photos: photos,
});

function make(found: ReturnType<typeof album> | null, media?: string) {
  const findMany = vi.fn().mockResolvedValue(found ? [found] : []);
  const findFirst = vi.fn().mockResolvedValue(found);
  const count = vi.fn().mockResolvedValue(found ? 1 : 0);
  const prisma = {
    gallery_albums: { findMany, findFirst, count },
    $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
  } as unknown as PrismaService;
  return { service: new GalleryService(prisma, { MEDIA_BASE_URL: media } as Env), findMany, findFirst };
}

describe('GalleryService', () => {
  it('lists published albums of the society with count and cover', async () => {
    const { service, findMany } = make(album([{ file_url: 'gallery/cover.jpg' }]), 'https://cdn.example.com');
    const result = await service.listPublic(SOCIETY, { page: 1, pageSize: 12 });
    expect(findMany.mock.calls[0]![0].where).toEqual({ society_id: SOCIETY, is_published: true });
    expect(result.items[0]).toEqual({
      id: ALBUM,
      titleBn: 'পহেলা বৈশাখ',
      titleEn: null,
      eventDate: '2026-04-14',
      photoCount: 1,
      coverUrl: 'https://cdn.example.com/gallery/cover.jpg',
    });
  });

  it('leaves the cover empty without media storage', async () => {
    const { service } = make(album([{ file_url: 'gallery/cover.jpg' }]));
    expect((await service.listPublic(SOCIETY, { page: 1, pageSize: 12 })).items[0]!.coverUrl).toBeNull();
  });

  it('returns an album with its photos, scoped by society and publication', async () => {
    const photo = { id: '00000000-0000-4000-8000-0000000000b1', file_url: 'https://x.example/a.jpg', caption_bn: 'মঞ্চ', caption_en: null };
    const { service, findFirst } = make(album([photo]));
    const result = await service.getPublic(SOCIETY, ALBUM);
    expect(findFirst.mock.calls[0]![0].where).toEqual({ id: ALBUM, society_id: SOCIETY, is_published: true });
    expect(result.photos).toEqual([{ id: photo.id, url: 'https://x.example/a.jpg', captionBn: 'মঞ্চ', captionEn: null }]);
  });

  it('404s an album it cannot show', async () => {
    const { service } = make(null);
    await expect(service.getPublic(SOCIETY, ALBUM)).rejects.toMatchObject({ response: { code: 'album_not_found' } });
  });
});
