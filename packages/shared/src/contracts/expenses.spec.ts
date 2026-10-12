import { budgetFigures, budgetInputSchema, expenseActions, expenseInputSchema, vendorInputSchema, type ExpenseStatus } from './expenses.js';

const me = '3f0e7a52-9a0c-4a5e-9a52-7b2f8d1c0a01';
const other = '3f0e7a52-9a0c-4a5e-9a52-7b2f8d1c0a02';
const all = { create: true, edit: true, approve: true };

describe('expenseActions', () => {
  const at = (status: ExpenseStatus, requestedBy = other, grants = all, userId = me) => expenseActions({ status, requestedBy }, userId, grants);

  it('never lets anyone approve or reject their own request', () => {
    expect(at('pending', me)).toMatchObject({ approve: false, reject: false, edit: true });
    expect(at('pending', other)).toMatchObject({ approve: true, reject: true });
  });

  it('lets the requester edit only while pending, and an editor any pending one', () => {
    const requester = { create: true, edit: false, approve: false };
    expect(at('pending', me, requester).edit).toBe(true);
    expect(at('pending', other, requester).edit).toBe(false);
    expect(at('approved', me, requester).edit).toBe(false);
    expect(at('pending', other, { create: false, edit: true, approve: false }).edit).toBe(true);
  });

  it('pays only approved expenses, with edit; voids approved or paid ones, with approve', () => {
    expect(at('approved').pay).toBe(true);
    expect(at('pending').pay).toBe(false);
    expect(at('approved', other, { create: true, edit: false, approve: true }).pay).toBe(false);
    for (const status of ['approved', 'paid'] as const) expect(at(status).void).toBe(true);
    for (const status of ['pending', 'rejected', 'void'] as const) expect(at(status).void).toBe(false);
    expect(at('paid', other, { create: true, edit: true, approve: false }).void).toBe(false);
  });

  it('takes vouchers until rejected or void', () => {
    for (const status of ['pending', 'approved', 'paid'] as const) expect(at(status).upload).toBe(true);
    for (const status of ['rejected', 'void'] as const) expect(at(status).upload).toBe(false);
  });
});

describe('budgetFigures', () => {
  it('adds approved and paid, in paisa', () => {
    expect(budgetFigures('1000.00', '0.10', '0.20')).toEqual({ used: '0.30', remaining: '999.70', percent: 0, over: false });
  });

  it('marks a head over budget', () => {
    expect(budgetFigures('500.00', '200.00', '400.50')).toEqual({ used: '600.50', remaining: '-100.50', percent: 120, over: true });
  });

  it('reads a zero budget with spending as fully used', () => {
    expect(budgetFigures('0.00', '0.00', '10.00')).toMatchObject({ percent: 100, over: true });
    expect(budgetFigures('0.00', '0.00', '0.00')).toMatchObject({ percent: 0, over: false });
  });
});

describe('expense inputs', () => {
  it('takes Bangla digits and normalises text', () => {
    const parsed = expenseInputSchema.parse({ headId: me, description: '  বাতি   বদল ', amount: '১,২০০.৫', spentOn: '2026-10-12' });
    expect(parsed).toMatchObject({ amount: '1200.50', description: 'বাতি   বদল' });
    expect(expenseInputSchema.safeParse({ headId: me, description: 'x', amount: '0', spentOn: '2026-10-12' }).success).toBe(false);
    expect(expenseInputSchema.safeParse({ headId: me, description: ' ', amount: '5', spentOn: '2026-10-12' }).success).toBe(false);
  });

  it('checks a vendor phone and keeps the name as typed', () => {
    expect(vendorInputSchema.parse({ name: 'রহমান ইলেকট্রিক', phone: '০১৭১১২২৩৩৪৪' })).toEqual({ name: 'রহমান ইলেকট্রিক', phone: '01711223344', service: null });
    expect(vendorInputSchema.safeParse({ name: 'x', phone: '123' }).success).toBe(false);
  });

  it('accepts a fiscal year label and refuses a head twice', () => {
    expect(budgetInputSchema.safeParse({ year: '2026-27', lines: [{ headId: me, amount: '0' }] }).success).toBe(true);
    expect(budgetInputSchema.safeParse({ year: '26-27', lines: [{ headId: me, amount: '1' }] }).success).toBe(false);
    expect(
      budgetInputSchema.safeParse({
        year: '2026-27',
        lines: [
          { headId: me, amount: '1' },
          { headId: me, amount: '2' },
        ],
      }).success,
    ).toBe(false);
  });
});
