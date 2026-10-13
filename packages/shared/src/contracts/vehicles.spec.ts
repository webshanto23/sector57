import { documentPeriod, formatDocumentNo } from '../fiscal.js';
import {
  DEFAULT_STICKER_SETTINGS,
  formatStickerNo,
  parkingAssignSchema,
  regNoKey,
  renewalValidUntil,
  stickerSettingsOf,
  stickerSettingsSchema,
  stickerStateOf,
  stickerValidUntil,
  vehicleCreateSchema,
} from './vehicles.js';

const id = '7c4b0a5e-9a4f-4f37-8a51-0b6f3d2f1c11';

describe('vehicle contracts', () => {
  it('matches registration numbers in either digit form, with or without spaces and dashes', () => {
    const key = regNoKey('ঢাকা মেট্রো-গ ১২-৩৪৫৬');
    expect(key).toBe('ঢাকামেট্রোগ123456');
    expect(regNoKey('  ঢাকা মেট্রো গ 12 3456 ')).toBe(key);
    expect(regNoKey('dhaka metro-ga 12–3456')).toBe('DHAKAMETROGA123456');
    expect(regNoKey('Dhaka.Metro/Ga_12-3456')).toBe('DHAKAMETROGA123456');
  });

  it('needs a registration number with something left once cleaned', () => {
    const base = { kind: 'car', unitId: id, personId: id };
    expect(vehicleCreateSchema.safeParse({ ...base, regNo: ' - . ' }).success).toBe(false);
    const parsed = vehicleCreateSchema.parse({ ...base, regNo: 'ঢাকা মেট্রো-গ ১২-৩৪৫৬', make: '' });
    expect(parsed.make).toBeNull();
    expect(vehicleCreateSchema.safeParse({ ...base, regNo: 'ঢাকা ১২', kind: 'truck' }).success).toBe(false);
  });

  it('reads the sticker settings over the defaults', () => {
    expect(stickerSettingsOf(undefined)).toEqual(DEFAULT_STICKER_SETTINGS);
    expect(stickerSettingsOf({ prefix: 'স১৫', validity: 'yearly', fee: { chargeTypeId: id, amount: '0' } })).toEqual({
      prefix: 'স১৫',
      validity: 'calendar',
      fee: null,
    });
    expect(stickerSettingsOf({ prefix: 'S 15', validity: 'fiscal', fee: { chargeTypeId: id, amount: '300' } })).toEqual({
      prefix: 'STK',
      validity: 'fiscal',
      fee: { chargeTypeId: id, amount: '300.00' },
    });
    expect(stickerSettingsSchema.safeParse({ prefix: 'S15', validity: 'calendar', fee: null, extra: 1 }).success).toBe(false);
  });

  it('numbers stickers with the prefix, never restarting', () => {
    expect(formatStickerNo('S15', 7)).toBe('S15-0007');
    expect(formatStickerNo('S15', 12345)).toBe('S15-12345');
    expect(documentPeriod('sticker', '2026-10-13', 7)).toBe('');
    expect(formatDocumentNo('sticker', '', 3)).toBe('STK-0003');
  });

  it('works out the last valid day by calendar or fiscal year', () => {
    expect(stickerValidUntil('2026-10-13', 'calendar', 7)).toBe('2026-12-31');
    expect(stickerValidUntil('2026-12-20', 'calendar', 7, true)).toBe('2027-12-31');
    expect(stickerValidUntil('2026-10-13', 'fiscal', 7)).toBe('2027-06-30');
    expect(stickerValidUntil('2026-05-01', 'fiscal', 7)).toBe('2026-06-30');
    expect(stickerValidUntil('2026-05-01', 'fiscal', 7, true)).toBe('2027-06-30');
  });

  it('renews into the year after the old sticker, or this year when it ran out long ago', () => {
    expect(renewalValidUntil('2026-12-31', '2026-12-15', 'calendar', 7)).toBe('2027-12-31');
    expect(renewalValidUntil('2026-12-31', '2027-01-10', 'calendar', 7)).toBe('2027-12-31');
    expect(renewalValidUntil('2024-12-31', '2026-10-13', 'calendar', 7)).toBe('2026-12-31');
    expect(renewalValidUntil('2026-06-30', '2026-06-01', 'fiscal', 7)).toBe('2027-06-30');
  });

  it('derives expired from the last day', () => {
    expect(stickerStateOf('active', '2026-12-31', '2026-12-31')).toBe('active');
    expect(stickerStateOf('active', '2026-12-31', '2027-01-01')).toBe('expired');
    expect(stickerStateOf('revoked', '2026-12-31', '2027-01-01')).toBe('revoked');
  });

  it('gives a parking slot to a unit or a vehicle, never both', () => {
    expect(parkingAssignSchema.parse({})).toEqual({ unitId: null, vehicleId: null });
    expect(parkingAssignSchema.safeParse({ unitId: id }).success).toBe(true);
    expect(parkingAssignSchema.safeParse({ unitId: id, vehicleId: id }).success).toBe(false);
  });
});
