import type { LocationLevel } from './contracts/index.js';
import { holdsFloors, insideContent, levelCountCards, locationTabs, pickLocationTab } from './location-tabs.js';

const level = (depth: number, nameEn: string, extra: Partial<LocationLevel> = {}): LocationLevel => ({
  id: `level-${depth}`,
  depth,
  nameBn: nameEn,
  nameEn,
  isUnitLevel: false,
  canOwn: false,
  locationCount: 0,
  ...extra,
});

const levels = [
  level(1, 'Sector'),
  level(2, 'Road'),
  level(3, 'Plot', { canOwn: true }),
  level(4, 'Building', { canOwn: true }),
  level(5, 'Storey'),
  level(6, 'Unit', { isUnitLevel: true, canOwn: true }),
];
const see = { canSeeOwners: true, canSeeDocuments: true };

describe('locationTabs', () => {
  it('shows owners only when the level can have owners', () => {
    expect(locationTabs({ isUnit: false, canOwn: true }, see)).toEqual(['inside', 'owners', 'documents', 'details']);
    expect(locationTabs({ isUnit: false, canOwn: false }, see)).toEqual(['inside', 'documents', 'details']);
  });

  it('hides what the caller may not see', () => {
    expect(locationTabs({ isUnit: false, canOwn: true }, { canSeeOwners: false, canSeeDocuments: false })).toEqual(['inside', 'details']);
  });

  it('has no inside tab on a unit', () => {
    expect(locationTabs({ isUnit: true, canOwn: true }, see)[0]).toBe('owners');
  });
});

describe('pickLocationTab', () => {
  const tabs = locationTabs({ isUnit: false, canOwn: false }, see);

  it('opens the named tab', () => {
    expect(pickLocationTab(tabs, 'details')).toBe('details');
  });

  it('opens the first tab for a tab this place lacks, or none', () => {
    expect(pickLocationTab(tabs, 'owners')).toBe('inside');
    expect(pickLocationTab(tabs, undefined)).toBe('inside');
    expect(pickLocationTab(tabs, ['details'])).toBe('inside');
  });
});

describe('insideContent', () => {
  const road = { depth: 2, isUnit: false };

  it('names a building over floors as floors', () => {
    expect(holdsFloors({ depth: 4, isUnit: false }, levels)).toBe(true);
    expect(insideContent({ depth: 4, isUnit: false }, [], levels)).toEqual({ kind: 'floors' });
  });

  it('follows the level of the direct children, even past an unused level', () => {
    expect(insideContent({ depth: 1, isUnit: false }, [{ levelId: 'level-3' }], levels)).toEqual({ kind: 'level', level: levels[2] });
  });

  it('uses the next level while the place is empty', () => {
    expect(insideContent(road, [], levels)).toEqual({ kind: 'level', level: levels[2] });
  });

  it('calls mixed children mixed', () => {
    expect(insideContent(road, [{ levelId: 'level-3' }, { levelId: 'level-4' }], levels)).toEqual({ kind: 'mixed' });
  });
});

describe('levelCountCards', () => {
  it('gives one card per level below, units from the place, unused levels at zero', () => {
    const cards = levelCountCards({ depth: 2, unitCount: 17 }, levels, { items: [{ levelId: 'level-3', count: 12 }] });
    expect(cards.map((card) => [card.nameEn, card.count])).toEqual([
      ['Plot', 12],
      ['Building', 0],
      ['Storey', 0],
      ['Unit', 17],
    ]);
  });

  it('has no cards at the deepest level', () => {
    expect(levelCountCards({ depth: 6, unitCount: 0 }, levels, { items: [] })).toEqual([]);
  });
});
