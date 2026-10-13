import { lineTotals, monthBounds, payrollActions, payslipEditSchema, payslipFigures, payslipNet, stintInMonth } from './payroll.js';

const none = { present: 0, halfDay: 0, absent: 0 };

describe('payroll pay rules', () => {
  it('knows each month, leap years included', () => {
    expect(monthBounds('2026-02')).toEqual({ first: '2026-02-01', last: '2026-02-28', days: 28 });
    expect(monthBounds('2028-02').days).toBe(29);
    expect(monthBounds('2026-10')).toEqual({ first: '2026-10-01', last: '2026-10-31', days: 31 });
  });

  it('counts only the stint’s days in the month', () => {
    expect(stintInMonth('2026-10', '2025-01-01', null)).toEqual({ from: '2026-10-01', to: '2026-10-31', days: 31 });
    expect(stintInMonth('2026-10', '2026-10-21', null)).toEqual({ from: '2026-10-21', to: '2026-10-31', days: 11 });
    expect(stintInMonth('2026-10', '2026-01-01', '2026-10-10')?.days).toBe(10);
    expect(stintInMonth('2026-10', '2026-11-01', null)).toBeNull();
    expect(stintInMonth('2026-10', '2026-01-01', '2026-09-30')).toBeNull();
  });

  it('pays monthly staff for the stint, less absent and half days, to the paisa', () => {
    expect(payslipFigures('permanent', '9000.00', 30, 30, none)).toEqual({ base: '9000.00', attendanceDeduction: '0.00' });
    // 10000 × 11 / 31 = 3548.387… → 3548.39; one absent day 322.580… → 322.58; a half day 161.29.
    expect(payslipFigures('contract', '10000.00', 31, 11, { present: 8, halfDay: 0, absent: 1 })).toEqual({ base: '3548.39', attendanceDeduction: '322.58' });
    expect(payslipFigures('permanent', '10000.00', 31, 31, { present: 0, halfDay: 1, absent: 0 }).attendanceDeduction).toBe('161.29');
    // Never more deducted than earned.
    expect(payslipFigures('permanent', '3000.00', 30, 2, { present: 0, halfDay: 0, absent: 2 }).attendanceDeduction).toBe('200.00');
    expect(payslipFigures('permanent', '3000.00', 30, 1, { present: 0, halfDay: 0, absent: 1 })).toEqual({ base: '100.00', attendanceDeduction: '100.00' });
  });

  it('pays daily workers by days present, half days at a half', () => {
    expect(payslipFigures('daily', '650.00', 31, 31, { present: 20, halfDay: 3, absent: 4 })).toEqual({ base: '13975.00', attendanceDeduction: '0.00' });
    expect(payslipFigures('daily', '0.01', 31, 31, { present: 0, halfDay: 1, absent: 0 }).base).toBe('0.01');
    expect(payslipFigures('daily', '0.00', 31, 31, { present: 25, halfDay: 0, absent: 0 }).base).toBe('0.00');
  });

  it('adds lines exactly and refuses a net below zero', () => {
    const lines = [
      { kind: 'allowance' as const, amount: '0.10' },
      { kind: 'allowance' as const, amount: '0.20' },
      { kind: 'deduction' as const, amount: '500.00' },
    ];
    expect(lineTotals(lines)).toEqual({ allowances: '0.30', deductions: '500.00' });
    expect(lineTotals([])).toEqual({ allowances: '0.00', deductions: '0.00' });
    expect(payslipNet('9000.00', '300.00', '0.30', '500.00')).toBe('8200.30');
    expect(payslipNet('100.00', '0.00', '0.00', '100.00')).toBe('0.00');
    expect(payslipNet('100.00', '0.00', '0.00', '100.01')).toBeNull();
  });

  it('never lets the preparer approve, and pays and voids only with the expense grants', () => {
    const all = { edit: true, approve: true, expensesCreate: true, expensesApprove: true };
    expect(payrollActions({ status: 'draft', preparedBy: 'u1' }, 'u1', all)).toEqual({ edit: true, approve: false, pay: false, void: true });
    expect(payrollActions({ status: 'draft', preparedBy: 'u1' }, 'u2', all).approve).toBe(true);
    expect(payrollActions({ status: 'approved', preparedBy: 'u1' }, 'u1', all)).toEqual({ edit: false, approve: false, pay: true, void: true });
    expect(payrollActions({ status: 'approved', preparedBy: 'u1' }, 'u1', { ...all, expensesCreate: false }).pay).toBe(false);
    expect(payrollActions({ status: 'paid', preparedBy: 'u1' }, 'u2', { ...all, expensesApprove: false }).void).toBe(false);
    expect(payrollActions({ status: 'void', preparedBy: 'u1' }, 'u2', all)).toEqual({ edit: false, approve: false, pay: false, void: false });
  });

  it('cleans payslip edits', () => {
    const parsed = payslipEditSchema.parse({
      fundId: '7d3c2a4e-1f0b-4c8d-9e6a-5b4c3d2e1f00',
      note: '  ',
      lines: [{ kind: 'allowance', labelBn: ' ঈদ বোনাস ', amount: '৳১,০০০' }],
    });
    expect(parsed.note).toBeNull();
    expect(parsed.lines[0]).toMatchObject({ labelBn: 'ঈদ বোনাস', labelEn: null, amount: '1000.00' });
    expect(payslipEditSchema.safeParse({ fundId: '7d3c2a4e-1f0b-4c8d-9e6a-5b4c3d2e1f00', lines: [{ kind: 'deduction', labelBn: 'x', amount: '0' }] }).success).toBe(false);
  });
});
