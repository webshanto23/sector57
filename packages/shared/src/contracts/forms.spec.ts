import { describe, expect, it } from 'vitest';
import { bnDigits } from '../format.js';
import { formApproveSchema, formRejectSchema, HOUSEHOLD_RELATIONS, MAX_HOUSEHOLD, membershipFormSchema, renterFormSchema } from './forms.js';
import { OCCUPANT_RELATIONS } from './members.js';

const place = '0b6f2c1e-1111-4222-8333-444455556666';

const membership = (applicant: Record<string, unknown> = {}) => ({
  applicant: { fullName: 'আয়েশা সিদ্দিকা', phone: '01712345678', nid: '1993261455', ...applicant },
  locationId: place,
  livesHere: true,
});

const renter = (extra: Record<string, unknown> = {}) => ({
  renter: { fullName: 'রফিক', phone: '01812345678' },
  renterType: 'family',
  unitId: place,
  moveInDate: '2026-11-01',
  owner: { name: 'করিম' },
  ...extra,
});

describe('membershipFormSchema', () => {
  it('cleans the answers: NFC text, phone and NID in Bangla digits with separators, blanks as null', () => {
    const parsed = membershipFormSchema.parse(
      membership({ fullName: '  José  ', phone: bnDigits('+88 01712-345678'), nid: bnDigits('1993 2614 5520 1'), fullNameEn: ' ', email: '' }),
    );
    expect(parsed.applicant).toEqual({ fullName: 'José', fullNameEn: null, phone: '01712345678', email: null, nid: '1993261455201' });
  });

  it('requires the NID, a valid phone and a place', () => {
    const issues = (input: unknown) => membershipFormSchema.safeParse(input).error?.issues.map((issue) => [issue.path.join('.'), issue.message]);
    expect(issues(membership({ nid: '' }))).toEqual([['applicant.nid', 'required']]);
    expect(issues(membership({ nid: '123' }))).toEqual([['applicant.nid', 'invalid_nid']]);
    expect(issues(membership({ phone: '' }))).toEqual([['applicant.phone', 'invalid_phone']]);
    expect(issues({ ...membership(), locationId: '' })?.[0]?.[0]).toBe('locationId');
  });
});

describe('renterFormSchema', () => {
  it('takes a renter without NID or household, and an owner without a phone', () => {
    const parsed = renterFormSchema.parse(renter());
    expect(parsed).toMatchObject({ renter: { nid: null }, household: [], owner: { name: 'করিম', phone: null }, occupation: null });
  });

  it('only offers family and bachelor, and never "head" in the household (the renter is the head)', () => {
    expect(renterFormSchema.safeParse(renter({ renterType: 'shop' })).success).toBe(false);
    expect(renterFormSchema.safeParse(renter({ household: [{ fullName: 'ক', relation: 'head' }] })).success).toBe(false);
    expect([...HOUSEHOLD_RELATIONS, 'head'].sort()).toEqual([...OCCUPANT_RELATIONS].sort());
  });

  it(`lists at most ${MAX_HOUSEHOLD} others`, () => {
    const many = Array.from({ length: MAX_HOUSEHOLD + 1 }, () => ({ fullName: 'ক', relation: 'child' }));
    expect(renterFormSchema.safeParse(renter({ household: many })).success).toBe(false);
    expect(renterFormSchema.safeParse(renter({ household: many.slice(1) })).success).toBe(true);
  });
});

describe('review inputs', () => {
  it('approves with defaults and reads a share and rent in Bangla digits', () => {
    expect(formApproveSchema.parse({})).toEqual({ note: null, addOwnership: false, sharePercent: '100', monthlyRent: null });
    expect(formApproveSchema.parse({ sharePercent: '৫০', monthlyRent: '১৫,০০০' })).toMatchObject({ sharePercent: '50', monthlyRent: '15000' });
  });

  it('needs a reason to reject', () => {
    expect(formRejectSchema.safeParse({ note: '  ' }).success).toBe(false);
    expect(formRejectSchema.parse({ note: ' ভুল ফ্ল্যাট ' })).toEqual({ note: 'ভুল ফ্ল্যাট' });
  });
});
