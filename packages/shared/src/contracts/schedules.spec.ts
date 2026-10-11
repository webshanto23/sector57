import { addMonths, duePeriods, nextRunAfter, periodEndOf, rateFor, resumeFrom, scheduleInputSchema } from './schedules.js';

const id = (n: number) => `3f0e7a52-9a0c-4a5e-9a52-7b2f8d1c0a${String(n).padStart(2, '0')}`;

describe('schedule months', () => {
  it('moves by whole months across years', () => {
    expect(addMonths('2026-11-01', 3)).toBe('2027-02-01');
    expect(addMonths('2026-10-17', 0)).toBe('2026-10-01');
    expect(periodEndOf('2026-10-01', 3)).toBe('2026-12-31');
    expect(periodEndOf('2028-02-01', 1)).toBe('2028-02-29');
  });

  it('bills every period due up to the month, oldest first, and catches up', () => {
    const monthly = { nextRunOn: '2026-08-01', frequencyMonths: 1, endsOn: null };
    expect(duePeriods(monthly, '2026-10-01')).toEqual(['2026-08-01', '2026-09-01', '2026-10-01']);
    expect(nextRunAfter(monthly, ['2026-08-01', '2026-09-01', '2026-10-01'])).toBe('2026-11-01');
    expect(duePeriods(monthly, '2026-07-01')).toEqual([]);
  });

  it('keeps the rhythm of a quarterly schedule', () => {
    const quarterly = { nextRunOn: '2026-07-01', frequencyMonths: 3, endsOn: null };
    expect(duePeriods(quarterly, '2026-11-01')).toEqual(['2026-07-01', '2026-10-01']);
    expect(nextRunAfter(quarterly, ['2026-07-01', '2026-10-01'])).toBe('2027-01-01');
  });

  it('stops at the end month and bills a one-off once', () => {
    const ending = { nextRunOn: '2026-10-01', frequencyMonths: 1, endsOn: '2026-11-30' };
    expect(duePeriods(ending, '2027-03-01')).toEqual(['2026-10-01', '2026-11-01']);
    expect(nextRunAfter(ending, ['2026-10-01', '2026-11-01'])).toBeNull();
    const once = { nextRunOn: '2026-10-01', frequencyMonths: null, endsOn: null };
    expect(duePeriods(once, '2026-12-01')).toEqual(['2026-10-01']);
    expect(nextRunAfter(once, ['2026-10-01'])).toBeNull();
    expect(nextRunAfter(once, [])).toBe('2026-10-01');
  });

  it('skips the months of a pause on resume, keeping the rhythm', () => {
    const base = { startsOn: '2026-01-01', endsOn: null };
    expect(resumeFrom({ ...base, nextRunOn: '2026-04-01', frequencyMonths: 1 }, '2026-10-01')).toBe('2026-10-01');
    expect(resumeFrom({ ...base, nextRunOn: '2026-04-01', frequencyMonths: 3 }, '2026-11-01')).toBe('2027-01-01');
    expect(resumeFrom({ ...base, nextRunOn: '2026-12-01', frequencyMonths: 1 }, '2026-10-01')).toBe('2026-12-01');
    expect(resumeFrom({ ...base, endsOn: '2026-06-30', nextRunOn: '2026-04-01', frequencyMonths: 1 }, '2026-10-01')).toBeNull();
  });
});

describe('rateFor', () => {
  const rates = new Map([
    [id(1), '1200.00'],
    [id(3), '2000.00'],
  ]);

  it('takes the nearest rate above the unit, else the schedule amount', () => {
    expect(rateFor([id(1), id(2), id(9)], rates, '1500.00')).toEqual({ amount: '1200.00', from: id(1) });
    expect(rateFor([id(1), id(3), id(9)], rates, '1500.00')).toEqual({ amount: '2000.00', from: id(3) });
    expect(rateFor([id(4), id(5)], rates, '1500.00')).toEqual({ amount: '1500.00', from: null });
  });
});

describe('scheduleInputSchema', () => {
  const base = {
    nameBn: 'সার্ভিস চার্জ',
    chargeTypeId: id(1),
    amount: '১,৫০০',
    rates: [{ locationId: id(2), amount: '2000' }],
    frequencyMonths: 1,
    generation: 'auto',
    scopeLocationId: null,
    unitTypes: [],
    startMonth: '2026-11',
    endMonth: null,
    dueDays: 15,
  };

  it('reads Bangla amounts and keeps rates per location', () => {
    expect(scheduleInputSchema.parse(base)).toMatchObject({ amount: '1500.00', rates: [{ amount: '2000.00' }] });
  });

  it('refuses an end before the start, a location twice, or a strange frequency', () => {
    expect(scheduleInputSchema.safeParse({ ...base, endMonth: '2026-10' }).success).toBe(false);
    expect(scheduleInputSchema.safeParse({ ...base, rates: [...base.rates, { locationId: id(2), amount: '1' }] }).success).toBe(false);
    expect(scheduleInputSchema.safeParse({ ...base, frequencyMonths: 2 }).success).toBe(false);
    expect(scheduleInputSchema.safeParse({ ...base, frequencyMonths: null }).success).toBe(true);
  });
});
