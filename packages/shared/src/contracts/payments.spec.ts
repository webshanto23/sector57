import { allocate, collectorMayVoid, paymentCreateSchema, statusAfterPayment, handoverConfirmSchema, type OpenBill } from './payments.js';

const id = (n: number) => `3f0e7a52-9a0c-4a5e-9a52-7b2f8d1c0a${String(n).padStart(2, '0')}`;
const bill = (n: number, due: string, dueDate: string, issueDate = '2026-09-01'): OpenBill => ({
  id: id(n),
  invoiceNo: `INV-2609-${String(n).padStart(4, '0')}`,
  issueDate,
  dueDate,
  due,
});

describe('allocate', () => {
  const october = bill(2, '1500.00', '2026-10-15', '2026-10-01');
  const september = bill(1, '1500.00', '2026-09-15');
  const generator = bill(3, '500.00', '2026-10-15', '2026-10-02');

  it('settles the oldest bill first, whatever order they were ticked in', () => {
    const result = allocate([october, generator, september], '3500.00');
    expect(result).toEqual({
      ok: true,
      allocations: [
        { invoiceId: september.id, amount: '1500.00' },
        { invoiceId: october.id, amount: '1500.00' },
        { invoiceId: generator.id, amount: '500.00' },
      ],
    });
  });

  it('leaves only the last bill partly paid when the amount is lowered', () => {
    const result = allocate([september, october], '2000.00');
    expect(result).toEqual({
      ok: true,
      allocations: [
        { invoiceId: september.id, amount: '1500.00' },
        { invoiceId: october.id, amount: '500.00' },
      ],
    });
  });

  it('breaks ties on the bill date, then the number', () => {
    const a = bill(5, '100.00', '2026-10-15', '2026-10-01');
    const b = bill(4, '100.00', '2026-10-15', '2026-10-01');
    const result = allocate([a, b], '150.00');
    expect(result.ok && result.allocations.map((x) => x.invoiceId)).toEqual([b.id, a.id]);
  });

  it('counts in paisa', () => {
    const result = allocate([bill(1, '0.10', '2026-09-01'), bill(2, '0.20', '2026-09-02')], '0.30');
    expect(result).toEqual({
      ok: true,
      allocations: [
        { invoiceId: id(1), amount: '0.10' },
        { invoiceId: id(2), amount: '0.20' },
      ],
    });
  });

  it('keeps no credit: more than the bills owe is refused', () => {
    expect(allocate([september], '1500.01')).toEqual({ ok: false, code: 'amount_exceeds_due' });
  });

  it('refuses an amount too small to reach every ticked bill', () => {
    expect(allocate([september, october], '1500.00')).toEqual({ ok: false, code: 'bill_not_reached' });
  });
});

describe('statusAfterPayment', () => {
  it('follows what is paid', () => {
    expect(statusAfterPayment('0.00', '1500.00')).toBe('unpaid');
    expect(statusAfterPayment('0.01', '1500.00')).toBe('partial');
    expect(statusAfterPayment('1500.00', '1500.00')).toBe('paid');
  });
});

describe('collectorMayVoid', () => {
  const facts = { receivedBy: id(1), userId: id(1), receivedDay: '2026-10-11', today: '2026-10-11', inHandover: false };
  it('lets the collector void their own payment the same day, before handover', () => {
    expect(collectorMayVoid(facts)).toBe(true);
    expect(collectorMayVoid({ ...facts, userId: id(2) })).toBe(false);
    expect(collectorMayVoid({ ...facts, today: '2026-10-12' })).toBe(false);
    expect(collectorMayVoid({ ...facts, inHandover: true })).toBe(false);
  });
});

describe('paymentCreateSchema', () => {
  const base = { invoiceIds: [id(1)], amount: '১,৫০০', payer: { kind: 'person', id: id(9) } };
  it('takes Bangla digits and needs a unit or a member', () => {
    const parsed = paymentCreateSchema.parse({ ...base, unitId: id(5) });
    expect(parsed.amount).toBe('1500.00');
    expect(paymentCreateSchema.safeParse(base).success).toBe(false);
    expect(paymentCreateSchema.safeParse({ ...base, unitId: id(5), personId: id(6) }).success).toBe(false);
  });

  it('refuses zero and a bill ticked twice', () => {
    expect(paymentCreateSchema.safeParse({ ...base, unitId: id(5), amount: '0' }).success).toBe(false);
    expect(paymentCreateSchema.safeParse({ ...base, unitId: id(5), invoiceIds: [id(1), id(1)] }).success).toBe(false);
  });
});

describe('handoverConfirmSchema', () => {
  it('accepts a count of zero', () => {
    expect(handoverConfirmSchema.parse({ amountCounted: '০' })).toEqual({ amountCounted: '0.00', note: null });
  });
});
