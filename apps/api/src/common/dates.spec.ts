import { isoDate, todayDate } from './dates.js';

describe('todayDate', () => {
  it('uses the Dhaka calendar day', () => {
    // 19:30 UTC on 8 Oct is 01:30 on 9 Oct in Dhaka (UTC+6).
    expect(isoDate(todayDate(new Date('2026-10-08T19:30:00Z')))).toBe('2026-10-09');
    expect(isoDate(todayDate(new Date('2026-10-08T17:30:00Z')))).toBe('2026-10-08');
  });
});
