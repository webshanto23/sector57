import { donationCreateSchema, donationListQuery, donorLookupQuery } from './donations.js';

const fundId = '3f0e7a52-9a0c-4a5e-9a52-7b2f8d1c0a01';

describe('donationCreateSchema', () => {
  it('takes Bangla digits and a ৳ sign, and stores the amount canonically', () => {
    const parsed = donationCreateSchema.parse({ donor: { kind: 'anonymous' }, amount: '৳১,০০০.৫', purpose: '  মসজিদ   সংস্কার ' });
    expect(parsed.amount).toBe('1000.50');
    expect(parsed.purpose).toBe('মসজিদ সংস্কার');
    expect(parsed.fundId).toBeUndefined();
  });

  it('makes a blank purpose and note null', () => {
    const parsed = donationCreateSchema.parse({ donor: { kind: 'anonymous' }, amount: '50', purpose: '  ', note: '' });
    expect(parsed.purpose).toBeNull();
    expect(parsed.note).toBeNull();
  });

  it('normalises a new donor to NFC and checks the phone', () => {
    const decomposed = 'রহিম'.normalize('NFD');
    const parsed = donationCreateSchema.parse({ donor: { kind: 'new', fullName: decomposed, phone: '০১৭১১২২৩৩৪৪' }, amount: '100', fundId });
    expect(parsed.donor).toEqual({ kind: 'new', fullName: 'রহিম'.normalize('NFC'), fullNameEn: null, phone: '01711223344' });
    expect(donationCreateSchema.safeParse({ donor: { kind: 'new', fullName: 'Rahim', phone: '12345' }, amount: '100' }).success).toBe(false);
  });

  it('refuses zero, negative and three-decimal amounts, and an unnamed new donor', () => {
    for (const amount of ['0', '-5', '10.005']) {
      expect(donationCreateSchema.safeParse({ donor: { kind: 'anonymous' }, amount }).success).toBe(false);
    }
    expect(donationCreateSchema.safeParse({ donor: { kind: 'new', fullName: ' ' }, amount: '10' }).success).toBe(false);
    expect(donationCreateSchema.safeParse({ donor: { kind: 'person' }, amount: '10' }).success).toBe(false);
  });
});

describe('donation queries', () => {
  it('needs at least two characters to look up a donor', () => {
    expect(donorLookupQuery.safeParse({ q: 'র' }).success).toBe(false);
    expect(donorLookupQuery.parse({ q: ' রহ ' }).q).toBe('রহ');
  });

  it('cleans the purpose filter', () => {
    expect(donationListQuery.parse({ purpose: ' ঈদ  উপহার ' }).purpose).toBe('ঈদ উপহার');
    expect(donationListQuery.safeParse({ status: 'deleted' }).success).toBe(false);
  });
});
