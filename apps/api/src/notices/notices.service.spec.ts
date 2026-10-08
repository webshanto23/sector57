import type { PrismaService } from '../prisma/prisma.service.js';
import { NoticesService } from './notices.service.js';

const SOCIETY = '00000000-0000-4000-8000-000000000001';

const row = (category: string | null = 'billing') => ({
  id: '00000000-0000-4000-8000-0000000000aa',
  title_bn: 'নভেম্বরের বিল',
  title_en: null,
  body_bn: 'অফিসে নগদে পরিশোধ করুন।',
  body_en: null,
  category,
  publish_at: new Date('2026-11-02T04:00:00.000Z'),
});

function make(rows: ReturnType<typeof row>[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const findFirst = vi.fn().mockResolvedValue(rows[0] ?? null);
  const count = vi.fn().mockResolvedValue(rows.length);
  const prisma = {
    notices: { findMany, findFirst, count },
    $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
  } as unknown as PrismaService;
  return { service: new NoticesService(prisma), findMany, findFirst, count };
}

describe('NoticesService', () => {
  it('lists only public, already published notices of the society', async () => {
    const { service, findMany } = make([row()]);
    const result = await service.listPublic(SOCIETY, { page: 2, pageSize: 10 });

    const args = findMany.mock.calls[0]![0];
    expect(args.where).toMatchObject({ society_id: SOCIETY, is_public: true, publish_at: { lte: expect.any(Date) } });
    expect(args).toMatchObject({ skip: 10, take: 10 });
    expect(result).toEqual({
      items: [
        {
          id: row().id,
          titleBn: row().title_bn,
          titleEn: null,
          bodyBn: row().body_bn,
          bodyEn: null,
          category: 'billing',
          publishAt: '2026-11-02T04:00:00.000Z',
        },
      ],
      total: 1,
      page: 2,
      pageSize: 10,
    });
  });

  it('treats general as also covering notices without a category', async () => {
    const { service, findMany } = make([row(null)]);
    const result = await service.listPublic(SOCIETY, { page: 1, pageSize: 20, category: 'general' });
    expect(findMany.mock.calls[0]![0].where.OR).toEqual([{ category: 'general' }, { category: null }]);
    expect(result.items[0]!.category).toBe('general');
  });

  it('scopes a single notice by society and visibility', async () => {
    const { service, findFirst } = make([row()]);
    await service.getPublic(SOCIETY, row().id);
    expect(findFirst.mock.calls[0]![0].where).toMatchObject({ id: row().id, society_id: SOCIETY, is_public: true });
  });

  it('404s a notice it cannot show', async () => {
    const { service } = make([]);
    await expect(service.getPublic(SOCIETY, row().id)).rejects.toMatchObject({
      response: { code: 'notice_not_found' },
    });
  });
});
