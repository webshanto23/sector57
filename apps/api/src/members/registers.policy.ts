import { asciiDigits, type HoldingCount, type MemberFee } from '@s57/shared';

/** One current ownership with its place and level, as the registers read it. */
export type OwnedRow = {
  party_id: string;
  location_id: string;
  name: string;
  path: string;
  is_unit: boolean;
  level_id: string;
  level_bn: string;
  level_en: string | null;
  depth: number;
};

/** Places owned per level, top level first; a place owned through two rows counts once. */
export function holdingsOf(rows: readonly OwnedRow[]): HoldingCount[] {
  const levels = new Map<string, { depth: number; holding: HoldingCount; places: Set<string> }>();
  for (const row of rows) {
    const level = levels.get(row.level_id) ?? {
      depth: row.depth,
      holding: { levelId: row.level_id, nameBn: row.level_bn, nameEn: row.level_en, count: 0 },
      places: new Set<string>(),
    };
    level.places.add(row.location_id);
    level.holding.count = level.places.size;
    levels.set(row.level_id, level);
  }
  return [...levels.values()].sort((a, b) => a.depth - b.depth).map((level) => level.holding);
}

/** The distinct places of one party, in the order given (the first is shown, the rest counted). */
export function placesOf(rows: readonly OwnedRow[]): OwnedRow[] {
  return [...new Map(rows.map((row) => [row.location_id, row])).values()];
}

/**
 * A search read as a membership ID: the code part in ASCII digits, upper case (`S15-000123`,
 * or any piece of it), and the member number when the search is only digits (`123`, `০০১২৩`).
 */
export function membershipIdTerm(q: string): { code: string; number: number | null } {
  const code = asciiDigits(q).trim().toUpperCase();
  return { code, number: /^\d{1,9}$/.test(code) ? Number(code) : null };
}

/** A membership's bills as the members register reads them (void bills left out). */
export type FeeRow = { fee_bills: number; fee_open: number; fee_owed: string | null; fee_open_bill: string | null };

/** Paid once there are bills and none is open; unpaid while one is; not billed before the first. */
export function feeOf(row: FeeRow): MemberFee {
  if (row.fee_bills === 0) return { state: 'not_billed', owed: null, openBillId: null };
  if (row.fee_open === 0) return { state: 'paid', owed: null, openBillId: null };
  return { state: 'unpaid', owed: row.fee_owed, openBillId: row.fee_open_bill };
}
