import { chargeTypeInputSchema, openingInputSchema, settingsInputSchema } from './contracts/finance.js';
import { fiscalYearOf, fiscalYearStarting, documentPeriod, formatDocumentNo } from './fiscal.js';
import {
  addMoney,
  compareMoney,
  fromPaisa,
  moneyOrZeroSchema,
  moneySchema,
  normaliseMoney,
  optionalMoneySchema,
  subtractMoney,
  toPaisa,
} from './money.js';
import { amountInWords } from './words.js';

describe('paisa arithmetic', () => {
  it('converts both ways without floats', () => {
    expect(toPaisa('4500')).toBe(450000n);
    expect(toPaisa('0.1')).toBe(10n);
    expect(toPaisa('-12.05')).toBe(-1205n);
    expect(fromPaisa(450050n)).toBe('4500.50');
    expect(fromPaisa(-5n)).toBe('-0.05');
    expect(fromPaisa(0n)).toBe('0.00');
  });

  it('adds what floats get wrong', () => {
    expect(addMoney('0.10', '0.20')).toBe('0.30');
    expect(addMoney('999999999999.99', '0.01')).toBe('1000000000000.00');
    expect(addMoney()).toBe('0.00');
    expect(subtractMoney('100', '100.01')).toBe('-0.01');
  });

  it('normalises and compares', () => {
    expect(normaliseMoney('0045.5')).toBe('45.50');
    expect(compareMoney('10', '10.00')).toBe(0);
    expect(compareMoney('9.99', '10')).toBe(-1);
  });

  it.each(['', '1.234', '1e3', 'abc', '١٢'])('refuses %j', (value) => {
    expect(() => toPaisa(value)).toThrow(RangeError);
  });
});

describe('money schemas', () => {
  it.each([
    ['4500', '4500.00'],
    ['৪,৫০০.৫', '4500.50'],
    ['৳ 1,00,000', '100000.00'],
    [' 12.3 ', '12.30'],
  ])('accepts %j', (input, output) => {
    expect(moneySchema.parse(input)).toBe(output);
  });

  it.each(['0', '0.00', '-5', '1.234', 'abc', '1234567890123'])('refuses %j as an amount', (input) => {
    const result = moneySchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('invalid_amount');
  });

  it('allows zero only where asked', () => {
    expect(moneyOrZeroSchema.parse('০')).toBe('0.00');
    expect(optionalMoneySchema.parse('')).toBeNull();
    expect(optionalMoneySchema.parse(null)).toBeNull();
    expect(optionalMoneySchema.parse('২০০')).toBe('200.00');
    expect(optionalMoneySchema.safeParse('0').success).toBe(false);
  });
});

describe('amountInWords', () => {
  it.each([
    ['0', 'শূন্য টাকা মাত্র'],
    ['5', 'পাঁচ টাকা মাত্র'],
    ['99', 'নিরানব্বই টাকা মাত্র'],
    ['100', 'একশত টাকা মাত্র'],
    ['4500', 'চার হাজার পাঁচশত টাকা মাত্র'],
    ['21000', 'একুশ হাজার টাকা মাত্র'],
    ['100000', 'এক লক্ষ টাকা মাত্র'],
    ['2170000', 'একুশ লক্ষ সত্তর হাজার টাকা মাত্র'],
    ['10000000', 'এক কোটি টাকা মাত্র'],
    ['12345678.90', 'এক কোটি তেইশ লক্ষ পঁয়তাল্লিশ হাজার ছয়শত আটাত্তর টাকা নব্বই পয়সা মাত্র'],
    ['10000000000', 'এক হাজার কোটি টাকা মাত্র'],
    ['0.50', 'শূন্য টাকা পঞ্চাশ পয়সা মাত্র'],
    ['1250.05', 'এক হাজার দুইশত পঞ্চাশ টাকা পাঁচ পয়সা মাত্র'],
  ])('bn %s', (amount, words) => {
    expect(amountInWords(amount, 'bn')).toBe(words.normalize('NFC'));
  });

  it.each([
    ['0', 'Taka zero only'],
    ['4500', 'Taka four thousand five hundred only'],
    ['115', 'Taka one hundred fifteen only'],
    ['2170000', 'Taka twenty-one lakh seventy thousand only'],
    ['12345678.90', 'Taka one crore twenty-three lakh forty-five thousand six hundred seventy-eight and ninety paisa only'],
    ['999999999999.99', 'Taka ninety-nine thousand nine hundred ninety-nine crore ninety-nine lakh ninety-nine thousand nine hundred ninety-nine and ninety-nine paisa only'],
    ['0.05', 'Taka zero and five paisa only'],
  ])('en %s', (amount, words) => {
    expect(amountInWords(amount, 'en')).toBe(words);
  });

  it('has a distinct Bangla word for every number below 100', () => {
    const words = Array.from({ length: 100 }, (_, n) => amountInWords(String(n), 'bn'));
    expect(new Set(words).size).toBe(100);
  });

  it('refuses negative amounts', () => {
    expect(() => amountInWords('-1', 'bn')).toThrow(RangeError);
  });
});

