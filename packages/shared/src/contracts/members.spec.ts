import {
  endsBeforeStart,
  formatMembershipCode,
  membershipSettingsInputSchema,
  nextMemberNumber,
  MAX_BULK_MEMBERS,
  memberBulkSchema,
  memberCreateSchema,
  nidSchema,
  occupantCreateSchema,
  optionalMoney,
  ownershipTransferSchema,
  partyInputSchema,
  personInputSchema,
  shareHundredths,
  sharePercentSchema,
  tenancyCreateSchema,
  toRelation,
} from './members.js';

const uuid = '3f0e7a52-9a0c-4a5e-9a52-7b2f8d1c0a11';

describe('members contracts', () => {
  it('reads a national ID in Bangla or ASCII digits, with spaces or dashes', () => {
    expect(nidSchema.parse('১২৩৪ ৫৬৭-৮৯০')).toBe('1234567890');
    expect(nidSchema.parse('1234567890123')).toBe('1234567890123');
    expect(nidSchema.parse('')).toBeNull();
    expect(nidSchema.parse(undefined)).toBeNull();
    expect(nidSchema.safeParse('12345').success).toBe(false);
    expect(nidSchema.safeParse('12345678901').success).toBe(false);
  });

  it('cleans a typed person: NFC names, blank fields null, phone in local form', () => {
    const person = personInputSchema.parse({
      fullName: '  রাশেদ হোসেন ',
      fullNameEn: '',
      phone: '+88 ০১৭১১-২২৩৩৪৪',
      email: '',
      nid: '',
      dateOfBirth: '',
    });
    expect(person).toEqual({
      fullName: 'রাশেদ হোসেন',
      fullNameEn: null,
      phone: '01711223344',
      email: null,
      nid: null,
      dateOfBirth: null,
      gender: null,
    });
    expect(personInputSchema.safeParse({ fullName: ' ' }).success).toBe(false);
    expect(personInputSchema.safeParse({ fullName: 'x', phone: '12345' }).success).toBe(false);
  });

  it('parses shares above 0 and up to 100, and adds them exactly', () => {
    expect(sharePercentSchema.parse('৩৩.৩৪')).toBe('33.34');
    expect(sharePercentSchema.parse('50')).toBe('50');
    for (const bad of ['0', '100.01', '-5', '12.345', 'x']) expect(sharePercentSchema.safeParse(bad).success).toBe(false);
    expect(shareHundredths('33.3') + shareHundredths('33.34') + shareHundredths('33.36')).toBe(10000);
  });

  it('refuses a transfer whose shares add up to more than 100%', () => {
    const owner = { kind: 'person', person: { fullName: 'ক' } };
    const base = { locationId: uuid, date: '2026-10-01' };
    expect(ownershipTransferSchema.safeParse({ ...base, owners: [{ owner, sharePercent: '50' }, { owner, sharePercent: '50' }] }).success).toBe(true);
    const over = ownershipTransferSchema.safeParse({ ...base, owners: [{ owner, sharePercent: '60' }, { owner, sharePercent: '50' }] });
    expect(over.error?.issues[0]?.message).toBe('shares_over_100');
    expect(ownershipTransferSchema.safeParse({ ...base, owners: [] }).success).toBe(false);
  });

  it('takes rent as taka with Bangla digits and commas', () => {
    expect(optionalMoney.parse('২৫,০০০')).toBe('25000');
    expect(optionalMoney.parse('')).toBeNull();
    expect(optionalMoney.safeParse('12.345').success).toBe(false);
    const tenancy = tenancyCreateSchema.parse({
      unitId: uuid,
      renter: { kind: 'organisation', organisation: { name: 'নূর ট্রেডার্স' } },
      renterType: 'warehouse',
      startDate: '2026-01-01',
    });
    expect(tenancy).toMatchObject({ status: 'active', policeFormSubmitted: false, monthlyRent: null });
  });

  it('knows a person from an organisation', () => {
    expect(partyInputSchema.safeParse({ kind: 'person', organisation: { name: 'x' } }).success).toBe(false);
    expect(partyInputSchema.parse({ kind: 'organisation', organisation: { name: 'x', tradeLicence: '' } })).toEqual({
      kind: 'organisation',
      organisation: { name: 'x', tradeLicence: null, contact: null },
    });
  });

  it('takes a resident as a typed person or an id, not both', () => {
    const base = { unitId: uuid, tenancyId: null, relation: 'head', startDate: '2026-01-01' };
    expect(occupantCreateSchema.safeParse({ ...base, personId: uuid }).success).toBe(true);
    expect(occupantCreateSchema.safeParse({ ...base, person: { fullName: 'ক' } }).success).toBe(true);
    expect(occupantCreateSchema.safeParse(base).success).toBe(false);
    expect(occupantCreateSchema.safeParse({ ...base, personId: uuid, person: { fullName: 'ক' } }).success).toBe(false);
  });

  it('compares dates and falls back for unknown stored keys', () => {
    expect(endsBeforeStart('2026-01-02', '2026-01-01')).toBe(true);
    expect(endsBeforeStart('2026-01-01', '2026-01-01')).toBe(false);
    expect(endsBeforeStart('2026-01-01', null)).toBe(false);
    expect(toRelation('cousin')).toBe('other');
  });
});

