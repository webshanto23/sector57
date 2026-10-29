import type { CombineProblem } from '@s57/shared';

/** What the combine check needs to know about one unit. */
export type CombineFacts = {
  id: string;
  /** Its own place (a storey, or the building when it has none). */
  parentId: string;
  /** The place above that (the building, for a unit on a storey). */
  grandparentId: string | null;
  active: boolean;
  /** Current owners on the unit itself, as `kind:id:share`. */
  owners: string[];
  openBills: number;
  openTenancy: boolean;
  occupants: number;
  /** Vehicles and parking slots still on it. */
  vehicles: number;
};

const sameOwners = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/**
 * Why `keep` and `merge` can't be joined, or null when they can. All must be active, side by
 * side (one floor, or floors of one building), with the same owners; the retired ones must
 * have no unpaid bill, open tenancy, residents, vehicle or parking slot. Join only units made
 * into one; an office that just uses several flats keeps them separate.
 */
export function combineProblem(keep: CombineFacts, merge: CombineFacts[]): CombineProblem | null {
  const all = [keep, ...merge];
  if (all.some((unit) => !unit.active)) return 'unit_inactive';
  const oneParent = all.every((unit) => unit.parentId === keep.parentId);
  const oneBuilding = keep.grandparentId !== null && all.every((unit) => unit.grandparentId === keep.grandparentId);
  if (!oneParent && !oneBuilding) return 'not_side_by_side';
  if (merge.some((unit) => !sameOwners(unit.owners, keep.owners))) return 'owners_differ';
  if (merge.some((unit) => unit.openBills > 0)) return 'open_bills';
  if (merge.some((unit) => unit.openTenancy)) return 'open_tenancy';
  if (merge.some((unit) => unit.occupants > 0)) return 'occupants';
  if (merge.some((unit) => unit.vehicles > 0)) return 'vehicles';
  return null;
}

/** The kept unit's new size: the sum when every size is known, else its own. */
export function combinedSize(keep: string | null, merge: (string | null)[]): string | null {
  if (keep === null || merge.some((size) => size === null)) return keep;
  // Sizes have two decimals; add in hundredths to stay exact.
  const hundredths = [keep, ...(merge as string[])].reduce((sum, size) => sum + Math.round(Number(size) * 100), 0);
  return (hundredths / 100).toFixed(2);
}

/** The storeys the kept unit covers after the combine: its own links plus the others' places and links, minus its own place. */
export function coveredAfter(keep: { parentId: string; covers: string[] }, merge: { parentId: string; covers: string[] }[]): string[] {
  const ids = new Set([...keep.covers, ...merge.flatMap((unit) => [unit.parentId, ...unit.covers])]);
  ids.delete(keep.parentId);
  return [...ids];
}
