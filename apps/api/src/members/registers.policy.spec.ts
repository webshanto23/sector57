import { feeOf, holdingsOf, membershipIdTerm, placesOf, type OwnedRow } from './registers.policy.js';

const row = (location: string, level: string, depth: number): OwnedRow => ({
  party_id: 'p',
  location_id: location,
  name: location,
  path: `/${location}/`,
  is_unit: depth === 6,
  level_id: level,
  level_bn: `${level}-bn`,
  level_en: null,
  depth,
});

describe('holdingsOf', () => {
  it('counts places per level, top level first', () => {
    expect(holdingsOf([row('f1', 'flat', 6), row('p1', 'plot', 4), row('f2', 'flat', 6)])).toEqual([
      { levelId: 'plot', nameBn: 'plot-bn', nameEn: null, count: 1 },
      { levelId: 'flat', nameBn: 'flat-bn', nameEn: null, count: 2 },
    ]);
  });

  it('counts a place owned through two rows once, and nothing as empty', () => {
    expect(holdingsOf([row('f1', 'flat', 6), row('f1', 'flat', 6)])).toEqual([{ levelId: 'flat', nameBn: 'flat-bn', nameEn: null, count: 1 }]);
    expect(holdingsOf([])).toEqual([]);
  });
});

describe('placesOf', () => {
  it('keeps the first row of each place, in order', () => {
    expect(placesOf([row('a', 'flat', 6), row('b', 'plot', 4), row('a', 'flat', 6)]).map((place) => place.location_id)).toEqual(['a', 'b']);
  });
});

describe('feeOf', () => {
  const bill = '3f0e7a52-9a0c-4a5e-9a52-7b2f8d1c0a11';

  it('is not billed before any bill, paid once none is open, unpaid while one is', () => {
    expect(feeOf({ fee_bills: 0, fee_open: 0, fee_owed: null, fee_open_bill: null })).toEqual({ state: 'not_billed', owed: null, openBillId: null });
    expect(feeOf({ fee_bills: 2, fee_open: 0, fee_owed: null, fee_open_bill: null })).toEqual({ state: 'paid', owed: null, openBillId: null });
    expect(feeOf({ fee_bills: 2, fee_open: 1, fee_owed: '500', fee_open_bill: bill })).toEqual({ state: 'unpaid', owed: '500', openBillId: bill });
  });
});

describe('membershipIdTerm', () => {
  it('reads a full code, a bare number and Bangla digits', () => {
    expect(membershipIdTerm(' s15-000123 ')).toEqual({ code: 'S15-000123', number: null });
    expect(membershipIdTerm('123')).toEqual({ code: '123', number: 123 });
    expect(membershipIdTerm('০০১২৩')).toEqual({ code: '00123', number: 123 });
    expect(membershipIdTerm('রহিম')).toEqual({ code: 'রহিম', number: null });
  });
});
