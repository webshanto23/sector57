import { addDays, arrearsBucket, auditListQuery, daysBetween, percentOf } from '../index.js';

describe('percentOf', () => {
  it('rounds down on paisa and never divides by zero', () => {
    expect(percentOf('0.10', '0.30')).toBe(33);
    expect(percentOf('1500', '1500.00')).toBe(100);
    expect(percentOf('0', '0')).toBe(0);
    expect(percentOf('5', '0')).toBe(0);
    expect(percentOf('1999.99', '2000')).toBe(99);
  });
});

describe('arrears buckets', () => {
  it('counts whole days across months and leap years', () => {
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2026-10-12', '2026-10-12')).toBe(0);
  });

  it('moves a day across months and years', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('puts a bill in 1–30, 31–90 or more than 90 days, and none before it is due', () => {
    expect(arrearsBucket('2026-10-12', '2026-10-12')).toBeNull();
    expect(arrearsBucket('2026-10-13', '2026-10-12')).toBeNull();
    expect(arrearsBucket('2026-10-11', '2026-10-12')).toBe('d30');
    expect(arrearsBucket('2026-09-12', '2026-10-12')).toBe('d30');
    expect(arrearsBucket('2026-09-11', '2026-10-12')).toBe('d90');
    expect(arrearsBucket('2026-07-14', '2026-10-12')).toBe('d90');
    expect(arrearsBucket('2026-07-13', '2026-10-12')).toBe('older');
  });
});

describe('audit filters', () => {
  it('trims the free-text filters and refuses a bad date', () => {
    expect(auditListQuery.parse({ entityType: '  expense ', action: 'pay' })).toMatchObject({ entityType: 'expense', action: 'pay', page: 1 });
    expect(auditListQuery.safeParse({ from: '2026-13-01' }).success).toBe(false);
    expect(auditListQuery.safeParse({ userId: 'nope' }).success).toBe(false);
  });
});
