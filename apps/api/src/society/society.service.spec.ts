import type { Env } from '../config/env.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { SocietyService } from './society.service.js';

const row = (status = 'active') => ({
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'sector57',
  name_bn: 'উত্তরা সেক্টর ৫৭ কল্যাণ সমিতি',
  name_en: 'Uttara Sector 57 Welfare Society',
  fiscal_year_start_month: 7,
  status,
});

function make(found: ReturnType<typeof row> | null) {
  const findUnique = vi.fn().mockResolvedValue(found);
  const prisma = { societies: { findUnique } } as unknown as PrismaService;
  const service = new SocietyService(prisma, { DEFAULT_SOCIETY_SLUG: 'sector57' } as Env);
  return { service, findUnique };
}

describe('SocietyService', () => {
  it('returns the active society and caches it', async () => {
    const { service, findUnique } = make(row());
    const first = await service.resolve('sector57');
    await service.resolve('sector57');
    expect(first).toEqual({
      id: row().id,
      slug: 'sector57',
      nameBn: row().name_bn,
      nameEn: row().name_en,
      fiscalYearStartMonth: 7,
    });
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('404s an unknown slug', async () => {
    const { service } = make(null);
    await expect(service.resolve('nowhere')).rejects.toMatchObject({ response: { code: 'society_not_found' } });
  });

  it('403s a suspended society', async () => {
    const { service } = make(row('suspended'));
    await expect(service.resolve('sector57')).rejects.toMatchObject({ response: { code: 'society_suspended' } });
  });

  it('uses the default slug for now', () => {
    const { service } = make(row());
    expect(service.slugFor({} as never)).toBe('sector57');
  });
});
