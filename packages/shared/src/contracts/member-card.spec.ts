import { cardSheets, cardValidTill, memberCardSettingsInputSchema } from './index.js';

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

describe('cardSheets', () => {
  it('fills sheets of nine and mirrors each row of backs', () => {
    const cards = Array.from({ length: 11 }, (_, i) => i + 1);
    const sheets = cardSheets(cards, 3, 3);
    expect(sheets).toHaveLength(2);
    expect(sheets[0]!.fronts).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(sheets[0]!.backs).toEqual([3, 2, 1, 6, 5, 4, 9, 8, 7]);
    // A short last sheet: empty places stay empty, and the backs still line up.
    expect(sheets[1]!.fronts).toEqual([10, 11, null, null, null, null, null, null, null]);
    expect(sheets[1]!.backs).toEqual([null, 11, 10, null, null, null, null, null, null]);
  });

  it('no cards, no sheets', () => {
    expect(cardSheets([], 3, 3)).toEqual([]);
  });
});
