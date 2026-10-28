import { buildingLayoutSchema, expandLayout } from './building-layout.js';

const base = {
  floors: { from: 1, to: 3, pattern: '{n} তলা', groundName: null, groundHasUnits: true },
  units: { letters: 'এবি', pattern: 'ফ্ল্যাট {n}{letter}' },
  bangla: true,
  unitType: 'residential',
  sizeSqft: null,
  billTo: 'owner',
};
const parse = (patch: Record<string, unknown> = {}) => buildingLayoutSchema.safeParse({ ...base, ...patch });

describe('building layout', () => {
  it('names floors and units from the patterns, bottom first', () => {
    const layout = expandLayout(parse().data!);
    expect(layout.map((floor) => floor.name)).toEqual(['১ তলা', '২ তলা', '৩ তলা']);
    expect(layout[2]!.units).toEqual(['ফ্ল্যাট ৩এ', 'ফ্ল্যাট ৩বি']);
  });

  it('names the ground floor and can leave it without units', () => {
    const input = parse({ floors: { ...base.floors, from: 0, groundName: 'নিচ তলা', groundHasUnits: false }, bangla: false });
    const layout = expandLayout(input.data!);
    expect(layout[0]).toEqual({ number: 0, name: 'নিচ তলা', units: [] });
    expect(layout[1]).toMatchObject({ name: '1 তলা', units: ['ফ্ল্যাট 1এ', 'ফ্ল্যাট 1বি'] });
  });

  it('makes one unit per floor without letters', () => {
    const input = parse({ units: { letters: '', pattern: 'Office {n}' } });
    expect(expandLayout(input.data!).map((floor) => floor.units)).toEqual([['Office ১'], ['Office ২'], ['Office ৩']]);
  });

  it('refuses patterns without their place holders, reversed ranges, too many and clashing floor names', () => {
    expect(parse({ floors: { ...base.floors, pattern: 'তলা' } }).success).toBe(false);
    expect(parse({ units: { letters: 'AB', pattern: 'Flat {n}' } }).success).toBe(false);
    expect(parse({ floors: { ...base.floors, from: 5, to: 2 } }).success).toBe(false);
    expect(parse({ floors: { ...base.floors, from: 1, to: 100 }, units: { letters: 'ABCD', pattern: '{n}{letter}' } }).success).toBe(false);
    expect(parse({ floors: { ...base.floors, from: 0, groundName: '১ তলা' } }).success).toBe(false);
  });
});
