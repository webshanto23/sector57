import { endOfToday, isoDate, todayDate } from './dates.js';

describe('todayDate', () => {
  it('uses the Dhaka calendar day', () => {
    // 19:30 UTC on 8 Oct is 01:30 on 9 Oct in Dhaka (UTC+6).
    expect(isoDate(todayDate(new Date('2026-10-08T19:30:00Z')))).toBe('2026-10-09');
    expect(isoDate(todayDate(new Date('2026-10-08T17:30:00Z')))).toBe('2026-10-08');
  });
});

describe('endOfToday', () => {
  it('is the next Dhaka midnight', () => {
    // 01:30 on 9 Oct in Dhaka ends at 18:00 UTC on 9 Oct.
    expect(endOfToday(new Date('2026-10-08T19:30:00Z')).toISOString()).toBe('2026-10-09T18:00:00.000Z');
    expect(endOfToday(new Date('2026-10-08T17:59:59Z')).toISOString()).toBe('2026-10-08T18:00:00.000Z');
  });
});