describe('membership contracts', () => {
  const id = '3f0e7a52-9a0c-4a5e-9a52-7b2f8d1c0a11';

  it('takes either new details or someone on file, never both or neither', () => {
    expect(memberCreateSchema.parse({ personId: id, joinedOn: '' })).toMatchObject({ person: null, personId: id, locationId: null, joinedOn: null });
    expect(memberCreateSchema.parse({ person: { fullName: 'রহিম' } }).person?.fullName).toBe('রহিম');
    expect(memberCreateSchema.safeParse({ person: { fullName: 'রহিম' }, personId: id }).success).toBe(false);
    expect(memberCreateSchema.safeParse({}).success).toBe(false);
    expect(memberCreateSchema.parse({ organisationId: id })).toMatchObject({ person: null, personId: null, organisationId: id });
    expect(memberCreateSchema.parse({ organisation: { name: 'নূর' } }).organisation?.name).toBe('নূর');
    expect(memberCreateSchema.safeParse({ organisationId: id, personId: id }).success).toBe(false);
  });

  it('lists each person once, up to the bulk limit', () => {
    expect(memberBulkSchema.parse({ personIds: [id] }).joinedOn).toBeNull();
    expect(memberBulkSchema.safeParse({ personIds: [] }).success).toBe(false);
    expect(memberBulkSchema.safeParse({ personIds: [id, id] }).success).toBe(false);
    const many = Array.from({ length: MAX_BULK_MEMBERS + 1 }, (_, i) => `3f0e7a52-9a0c-4a5e-9a52-${String(i).padStart(12, '0')}`);
    expect(memberBulkSchema.safeParse({ personIds: many }).success).toBe(false);
    expect(memberBulkSchema.parse({ organisationIds: [id] })).toMatchObject({ personIds: [], organisationIds: [id] });
    expect(memberBulkSchema.safeParse({ personIds: many.slice(0, 150), organisationIds: many.slice(150) }).success).toBe(false);
  });
});

describe('membership numbering', () => {
  it('pads the member number to six digits and never cuts a longer one', () => {
    expect(formatMembershipCode('S15', 42)).toBe('S15-000042');
    expect(formatMembershipCode('S15', 1234567)).toBe('S15-1234567');
  });

  it('starts at the starter and never goes back below a number in use', () => {
    expect(nextMemberNumber(1, null)).toBe(1);
    expect(nextMemberNumber(1001, null)).toBe(1001);
    expect(nextMemberNumber(1001, 7)).toBe(1001);
    expect(nextMemberNumber(1001, 1500)).toBe(1501);
  });

  it('takes the code in capitals and the starter from text', () => {
    expect(membershipSettingsInputSchema.parse({ societyCode: ' s15 ', firstMemberNo: '১০০১' })).toEqual({ societyCode: 'S15', firstMemberNo: 1001 });
    expect(membershipSettingsInputSchema.safeParse({ societyCode: 'S-15', firstMemberNo: 1 }).success).toBe(false);
    expect(membershipSettingsInputSchema.safeParse({ societyCode: 'S15', firstMemberNo: 0 }).success).toBe(false);
  });
});
