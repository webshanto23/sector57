import type { RemovalProblem } from '@s57/shared';

/** A place or unit picked for removal, or a unit inside a picked place. */
export type RemovalNode = {
  id: string;
  name: string;
  isUnit: boolean;
  parentId: string | null;
  /** Joined over floors, joined into another unit, or holding units joined into it. */
  joined: boolean;
};

export type RemovalPlan = { unitIds: string[]; placeIds: string[] } | { problem: RemovalProblem; names: string[] };

/**
 * What removing `picked` takes with it: a picked place goes with the units straight inside
 * it (a floor with its flats), never with places inside it. Joined units are history and
 * are never removed this way. `inside` holds the picked places' children.
 */
export function removalPlan(picked: RemovalNode[], inside: RemovalNode[]): RemovalPlan {
  const pickedIds = new Set(picked.map((node) => node.id));
  const places = picked.filter((node) => !node.isUnit);
  const deeper = inside.filter((node) => !node.isUnit && !pickedIds.has(node.id));
  if (deeper.length > 0) {
    const owners = new Set(deeper.map((node) => node.parentId));
    return { problem: 'has_places', names: places.filter((node) => owners.has(node.id)).map((node) => node.name) };
  }
  const units = new Map<string, RemovalNode>();
  for (const node of [...picked, ...inside]) if (node.isUnit) units.set(node.id, node);
  const joined = [...units.values()].filter((node) => node.joined);
  if (joined.length > 0) return { problem: 'joined', names: joined.map((node) => node.name) };
  return { unitIds: [...units.keys()], placeIds: places.map((node) => node.id) };
}
