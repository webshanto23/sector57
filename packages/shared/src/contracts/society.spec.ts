import { brandingOf, defaultLogoMark, societySchema } from './society.js';

describe('societySchema', () => {
  it('drops unknown fields such as status', () => {
    const parsed = societySchema.parse({
      id: '0ccceb85-35cf-479d-9953-aeb79f0c7cb4',
      slug: 'sector57',
      nameBn: 'উত্তরা সেক্টর ১৫',
      nameEn: null,
      fiscalYearStartMonth: 7,
      mark: '১৫',
      placeBn: null,
      placeEn: null,
      status: 'active',
    });
    expect(parsed).not.toHaveProperty('status');
  });
});

describe('defaultLogoMark', () => {
  it('takes the first number in the name, in Bangla digits', () => {
    expect(defaultLogoMark('উত্তরা সেক্টর ১৫ কল্যাণ সমিতি')).toBe('১৫');
    expect(defaultLogoMark('Uttara Sector 7 Welfare Society')).toBe('৭');
  });

  it('falls back to the first letter', () => {
    expect(defaultLogoMark(' গুলশান সমিতি')).toBe('গ');
    expect(defaultLogoMark('')).toBe('');
  });
});

describe('brandingOf', () => {
  it('uses the saved branding', () => {
    expect(brandingOf({ mark: 'ক', placeBn: 'ঢাকা', placeEn: 'Dhaka' }, 'উত্তরা সেক্টর ১৫')).toEqual({ mark: 'ক', placeBn: 'ঢাকা', placeEn: 'Dhaka' });
  });

  it('works the mark out from the name when nothing valid is saved', () => {
    expect(brandingOf(undefined, 'উত্তরা সেক্টর ১৫')).toEqual({ mark: '১৫', placeBn: null, placeEn: null });
    expect(brandingOf({ mark: '' }, 'উত্তরা সেক্টর ১৫').mark).toBe('১৫');
  });
});
