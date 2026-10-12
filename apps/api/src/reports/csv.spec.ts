import { toCsv } from './csv.js';

describe('toCsv', () => {
  it('starts with a byte order mark and ends lines with CRLF', () => {
    const csv = toCsv([
      ['ইউনিট', 'Owed'],
      ['A-1', '1500.00'],
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('ইউনিট,Owed\r\nA-1,1500.00\r\n');
  });

  it('quotes commas, quotes and new lines, and leaves blanks empty', () => {
    expect(toCsv([['a,b', 'say "hi"', 'two\nlines', null, undefined, 3]]).slice(1)).toBe('"a,b","say ""hi""","two\nlines",,,3\r\n');
  });

  it('defuses text that would run as a formula but keeps negative amounts', () => {
    expect(toCsv([['=SUM(A1)', '+1 call', '@x', '-12.50', '-x']]).slice(1)).toBe("'=SUM(A1),'+1 call,'@x,-12.50,'-x\r\n");
  });
});
