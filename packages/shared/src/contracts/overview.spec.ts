import { chartScale, lastMonths } from '../index.js';

describe('lastMonths', () => {
  it('counts back across a year end, oldest first', () => {
    expect(lastMonths('2026-02-28', 6)).toEqual(['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
    expect(lastMonths('2026-10-31', 1)).toEqual(['2026-10']);
  });
});

describe('chartScale', () => {
  it('picks lakh, thousand or taka and a round step that covers the largest amount', () => {
    const lakh = chartScale(['2410000.00', '2170000.50']);
    expect([lakh.unit, lakh.step, lakh.top]).toEqual(['lakh', 10, 30]);
    expect(lakh.toUnits('2170000.50')).toBeCloseTo(21.7, 2);
    const thousand = chartScale(['2200.60', '1300.25']);
    expect([thousand.unit, thousand.step, thousand.top]).toEqual(['thousand', 1, 3]);
    const taka = chartScale(['750.00']);
    expect([taka.unit, taka.step, taka.top]).toEqual(['taka', 250, 750]);
  });

  it('draws an empty axis for nothing at all', () => {
    expect(chartScale(['0.00', '0'])).toMatchObject({ unit: 'taka', step: 1, top: 3 });
    expect(chartScale([])).toMatchObject({ unit: 'taka', step: 1, top: 3 });
  });
});
