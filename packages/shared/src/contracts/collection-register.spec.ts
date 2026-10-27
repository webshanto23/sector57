import {
  collectionRegisterQuery,
  groupByDay,
  largestColumn,
  splitAcrossLines,
  sumRows,
  type RegisterColumn,
  type RegisterLine,
  type RegisterRow,
} from '../index.js';

const lines: RegisterLine[] = [
  { key: 'monthly', amount: '500.00', month: '2026-08' },
  { key: 'waste', amount: '200.00', month: '2026-08' },
  { key: 'monthly', amount: '500.00', month: '2026-09' },
];

describe('splitAcrossLines', () => {
  it('fills the lines in order', () => {
    expect(splitAcrossLines(lines, '0', '600')).toEqual([
      { key: 'monthly', amount: '500.00', month: '2026-08' },
      { key: 'waste', amount: '100.00', month: '2026-08' },
    ]);
  });

  it('starts where earlier receipts on the bill stopped', () => {
    expect(splitAcrossLines(lines, '600', '600')).toEqual([
      { key: 'waste', amount: '100.00', month: '2026-08' },
      { key: 'monthly', amount: '500.00', month: '2026-09' },
    ]);
  });

  it('is exact on paisa and skips empty lines', () => {
    const withFree = [{ key: 'free', amount: '0', month: null }, ...lines];
    expect(splitAcrossLines(withFree, '499.99', '0.02')).toEqual([
      { key: 'monthly', amount: '0.01', month: '2026-08' },
      { key: 'waste', amount: '0.01', month: '2026-08' },
    ]);
  });

  it('keeps the parts equal to the amount even past the last line', () => {
    const parts = splitAcrossLines(lines, '1100', '200');
    expect(parts).toEqual([{ key: 'monthly', amount: '200.00', month: '2026-09' }]);
    expect(splitAcrossLines(lines, '1200', '50')).toEqual([{ key: 'monthly', amount: '50.00', month: '2026-09' }]);
  });
});

const row = (over: Partial<RegisterRow>): RegisterRow => ({
  id: '00000000-0000-4000-8000-000000000001',
  receiptNo: 'RC-1',
  at: '2026-09-01T04:00:00.000Z',
  day: '2026-09-01',
  payer: 'ক',
  role: 'owner',
  months: ['2026-08'],
  places: ['29', '3/A', 'F'],
  amounts: { monthly: '500.00' },
  total: '500.00',
  method: 'cash',
  collector: { id: '00000000-0000-4000-8000-000000000002', name: 'খ' },
  void: false,
  ...over,
});

describe('register totals', () => {
  const rows = [
    row({ receiptNo: 'RC-3', at: '2026-09-02T05:00:00.000Z', day: '2026-09-02', amounts: { waste: '200.00' }, total: '200.00' }),
    row({ receiptNo: 'RC-2', at: '2026-09-01T06:00:00.000Z', amounts: { membership: '5000.00' }, total: '5000.00' }),
    row({ receiptNo: 'RC-1' }),
    row({ receiptNo: 'RC-9', void: true, amounts: { monthly: '9999.00' }, total: '9999.00' }),
  ];

  it('never counts a voided receipt', () => {
    expect(sumRows(rows)).toEqual({
      amounts: { waste: '200.00', membership: '5000.00', monthly: '500.00' },
      total: '5700.00',
      receipts: 3,
    });
  });

  it('groups by day in time order with day totals', () => {
    const days = groupByDay(rows);
    expect(days.map((day) => day.day)).toEqual(['2026-09-01', '2026-09-02']);
    expect(days[0]!.rows.map((r) => r.receiptNo)).toEqual(['RC-1', 'RC-9', 'RC-2']);
    expect(days[0]).toMatchObject({ total: '5500.00', receipts: 2 });
  });

  it('names the largest column, first on a tie', () => {
    const columns: RegisterColumn[] = ['monthly', 'waste', 'membership'].map((key) => ({
      key,
      kind: key === 'membership' ? 'membership' : 'charge',
      nameBn: null,
      nameEn: null,
    }));
    expect(largestColumn(columns, sumRows(rows))).toEqual({ key: 'membership', amount: '5000.00' });
    expect(largestColumn(columns, { amounts: { monthly: '1.00', waste: '1.00' }, total: '2.00', receipts: 2 })?.key).toBe('monthly');
    expect(largestColumn(columns, { amounts: {}, total: '0.00', receipts: 0 })).toBeNull();
  });
});

describe('collectionRegisterQuery', () => {
  it('lists voided receipts unless asked not to', () => {
    expect(collectionRegisterQuery.parse({}).voided).toBe(true);
    expect(collectionRegisterQuery.parse({ voided: 'false', month: '2026-09' })).toEqual({ voided: false, month: '2026-09' });
    expect(collectionRegisterQuery.safeParse({ month: '2026-13' }).success).toBe(false);
  });
});
