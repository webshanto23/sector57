import { bnDigits, formatNumber, formatTaka } from './format.js';

describe('bnDigits', () => {
  it('maps every ASCII digit', () => {
    expect(bnDigits('01711-000057')).toBe('০১৭১১-০০০০৫৭');
  });
});

describe('formatNumber', () => {
  it('uses Indian grouping', () => {
    expect(formatNumber(2170000, 'en')).toBe('21,70,000');
    expect(formatNumber('312', 'en')).toBe('312');
    expect(formatNumber('1000', 'en')).toBe('1,000');
    expect(formatNumber('123456789', 'en')).toBe('12,34,56,789');
  });
  it('writes Bangla digits in bn', () => {
    expect(formatNumber(2170000, 'bn')).toBe('২১,৭০,০০০');
  });
  it('rejects non-numbers', () => {
    expect(() => formatNumber('12a', 'en')).toThrow(RangeError);
  });
});

describe('formatTaka', () => {
  it('formats Decimal strings without floats', () => {
    expect(formatTaka('4500.00', 'en')).toBe('৳ 4,500');
    expect(formatTaka('684500.50', 'bn')).toBe('৳ ৬,৮৪,৫০০.৫০');
    expect(formatTaka('0.1', 'en')).toBe('৳ 0.10');
    expect(formatTaka('-1500', 'en')).toBe('৳ -1,500');
  });
  it('keeps large amounts exact', () => {
    expect(formatTaka('999999999999.99', 'en')).toBe('৳ 9,99,99,99,99,999.99');
  });
});
