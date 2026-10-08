import { bdPhone, optionalText, pagination, text } from './schemas.js';
import { pick } from './locale.js';

describe('bdPhone', () => {
  it.each([
    ['01711-000057', '01711000057'],
    ['+8801711000057', '01711000057'],
    ['০১৭১১ ০০০০৫৭', '01711000057'],
  ])('accepts %s', (input, output) => {
    expect(bdPhone.parse(input)).toBe(output);
  });
  it.each(['0171100005', '02711000057', '01211000057', 'abc'])('rejects %s', (input) => {
    expect(bdPhone.safeParse(input).success).toBe(false);
  });
});

describe('text helpers', () => {
  it('requires non-blank text', () => {
    expect(text().safeParse('   ').success).toBe(false);
    expect(text().parse(' নোটিশ ')).toBe('নোটিশ');
  });
  it('turns blank optional text into null', () => {
    expect(optionalText().parse('  ')).toBeNull();
    expect(optionalText().parse(undefined)).toBeNull();
    expect(optionalText().parse(' en ')).toBe('en');
  });
});

describe('pagination', () => {
  it('applies defaults and limits', () => {
    expect(pagination.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(pagination.safeParse({ pageSize: '500' }).success).toBe(false);
  });
});

describe('pick', () => {
  it('falls back to Bangla', () => {
    expect(pick('ব্লক', 'Block', 'en')).toBe('Block');
    expect(pick('ব্লক', null, 'en')).toBe('ব্লক');
    expect(pick('ব্লক', 'Block', 'bn')).toBe('ব্লক');
  });
});