describe('fiscal years', () => {
  it('starts in July by default', () => {
    expect(fiscalYearOf('2026-10-11', 7)).toEqual({ startYear: 2026, label: '2026-27', start: '2026-07-01', end: '2027-06-30' });
    expect(fiscalYearOf('2027-06-30', 7).label).toBe('2026-27');
    expect(fiscalYearOf('2026-06-30', 7).label).toBe('2025-26');
    expect(fiscalYearStarting(2099, 7).label).toBe('2099-00');
  });

  it('handles a calendar year and leap days', () => {
    expect(fiscalYearOf('2026-03-01', 1)).toEqual({ startYear: 2026, label: '2026', start: '2026-01-01', end: '2026-12-31' });
    expect(fiscalYearStarting(2027, 3).end).toBe('2028-02-29');
  });
});

describe('document numbers', () => {
  it('restarts invoices monthly, vouchers yearly, receipts never', () => {
    expect(documentPeriod('invoice', '2026-10-11', 7)).toBe('2610');
    expect(documentPeriod('voucher', '2026-10-11', 7)).toBe('26');
    expect(documentPeriod('voucher', '2027-06-30', 7)).toBe('26');
    expect(documentPeriod('voucher', '2027-07-01', 7)).toBe('27');
    expect(documentPeriod('receipt', '2026-10-11', 7)).toBe('');
  });

  it('formats as agreed', () => {
    expect(formatDocumentNo('invoice', '2610', 1)).toBe('INV-2610-0001');
    expect(formatDocumentNo('receipt', '', 42)).toBe('RC-00042');
    expect(formatDocumentNo('voucher', '26', 12345)).toBe('EXP-26-12345');
  });
});

describe('finance inputs', () => {
  it('refuses unknown settings keys', () => {
    expect(settingsInputSchema.safeParse({ separateFacilityFunds: true }).success).toBe(true);
    expect(settingsInputSchema.safeParse({ moduleHrmEnabled: true }).success).toBe(false);
  });

  it('takes an opening balance of zero and Bangla digits', () => {
    expect(openingInputSchema.parse({ date: '2026-07-01', cash: '০', bank: '১,২৫,০০০' })).toEqual({
      date: '2026-07-01',
      cash: '0.00',
      bank: '125000.00',
    });
  });

  it('cleans a charge type', () => {
    const parsed = chargeTypeInputSchema.parse({
      nameBn: ' সার্ভিস চার্জ ',
      nameEn: '',
      kind: 'due',
      fundId: '7b0a0f39-3f0e-4f43-9a55-2d1f7c1d2a11',
      defaultAmount: '২,৫০০',
    });
    expect(parsed).toMatchObject({ nameBn: 'সার্ভিস চার্জ', nameEn: null, defaultAmount: '2500.00' });
  });
});
