import { cleanDeep, cleanText, initials } from './text.js';

describe('cleanText', () => {
  it('normalises to NFC and trims', () => {
    const decomposed = 'কো'; // ক + ে + া, the decomposed form of কো
    expect(cleanText(`  ${decomposed} `)).toBe('কো');
  });
});

describe('cleanDeep', () => {
  it('cleans nested strings and leaves other values alone', () => {
    const date = new Date(0);
    expect(cleanDeep({ a: ' x ', b: [' y '], c: 1, d: null, e: date })).toEqual({
      a: 'x',
      b: ['y'],
      c: 1,
      d: null,
      e: date,
    });
  });
});

describe('initials', () => {
  it('takes one Bangla grapheme and drops honorifics', () => {
    expect(initials('মোঃ জাহাঙ্গীর আলম')).toBe('জা');
    expect(initials('রোকেয়া বেগম')).toBe('রো');
  });
  it('takes two Latin initials', () => {
    expect(initials('Md. Jahangir Alam')).toBe('JA');
    expect(initials('rashed')).toBe('R');
  });
  it('handles empty input', () => {
    expect(initials('  ')).toBe('');
  });
});
