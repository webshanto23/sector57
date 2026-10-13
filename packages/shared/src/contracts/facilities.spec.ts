import {
  assetCreateSchema,
  assetNumberOf,
  assetStatusMoves,
  assetStatusSchema,
  monthsAfter,
  upkeepState,
} from './facilities.js';

describe('facilities contracts', () => {
  it('moves a day by whole months, keeping the day where it exists', () => {
    expect(monthsAfter('2026-10-13', 1)).toBe('2026-11-13');
    expect(monthsAfter('2026-10-13', 3)).toBe('2027-01-13');
    expect(monthsAfter('2026-01-31', 1)).toBe('2026-02-28');
    expect(monthsAfter('2028-01-31', 1)).toBe('2028-02-29');
    expect(monthsAfter('2026-08-31', 6)).toBe('2027-02-28');
    expect(monthsAfter('2026-12-15', 12)).toBe('2027-12-15');
  });

  it('says whether upkeep is overdue, due soon or fine', () => {
    expect(upkeepState('2026-10-12', '2026-10-13')).toBe('overdue');
    expect(upkeepState('2026-10-13', '2026-10-13')).toBe('due');
    expect(upkeepState('2026-11-12', '2026-10-13')).toBe('due');
    expect(upkeepState('2026-11-13', '2026-10-13')).toBe('ok');
    expect(upkeepState('2026-10-20', '2026-10-13', 0)).toBe('ok');
  });

  it('lists the status changes and what each needs', () => {
    expect(assetStatusMoves('in_use')).toEqual([
      { to: 'repair', needs: 'edit' },
      { to: 'retired', needs: 'approve' },
      { to: 'lost', needs: 'approve' },
    ]);
    expect(assetStatusMoves('repair')[0]).toEqual({ to: 'in_use', needs: 'edit' });
    expect(assetStatusMoves('retired')).toEqual([{ to: 'in_use', needs: 'approve' }]);
    expect(assetStatusMoves('lost')).toEqual([{ to: 'in_use', needs: 'approve' }]);
  });

  it('reads an asset number in its usual forms', () => {
    expect(assetNumberOf('AST-0012')).toBe(12);
    expect(assetNumberOf('ast12')).toBe(12);
    expect(assetNumberOf('12')).toBe(12);
    expect(assetNumberOf('পাম্প')).toBeNull();
    expect(assetNumberOf('AST-')).toBeNull();
  });

  it('needs exactly one place, and a warranty no earlier than the purchase', () => {
    const base = { nameBn: 'পানির পাম্প', category: 'পাম্প' };
    const facilityId = '2b0f9a3e-4d4a-4f5e-9a51-0f4a8f0a1c11';
    const locationId = '7f3b2c1d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
    expect(assetCreateSchema.safeParse({ ...base, place: { facilityId } }).success).toBe(true);
    expect(assetCreateSchema.safeParse({ ...base, place: {} }).success).toBe(false);
    expect(assetCreateSchema.safeParse({ ...base, place: { facilityId, locationId } }).success).toBe(false);
    expect(
      assetCreateSchema.safeParse({ ...base, place: { locationId }, purchasedOn: '2026-05-01', warrantyUntil: '2026-04-30' }).success,
    ).toBe(false);
  });

  it('needs a day and a reason to retire or lose an asset', () => {
    expect(assetStatusSchema.safeParse({ status: 'repair' }).success).toBe(true);
    expect(assetStatusSchema.safeParse({ status: 'retired', on: '2026-10-01' }).success).toBe(false);
    expect(assetStatusSchema.safeParse({ status: 'lost', on: '2026-10-01', reason: 'চুরি' }).success).toBe(true);
  });
});
