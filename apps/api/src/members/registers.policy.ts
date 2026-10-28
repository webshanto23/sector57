import type { HoldingCount } from '@s57/shared';

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
