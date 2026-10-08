import { homeContentSchema, pageSlug, pickContent, siteInfoSchema } from './site-pages.js';

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
  it('rejects an out-of-range progress value', () => {
    const home = {
      bn: {
        hero: { label: 'ক', title: 'খ', lead: '' },
        stats: [],
        events: [],
        developments: [{ title: 'রোড', progress: 140 }],
        emergency: [],
      },
    };
    expect(homeContentSchema.safeParse(home).success).toBe(false);
  });
});

describe('pageSlug', () => {
  it('allows only lowercase slugs', () => {
    expect(pageSlug.safeParse('home').success).toBe(true);
    expect(pageSlug.safeParse('../etc').success).toBe(false);
  });
});
