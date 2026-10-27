import { developmentsContentSchema, homeContentSchema, pageSlug, pickContent, siteInfoSchema } from './site-pages.js';

const site = {
  bn: { address: 'বাড়ি ১, রোড ৩', officeHours: 'সকাল ১০টা থেকে সন্ধ্যা ৬টা', phone: '01711-000057' },
};

describe('pickContent', () => {
  it('falls back to Bangla when English is missing', () => {
    const parsed = siteInfoSchema.parse(site);
    expect(pickContent(parsed, 'en')).toBe(parsed.bn);
  });

  it('uses English when present', () => {
    const parsed = siteInfoSchema.parse({ ...site, en: { ...site.bn, address: 'House 1, Road 3' } });
    expect(pickContent(parsed, 'en').address).toBe('House 1, Road 3');
  });
});

describe('homeContentSchema', () => {
  const home = { bn: { hero: { label: 'ক', title: 'খ', lead: '' }, stats: [], events: [], emergency: [] } };

  it('keeps content saved before the hero album existed valid', () => {
    expect(homeContentSchema.parse(home).heroAlbumId).toBeUndefined();
  });

  it('accepts an album id and rejects anything else', () => {
    const id = '00000000-0000-4000-8000-000000000057';
    expect(homeContentSchema.parse({ ...home, heroAlbumId: id }).heroAlbumId).toBe(id);
    expect(homeContentSchema.safeParse({ ...home, heroAlbumId: 'album-1' }).success).toBe(false);
  });
});

describe('developmentsContentSchema', () => {
  const project = {
    titleBn: 'রোড সংস্কার',
    descriptionBn: '',
    status: 'in_progress',
    progress: 62,
    budget: '4800000',
    spent: '2970000.50',
  };

  it('accepts a project and defaults its illustration', () => {
    const parsed = developmentsContentSchema.parse({ projects: [project] });
    expect(parsed.projects[0]!.art).toBe('road');
  });

  it('rejects out-of-range progress and money written as a number', () => {
    expect(developmentsContentSchema.safeParse({ projects: [{ ...project, progress: 140 }] }).success).toBe(false);
    expect(developmentsContentSchema.safeParse({ projects: [{ ...project, budget: 4800000 }] }).success).toBe(false);
    expect(developmentsContentSchema.safeParse({ projects: [{ ...project, spent: '1.234' }] }).success).toBe(false);
  });
});

describe('pageSlug', () => {
  it('allows only lowercase slugs', () => {
    expect(pageSlug.safeParse('home').success).toBe(true);
    expect(pageSlug.safeParse('../etc').success).toBe(false);
  });
});
