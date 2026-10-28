import { holdingsOf, placesOf, type OwnedRow } from './registers.policy.js';

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
