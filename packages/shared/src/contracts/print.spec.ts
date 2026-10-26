import { receiptHeaderInputSchema, receiptHeaderSchema } from './finance.js';
import {
  billDensity,
  DEFAULT_PRINT_FORMATS,
  notePoints,
  pickFormat,
  printFormatsInputSchema,
  printFormatsOf,
  type PrintChoice,
} from './print.js';

const issues = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  result.error?.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`) ?? [];

describe('pickFormat', () => {
  const choice: PrintChoice = { default: 'a4', offered: ['a4', 'a5'] };

  it('takes a one-off pick, then the device, then the default', () => {
    expect(pickFormat(choice, 'a5', 'a4')).toBe('a4');
    expect(pickFormat(choice, 'a5')).toBe('a5');
    expect(pickFormat(choice, null)).toBe('a4');
  });

  it('ignores a choice the society no longer offers, or one it never heard of', () => {
    expect(pickFormat({ default: 'a5', offered: ['a5'] }, 'a4')).toBe('a5');
    expect(pickFormat(choice, 'thermal80', 'letter')).toBe('a4');
  });
});

describe('printFormatsOf', () => {
  it('falls back to the defaults when nothing or nonsense is saved', () => {
    expect(printFormatsOf(undefined)).toEqual(DEFAULT_PRINT_FORMATS);
    expect(printFormatsOf({ bill: 'a4' })).toEqual(DEFAULT_PRINT_FORMATS);
  });

  it('keeps saved bills when receipts were never saved', () => {
    const bill = { default: 'thermal80', offered: ['a4', 'thermal80'], noteBn: null, noteEn: null };
    expect(printFormatsOf({ bill })).toEqual({ bill, receipt: DEFAULT_PRINT_FORMATS.receipt });
  });

  it('drops formats a document has no layout for, and moves the default with them', () => {
    const saved = { bill: { default: 'a5', offered: ['a5'], noteBn: null, noteEn: null }, receipt: { default: 'a4', offered: ['a4', 'thermal80'] } };
    expect(printFormatsOf(saved).receipt).toEqual({ default: 'thermal80', offered: ['thermal80'] });
  });
});

describe('printFormatsInputSchema', () => {
  const bill = (over: object) => ({ bill: { default: 'a4', offered: ['a4', 'a5'], noteBn: '', noteEn: null, ...over } });

  it('keeps notes, blank ones as null', () => {
    expect(printFormatsInputSchema.parse(bill({ noteBn: ' এক\nদুই ' })).bill).toMatchObject({ noteBn: 'এক\nদুই', noteEn: null });
  });

  it('takes thermal for bills and receipts, and one document alone', () => {
    expect(printFormatsInputSchema.safeParse(bill({ offered: ['a4', 'thermal80'] })).success).toBe(true);
    expect(printFormatsInputSchema.parse({ receipt: { default: 'thermal80', offered: ['a5', 'thermal80'] } })).toEqual({
      receipt: { default: 'thermal80', offered: ['a5', 'thermal80'] },
    });
  });

  it('refuses a format a document lacks, a format twice, a default not offered and an empty list', () => {
    expect(issues(printFormatsInputSchema.safeParse({ receipt: { default: 'a5', offered: ['a5', 'a4'] } }))).toEqual([
      'receipt.offered:print_format_unsupported',
    ]);
    expect(issues(printFormatsInputSchema.safeParse(bill({ offered: ['a4', 'a4'] })))).toEqual(['bill.offered:print_format_twice']);
    expect(issues(printFormatsInputSchema.safeParse(bill({ offered: ['a5'] })))).toEqual(['bill.default:print_default_not_offered']);
    expect(printFormatsInputSchema.safeParse(bill({ offered: [] })).success).toBe(false);
  });
});

describe('the bill layout helpers', () => {
  it('turns compact above ten lines', () => {
    expect(billDensity(10)).toBe('normal');
    expect(billDensity(11)).toBe('compact');
  });

  it('prints a note line by line, skipping blanks', () => {
    expect(notePoints(' এক \n\n দুই')).toEqual(['এক', 'দুই']);
    expect(notePoints(null)).toEqual([]);
  });
});

describe('receipt header contacts', () => {
  it('reads a header saved before email and registration were added', () => {
    const old = { nameBn: 'সমিতি', nameEn: null, addressBn: null, addressEn: null, phone: null };
    expect(receiptHeaderSchema.parse(old)).toMatchObject({ email: null, regNo: null, officeHoursBn: null, officeHoursEn: null });
  });

  it('checks the email', () => {
    expect(issues(receiptHeaderInputSchema.safeParse({ nameBn: 'সমিতি', email: 'office@' }))).toEqual(['email:invalid_email']);
  });
});
