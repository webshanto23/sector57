import type { Env } from '../config/env.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { CommitteeService } from './committee.service.js';

const SOCIETY = '00000000-0000-4000-8000-000000000001';

const member = (position: string, termEnd: string | null, photo: string | null = null) => ({
  id: `00000000-0000-4000-8000-0000000000${position.length.toString().padStart(2, '0')}`,
  position,
  term_start: new Date('2025-01-01T00:00:00Z'),
  term_end: termEnd ? new Date(`${termEnd}T00:00:00Z`) : null,
  persons: { full_name: 'মোঃ রফিকুল ইসলাম', full_name_en: 'Md. Rafiqul Islam', photo_url: photo },
});

function make(rows: ReturnType<typeof member>[], media?: string) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const prisma = { committee_members: { findMany } } as unknown as PrismaService;
  return { service: new CommitteeService(prisma, { MEDIA_BASE_URL: media } as Env), findMany };
}

describe('CommitteeService', () => {
  it('queries only current members of the society whose person is in the same society', async () => {
    const { service, findMany } = make([]);
    await service.current(SOCIETY);
    const { where, select } = findMany.mock.calls[0]![0];
    expect(where).toMatchObject({
      society_id: SOCIETY,
      term_start: { lte: expect.any(Date) },
      OR: [{ term_end: null }, { term_end: { gte: expect.any(Date) } }],
      persons: { society_id: SOCIETY },
    });
    // Only public person fields are ever read.
    expect(select.persons.select).toEqual({ full_name: true, full_name_en: true, photo_url: true });
  });

  it('maps members and resolves photos against the media base URL', async () => {
    const { service } = make([member('president', '2027-12-31', 'people/p.jpg')], 'https://cdn.example.com');
    const result = await service.current(SOCIETY);
    expect(result.members[0]).toEqual({
      id: member('president', null).id,
      nameBn: 'মোঃ রফিকুল ইসলাম',
      nameEn: 'Md. Rafiqul Islam',
      position: 'president',
      photoUrl: 'https://cdn.example.com/people/p.jpg',
    });
  });

  it('reports the term span, open-ended when any term has no end', async () => {
    const closed = await make([member('president', '2027-12-31'), member('treasurer', '2026-12-31')]).service.current(SOCIETY);
    expect(closed).toMatchObject({ termStart: '2025-01-01', termEnd: '2027-12-31' });

    const open = await make([member('president', '2027-12-31'), member('treasurer', null)]).service.current(SOCIETY);
    expect(open.termEnd).toBeNull();

    const empty = await make([]).service.current(SOCIETY);
    expect(empty).toEqual({ termStart: null, termEnd: null, members: [] });
  });
});
