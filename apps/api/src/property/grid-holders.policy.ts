import type { PartyName, UnitHolder } from '@s57/shared';

/** An owner or renter with who they are: `person:<id>` or `organisation:<id>`. */
export type Party = PartyName & { key: string };

/**
 * The holder shown on each unit of a building grid: its renter, else its own owner. Each
 * holder also counts the units of the building the same party holds (as owner or renter),
 * so flats taken by one office all show "ABC Ltd · 3 units". Units the caller may not see
 * people on are null and count for nobody.
 */
export function gridHolders(parties: Map<string, { owners: Party[] | null; renters: Party[] | null }>): Map<string, UnitHolder | null> {
  const unitsOf = new Map<string, Set<string>>();
  for (const [unitId, { owners, renters }] of parties) {
    for (const party of [...(owners ?? []), ...(renters ?? [])]) {
      unitsOf.set(party.key, (unitsOf.get(party.key) ?? new Set()).add(unitId));
    }
  }
  const holders = new Map<string, UnitHolder | null>();
  for (const [unitId, { owners, renters }] of parties) {
    const role = renters?.length ? 'renter' : owners?.length ? 'owner' : null;
    const list = role === 'renter' ? renters! : role === 'owner' ? owners! : [];
    const first = list[0];
    holders.set(unitId, first ? { name: first.name, nameEn: first.nameEn, role: role!, more: list.length - 1, units: unitsOf.get(first.key)!.size } : null);
  }
  return holders;
}
