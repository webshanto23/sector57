import { combinedSize, combineProblem, coveredAfter, coversAfterSeparate, separatedSize, type CombineFacts } from './combine.policy.js';

const unit = (id: string, patch: Partial<CombineFacts> = {}): CombineFacts => ({
  id,
  parentId: 's3',
  grandparentId: 'building',
  active: true,
  owners: ['person:p1:100'],
  openBills: 0,
  openTenancy: false,
  occupants: 0,
  vehicles: 0,
  ...patch,
});

describe('combineProblem', () => {
  it('allows units on one floor or on floors of one building', () => {
    expect(combineProblem(unit('a'), [unit('b')])).toBeNull();
    expect(combineProblem(unit('a'), [unit('b', { parentId: 's4' })])).toBeNull();
    expect(combineProblem(unit('a'), [unit('b'), unit('c', { parentId: 's4' })])).toBeNull();
    // Units straight under a place with no building above share their parent.
    expect(combineProblem(unit('a', { parentId: 'b', grandparentId: null }), [unit('c', { parentId: 'b', grandparentId: null })])).toBeNull();
  });

  it('refuses units of different buildings, inactive ones and different owners', () => {
    expect(combineProblem(unit('a'), [unit('b', { parentId: 'x3', grandparentId: 'other' })])).toBe('not_side_by_side');
    expect(combineProblem(unit('a'), [unit('b', { active: false })])).toBe('unit_inactive');
    expect(combineProblem(unit('a'), [unit('b', { parentId: 's4', owners: ['person:p2:100'] })])).toBe('owners_differ');
    expect(combineProblem(unit('a'), [unit('b', { parentId: 's4', owners: ['person:p1:50', 'person:p2:50'] })])).toBe('owners_differ');
    expect(combineProblem(unit('a', { owners: [] }), [unit('b', { parentId: 's4', owners: [] })])).toBeNull();
  });

  it('refuses while a retired unit still has bills, a tenancy, residents or vehicles, in that order', () => {
    const upper = (patch: Partial<CombineFacts>) => unit('b', { parentId: 's4', ...patch });
    expect(combineProblem(unit('a'), [upper({ openBills: 1, occupants: 2 })])).toBe('open_bills');
    expect(combineProblem(unit('a'), [upper({ openTenancy: true })])).toBe('open_tenancy');
    expect(combineProblem(unit('a'), [upper({ occupants: 1 })])).toBe('occupants');
    expect(combineProblem(unit('a'), [upper({ vehicles: 1 })])).toBe('vehicles');
    // The kept unit's own residents and bills don't matter.
    expect(combineProblem(unit('a', { openBills: 3, occupants: 4, openTenancy: true }), [upper({})])).toBeNull();
  });
});

describe('separating a part', () => {
  it('gives back the part\'s size only when both are known and something is left', () => {
    expect(separatedSize('2100.75', '800.25')).toBe('1300.50');
    expect(separatedSize('2000', null)).toBe('2000');
    expect(separatedSize(null, '800')).toBeNull();
    expect(separatedSize('800', '800')).toBe('800');
  });

  it('stops covering the part\'s floor unless another part is still there', () => {
    expect(coversAfterSeparate(['s4', 's5'], 's4', ['s5'])).toEqual(['s5']);
    expect(coversAfterSeparate(['s4'], 's4', ['s4'])).toEqual(['s4']);
    // A part on the kept unit's own floor: nothing to give back.
    expect(coversAfterSeparate(['s4'], 's3', [])).toEqual(['s4']);
  });
});

describe('combinedSize', () => {
  it('adds sizes only when all are known', () => {
    expect(combinedSize('1200.50', ['800.25', '100'])).toBe('2100.75');
    expect(combinedSize('1200', [null])).toBe('1200');
    expect(combinedSize(null, ['800'])).toBeNull();
  });
});

describe('coveredAfter', () => {
  it("takes the others' floors and links, never the kept unit's own floor", () => {
    expect(coveredAfter({ parentId: 's3', covers: [] }, [{ parentId: 's4', covers: ['s5'] }]).sort()).toEqual(['s4', 's5']);
    expect(coveredAfter({ parentId: 's3', covers: ['s4'] }, [{ parentId: 's3', covers: ['s4'] }])).toEqual(['s4']);
  });
});
