import { cardValidTill, memberCardSettingsInputSchema } from './index.js';

describe('cardValidTill', () => {
  it('ends the day before the anniversary', () => {
    expect(cardValidTill('2026-10-29', 1)).toBe('2027-10-28');
    expect(cardValidTill('2026-01-01', 2)).toBe('2027-12-31');
  });

  it('a card printed on 29 February ends on 28 February', () => {
    expect(cardValidTill('2028-02-29', 1)).toBe('2029-02-28');
    expect(cardValidTill('2028-02-29', 4)).toBe('2032-02-28');
  });
});

describe('memberCardSettingsInputSchema', () => {
  it('drops blank lines, reads Bangla digits and blanks as null', () => {
    const parsed = memberCardSettingsInputSchema.parse({
      termsBn: ['কার্ডটি হস্তান্তরযোগ্য নয়।', '  ', ''],
      termsEn: [],
      validYears: '২',
      signatureBn: ' ',
      signatureEn: 'Secretary',
    });
    expect(parsed).toEqual({ termsBn: ['কার্ডটি হস্তান্তরযোগ্য নয়।'], termsEn: [], validYears: 2, signatureBn: null, signatureEn: 'Secretary' });
  });

  it('allows no validity, refuses too many years or lines', () => {
    expect(memberCardSettingsInputSchema.parse({ termsBn: [], termsEn: [], validYears: '', signatureBn: null, signatureEn: null }).validYears).toBeNull();
    expect(memberCardSettingsInputSchema.safeParse({ termsBn: [], termsEn: [], validYears: 11, signatureBn: null, signatureEn: null }).success).toBe(false);
    expect(memberCardSettingsInputSchema.safeParse({ termsBn: ['a', 'b', 'c', 'd', 'e'], termsEn: [], validYears: null, signatureBn: null, signatureEn: null }).success).toBe(false);
  });
});
