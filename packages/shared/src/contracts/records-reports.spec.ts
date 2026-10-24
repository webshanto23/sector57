import { REPORT_KEYS } from './reports.js';
import { membersReportQuery, occupancyFiguresOf, sharePercent } from './records-reports.js';

describe('sharePercent', () => {
  it('rounds down, and is 0 of nothing', () => {
    expect(sharePercent(2, 3)).toBe(66);
    expect(sharePercent(3, 3)).toBe(100);
    expect(sharePercent(0, 0)).toBe(0);
  });
});

describe('occupancyFiguresOf', () => {
  it('adds the units up and counts owner-occupied and rented as occupied', () => {
    expect(occupancyFiguresOf(2, 1, 1)).toEqual({ units: 4, ownerOccupied: 2, rented: 1, vacant: 1, occupiedPercent: 75 });
    expect(occupancyFiguresOf(0, 0, 0)).toEqual({ units: 0, ownerOccupied: 0, rented: 0, vacant: 0, occupiedPercent: 0 });
  });
});

describe('records reports', () => {
  it('are listed with the finance ones', () => {
    expect(REPORT_KEYS).toEqual(expect.arrayContaining(['occupancy', 'members', 'renters']));
  });

  it('take a plain date range for members', () => {
    expect(membersReportQuery.safeParse({ from: '2026-01-01', to: '2026-10-24' }).success).toBe(true);
    expect(membersReportQuery.safeParse({ from: '2026-13-01' }).success).toBe(false);
  });
});
