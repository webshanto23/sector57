import { donationCreateSchema } from './donations.js';
import { expensePaySchema } from './expenses.js';
import { accountOfMethod, PAYMENT_METHODS, storedMethod } from './finance.js';
import { paymentCreateSchema } from './payments.js';
import { payrollPaySchema } from './payroll.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const issues = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  result.error?.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`) ?? [];

describe('accountOfMethod and storedMethod', () => {
  it('keeps only cash in the cash box', () => {
    expect(PAYMENT_METHODS.map(accountOfMethod)).toEqual(['cash', 'bank', 'bank', 'bank']);
  });

  it('drops a reference typed for cash', () => {
    expect(storedMethod({ method: 'cash', methodRef: 'left over' })).toEqual({ method: 'cash', ref: null, account: 'cash' });
    expect(storedMethod({ method: 'mobile', methodRef: 'bKash 8N7A' })).toEqual({ method: 'mobile', ref: 'bKash 8N7A', account: 'bank' });
  });
});

describe('payment method on the money forms', () => {
  const payment = { unitId: id(5), invoiceIds: [id(1)], amount: '500', payer: { kind: 'person', id: id(9) } };

  it('defaults a receipt to cash with no reference', () => {
    const parsed = paymentCreateSchema.parse(payment);
    expect([parsed.method, parsed.methodRef]).toEqual(['cash', null]);
    expect(donationCreateSchema.parse({ donor: { kind: 'anonymous' }, amount: '50' }).method).toBe('cash');
  });

  it('needs a reference for a cheque or a mobile wallet, not for a bank deposit', () => {
    expect(issues(paymentCreateSchema.safeParse({ ...payment, method: 'cheque' }))).toEqual(['methodRef:method_ref_required']);
    expect(issues(donationCreateSchema.safeParse({ donor: { kind: 'anonymous' }, amount: '50', method: 'mobile', methodRef: '  ' }))).toEqual([
      'methodRef:method_ref_required',
    ]);
    expect(paymentCreateSchema.parse({ ...payment, method: 'bank' }).methodRef).toBeNull();
    expect(paymentCreateSchema.parse({ ...payment, method: 'cheque', methodRef: ' 004512 ' }).methodRef).toBe('004512');
  });

  it('refuses an unknown method and an overlong reference', () => {
    expect(paymentCreateSchema.safeParse({ ...payment, method: 'card' }).success).toBe(false);
    expect(paymentCreateSchema.safeParse({ ...payment, method: 'bank', methodRef: 'x'.repeat(101) }).success).toBe(false);
  });

  it('makes paying an expense or a payroll run name the method', () => {
    expect(expensePaySchema.safeParse({}).success).toBe(false);
    expect(expensePaySchema.parse({ method: 'cash' })).toEqual({ method: 'cash', methodRef: null });
    expect(issues(expensePaySchema.safeParse({ method: 'cheque' }))).toEqual(['methodRef:method_ref_required']);
    expect(issues(payrollPaySchema.safeParse({ method: 'mobile', headId: id(3) }))).toEqual(['methodRef:method_ref_required']);
    expect(payrollPaySchema.parse({ method: 'bank', headId: id(3) }).method).toBe('bank');
  });
});
