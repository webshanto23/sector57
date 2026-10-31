import type { LevelCounts, LocationLevel, LocationNode } from './contracts/index.js';

/** The tabs of a place on the property map; `inside` is what sits directly in it. */
export type LocationTab = 'inside' | 'owners' | 'documents' | 'details';

type Place = Pick<LocationNode, 'depth' | 'isUnit' | 'canOwn' | 'unitCount'>;

/** The levels below a depth, nearest first. */
const levelsBelow = (depth: number, levels: LocationLevel[]) =>
  levels.filter((level) => level.depth > depth).sort((a, b) => a.depth - b.depth);

/** A building over floors: the level right below it is the one right above the units. */
export function holdsFloors(location: Pick<Place, 'depth' | 'isUnit'>, levels: LocationLevel[]): boolean {
  const below = levelsBelow(location.depth, levels);
  return !location.isUnit && below[0]?.isUnitLevel === false && below[1]?.isUnitLevel === true;
}

/**
 * The tabs a place shows, most used first: what is inside it, then owners when its level
 * "can have owners" and the caller may see them, then documents and details.
 */
export function locationTabs(
  location: Pick<Place, 'isUnit' | 'canOwn'>,
  { canSeeOwners, canSeeDocuments }: { canSeeOwners: boolean; canSeeDocuments: boolean },
): LocationTab[] {
  return [
    ...(location.isUnit ? [] : (['inside'] as const)),
    ...(location.canOwn && canSeeOwners ? (['owners'] as const) : []),
    ...(canSeeDocuments ? (['documents'] as const) : []),
    'details',
  ];
}

/** The tab named in the URL, or the first one when this place does not have it. */
export function pickLocationTab(tabs: LocationTab[], requested: unknown): LocationTab {
  return tabs.find((tab) => tab === requested) ?? tabs[0]!;
}

export type InsideContent = { kind: 'floors' } | { kind: 'level'; level: LocationLevel } | { kind: 'mixed' };

/** What the "inside" tab is about, so it can be named after the level of the direct children. */
export function insideContent(
  location: Pick<Place, 'depth' | 'isUnit'>,
  children: Pick<LocationNode, 'levelId'>[],
  levels: LocationLevel[],
): InsideContent {
  if (holdsFloors(location, levels)) return { kind: 'floors' };
  const ids = new Set(children.map((child) => child.levelId));
  if (ids.size > 1) return { kind: 'mixed' };
  const level = ids.size === 1 ? levels.find((row) => ids.has(row.id)) : levelsBelow(location.depth, levels)[0];
  return level ? { kind: 'level', level } : { kind: 'mixed' };
}

/** One count per level below the place, top down. Level counts leave units out, so those come from the place. */
export function levelCountCards(location: Pick<Place, 'depth' | 'unitCount'>, levels: LocationLevel[], counts: LevelCounts) {
  const counted = new Map(counts.items.map((item) => [item.levelId, item.count]));
  return levelsBelow(location.depth, levels).map((level) => ({
    levelId: level.id,
    nameBn: level.nameBn,
    nameEn: level.nameEn,
    count: level.isUnitLevel ? location.unitCount : (counted.get(level.id) ?? 0),
  }));
}
