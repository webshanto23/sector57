import { billSpan, duplicateBills, invoiceBatchSchema, invoicePrintQuery, splitByFund } from './billing-batch.js';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';

describe('splitByFund', () => {
  it('keeps one bill per fund, funds in the order the lines first name them', () => {
    const fund: Record<string, string> = { service: 'general', mosque: 'mosque', lift: 'general' };
    const lines = [{ chargeTypeId: 'mosque' }, { chargeTypeId: 'service' }, { chargeTypeId: 'lift' }];
    expect(splitByFund(lines, (id) => fund[id]!)).toEqual([
      { fundId: 'mosque', lines: [{ chargeTypeId: 'mosque' }] },
      { fundId: 'general', lines: [{ chargeTypeId: 'service' }, { chargeTypeId: 'lift' }] },
    ]);
  });
});

describe('billSpan', () => {
  it('uses the period when there is one', () => {
    expect(billSpan('2026-09-01', '2026-10-31', '2026-10-16')).toEqual({ start: '2026-09-01', end: '2026-10-31' });
  });

  it('falls back to the month of issue', () => {
    expect(billSpan(null, null, '2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });
});

describe('duplicateBills', () => {
  const october = { start: '2026-10-01', end: '2026-10-31' };
  const earlier = (id: string, span: { start: string; end: string }, chargeTypeIds: string[]) => ({ id, invoiceNo: `INV-${id}`, span, chargeTypeIds });

  it('flags an earlier bill with the same charge in an overlapping month, naming each shared charge once', () => {
    const found = duplicateBills(['lift', 'service'], october, [earlier('1', { start: '2026-09-01', end: '2026-10-31' }, ['service', 'mosque', 'service'])]);
    expect(found).toEqual([{ invoiceId: '1', invoiceNo: 'INV-1', chargeTypeIds: ['service'] }]);
  });

  it('ignores other charges and other months', () => {
    const found = duplicateBills(['lift'], october, [
      earlier('1', october, ['service']),
      earlier('2', { start: '2026-11-01', end: '2026-11-30' }, ['lift']),
      earlier('3', { start: '2026-09-01', end: '2026-09-30' }, ['lift']),
    ]);
    expect(found).toEqual([]);
  });
});

describe('invoiceBatchSchema', () => {
  const unit = (unitId: string) => ({ unitId, lines: [{ chargeTypeId: C, amount: '500' }] });

  it('takes each unit once', () => {
    const result = invoiceBatchSchema.safeParse({ dueDate: '2026-10-31', units: [unit(A), unit(B), unit(A)] });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(['duplicate_unit']);
  });

  it('checks the period like a single bill', () => {
    expect(invoiceBatchSchema.safeParse({ dueDate: '2026-10-31', periodFrom: '2026-10', periodTo: '2026-09', units: [unit(A)] }).success).toBe(false);
    expect(invoiceBatchSchema.safeParse({ dueDate: '2026-10-31', periodFrom: '2026-10', units: [unit(A), unit(B)] }).success).toBe(true);
  });
});

describe('invoicePrintQuery', () => {
  it('splits, trims and drops repeats', () => {
    expect(invoicePrintQuery.parse({ ids: `${A}, ${B},${A},` }).ids).toEqual([A, B]);
  });

  it('refuses anything that is not a bill id', () => {
    expect(invoicePrintQuery.safeParse({ ids: 'abc' }).success).toBe(false);
    expect(invoicePrintQuery.safeParse({ ids: '' }).success).toBe(false);
  });
});
