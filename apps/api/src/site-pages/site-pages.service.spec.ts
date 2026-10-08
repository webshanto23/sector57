import type { PrismaService } from '../prisma/prisma.service.js';
import { SitePagesService } from './site-pages.service.js';

const SOCIETY = '00000000-0000-4000-8000-000000000001';

function make(found: object | null) {
  const findFirst = vi.fn().mockResolvedValue(found);
  const prisma = { site_pages: { findFirst } } as unknown as PrismaService;
  return { service: new SitePagesService(prisma), findFirst };
}

const page = (content: unknown) => ({
  slug: 'home',
  title_bn: 'প্রথম পাতা',
  title_en: 'Home',
  content,
  updated_at: new Date('2026-10-08T00:00:00.000Z'),
});

describe('SitePagesService', () => {
  it('returns a published page of the society', async () => {
    const { service, findFirst } = make(page({ bn: { a: 1 } }));
    const result = await service.getPublished(SOCIETY, 'home');
    expect(findFirst.mock.calls[0]![0].where).toEqual({ society_id: SOCIETY, slug: 'home', is_published: true });
    expect(result).toEqual({
      slug: 'home',
      titleBn: 'প্রথম পাতা',
      titleEn: 'Home',
      content: { bn: { a: 1 } },
      updatedAt: '2026-10-08T00:00:00.000Z',
    });
  });

  it('turns non-object content into an empty object', async () => {
    const { service } = make(page([1, 2]));
    expect((await service.getPublished(SOCIETY, 'home')).content).toEqual({});
  });

  it('404s a missing or unpublished page', async () => {
    const { service } = make(null);
    await expect(service.getPublished(SOCIETY, 'home')).rejects.toMatchObject({
      response: { code: 'page_not_found' },
    });
  });
});
