import {
  digitVariants,
  expandNames,
  levelsInputSchema,
  locationBulkSchema,
  MAX_BULK_NAMES,
  nameRangeSchema,
  sizeSqftSchema,
  toOccupancy,
  unitCreateSchema,
} from './property.js';

const uuid = '0b6d2c3e-8f1a-4c5b-9d7e-1a2b3c4d5e6f';

describe('expandNames', () => {
  it('numbers a prefix', () => {
    expect(expandNames(nameRangeSchema.parse({ prefix: 'Road ', from: 1, to: 3 }))).toEqual(['Road 1', 'Road 2', 'Road 3']);
  });

  it('adds letters after each number', () => {
    expect(expandNames(nameRangeSchema.parse({ prefix: 'Flat ', from: 1, to: 2, letters: 'A, B' }))).toEqual([
      'Flat 1A',
      'Flat 1B',
      'Flat 2A',
      'Flat 2B',
    ]);
  });

  it('writes Bangla digits and takes Bangla letters whole', () => {
    expect(expandNames(nameRangeSchema.parse({ prefix: 'ফ্ল্যাট ', from: 9, to: 10, letters: 'কখ', bangla: true }))).toEqual([
      'ফ্ল্যাট ৯ক',
      'ফ্ল্যাট ৯খ',
      'ফ্ল্যাট ১০ক',
      'ফ্ল্যাট ১০খ',
    ]);
  });

  it('refuses a reversed or oversized range', () => {
    expect(nameRangeSchema.safeParse({ from: 5, to: 1 }).success).toBe(false);
    expect(nameRangeSchema.safeParse({ from: 1, to: MAX_BULK_NAMES }).success).toBe(true);
    expect(nameRangeSchema.safeParse({ from: 1, to: 100, letters: 'ABCD' }).success).toBe(false);
  });
});

describe('property schemas', () => {
  it('reads sizes in either digit form and refuses junk', () => {
    expect(sizeSqftSchema.parse('১,২০০.৫০')).toBe('1200.50');
    expect(sizeSqftSchema.parse('  ')).toBeNull();
    expect(sizeSqftSchema.parse(undefined)).toBeNull();
    expect(sizeSqftSchema.safeParse('12.345').success).toBe(false);
    expect(sizeSqftSchema.safeParse('-5').success).toBe(false);
  });

  it('normalises unit names and requires one', () => {
    const base = { parentId: uuid, code: '', unitType: 'residential', billTo: 'owner', occupancy: 'vacant', sizeSqft: null };
    expect(unitCreateSchema.parse({ ...base, name: ' ফ্ল্যাট ৪বি ' }).name).toBe('ফ্ল্যাট ৪বি'.normalize('NFC'));
    expect(unitCreateSchema.parse({ ...base, name: 'A' }).code).toBeNull();
    expect(unitCreateSchema.safeParse({ ...base, name: '  ' }).success).toBe(false);
  });

  it('refuses repeated names in a bulk add', () => {
    expect(locationBulkSchema.safeParse({ parentId: null, levelId: uuid, names: ['Road 1', ' Road 1'] }).success).toBe(false);
  });

  it('needs two levels with different names', () => {
    const level = (nameBn: string) => ({ id: null, nameBn, nameEn: null });
    expect(levelsInputSchema.safeParse({ levels: [level('ব্লক')] }).success).toBe(false);
    expect(levelsInputSchema.safeParse({ levels: [level('ব্লক'), level('ব্লক')] }).success).toBe(false);
    expect(levelsInputSchema.safeParse({ levels: [level('ব্লক'), level('ইউনিট')] }).success).toBe(true);
  });

  it('falls back on unknown stored values and searches both digit forms', () => {
    expect(toOccupancy('sold')).toBe('vacant');
    expect(digitVariants('4B')).toEqual(['4B', '৪B']);
    expect(digitVariants('৪বি')).toEqual(['৪বি', '4বি']);
  });
});
