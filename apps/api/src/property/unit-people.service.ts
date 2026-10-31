import { Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  asciiDigits,
  digitVariants,
  RENTED_STATUSES,
  type OwnerLives,
  type PartyName,
  type UnitMissing,
  type UnitOwnerLevel,
} from '@s57/shared';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Party } from './grid-holders.policy.js';
import { pathIds, scopeSql } from './tree.service.js';

export type UnitPeople = { owners: UnitOwnerLevel[] | null; renters: PartyName[] | null };
/** A unit's own owners and its renters with who they are (`kind:id`); null where the caller may not view them. */
export type UnitParties = { owners: Party[] | null; renters: Party[] | null };

const partySelect = {
  persons: { select: { full_name: true, full_name_en: true } },
  organisations: { select: { name: true } },
} as const;

type PartyRow = { persons: { full_name: string; full_name_en: string | null } | null; organisations: { name: string } | null };

const nameOf = (row: PartyRow): PartyName | null =>
  row.persons ? { name: row.persons.full_name, nameEn: row.persons.full_name_en } : row.organisations ? { name: row.organisations.name, nameEn: null } : null;

/** The party select with ids, so one person or organisation can be told apart from a namesake. */
const partyIdSelect = {
  persons: { select: { id: true, full_name: true, full_name_en: true } },
  organisations: { select: { id: true, name: true } },
} as const;

const partyOf = (row: { persons: PartyRow['persons'] & { id: string } | null; organisations: { id: string; name: string } | null }): Party | null => {
  const name = nameOf(row);
  if (!name) return null;
  return { ...name, key: row.persons ? `person:${row.persons.id}` : `organisation:${row.organisations!.id}` };
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

/**
 * Who owns and rents units, for the units list: owners at every level of a unit's chain
 * and the current renter, each only where the caller may view ownerships or tenancies.
 */
@Injectable()
export class UnitPeopleService {
  constructor(private readonly prisma: PrismaService) {}

  /** Whether the unit at `path` has a current owner, on itself or a place above it. */
  async hasOwner(societyId: string, path: string): Promise<boolean> {
    return (await this.prisma.ownerships.count({ where: { society_id: societyId, location_id: { in: pathIds(path) }, end_date: null } })) > 0;
  }

  /** Current owners of each place, largest share first; null where the caller may not view ownerships. */
  async ownersOf(actor: Actor, places: { id: string; path: string }[]): Promise<Map<string, PartyName[] | null>> {
    const owning = places.filter((place) => actor.access.can('view', 'ownerships', { path: place.path }));
    const rows = owning.length
      ? await this.prisma.ownerships.findMany({
          where: { society_id: actor.societyId, location_id: { in: owning.map((place) => place.id) }, end_date: null },
          select: { location_id: true, ...partySelect },
          orderBy: [{ share_percent: 'desc' }, { start_date: 'asc' }, { id: 'asc' }],
        })
      : [];
    const owners = new Map<string, PartyName[] | null>(places.map((place) => [place.id, null]));
    for (const place of owning) owners.set(place.id, []);
    for (const row of rows) {
      const name = nameOf(row);
      if (name) owners.get(row.location_id)!.push(name);
    }
    return owners;
  }

  /** Each unit's own owners (largest share first) and current renters, for the building grid. */
  async partiesOf(actor: Actor, units: { id: string; path: string }[]): Promise<Map<string, UnitParties>> {
    const owning = units.filter((unit) => actor.access.can('view', 'ownerships', { path: unit.path })).map((unit) => unit.id);
    const renting = units.filter((unit) => actor.access.can('view', 'tenancies', { path: unit.path })).map((unit) => unit.id);
    const [ownerships, tenancies] = await Promise.all([
      owning.length
        ? this.prisma.ownerships.findMany({
            where: { society_id: actor.societyId, location_id: { in: owning }, end_date: null },
            select: { location_id: true, ...partyIdSelect },
            orderBy: [{ share_percent: 'desc' }, { start_date: 'asc' }, { id: 'asc' }],
          })
        : [],
      renting.length
        ? this.prisma.tenancies.findMany({
            where: { society_id: actor.societyId, unit_id: { in: renting }, status: { in: [...RENTED_STATUSES] } },
            select: { unit_id: true, ...partyIdSelect },
            orderBy: [{ start_date: 'asc' }, { id: 'asc' }],
          })
        : [],
    ]);
    const parties = new Map<string, UnitParties>(units.map((unit) => [unit.id, { owners: null, renters: null }]));
    for (const id of owning) parties.get(id)!.owners = [];
    for (const id of renting) parties.get(id)!.renters = [];
    for (const row of ownerships) {
      const party = partyOf(row);
      if (party) parties.get(row.location_id)!.owners!.push(party);
    }
    for (const row of tenancies) {
      const party = partyOf(row);
      if (party) parties.get(row.unit_id)!.renters!.push(party);
    }
    return parties;
  }

  /** Owners and renters of a page of units, by unit id. */
  async forUnits(actor: Actor, units: { id: string; path: string }[]): Promise<Map<string, UnitPeople>> {
    const owning = units.filter((unit) => actor.access.can('view', 'ownerships', { path: unit.path }));
    const renting = units.filter((unit) => actor.access.can('view', 'tenancies', { path: unit.path }));
    const locationIds = [...new Set(owning.flatMap((unit) => pathIds(unit.path)))];
    const [ownerships, tenancies] = await Promise.all([
      locationIds.length
        ? this.prisma.ownerships.findMany({
            where: { society_id: actor.societyId, location_id: { in: locationIds }, end_date: null },
            select: { location_id: true, ...partySelect, locations: { select: { location_levels: { select: { name_bn: true, name_en: true } } } } },
            // The largest share first, then the earliest.
            orderBy: [{ share_percent: 'desc' }, { start_date: 'asc' }, { id: 'asc' }],
          })
        : [],
      renting.length
        ? this.prisma.tenancies.findMany({
            where: { society_id: actor.societyId, unit_id: { in: renting.map((unit) => unit.id) }, status: { in: [...RENTED_STATUSES] } },
            select: { unit_id: true, ...partySelect },
            orderBy: [{ start_date: 'asc' }, { id: 'asc' }],
          })
        : [],
    ]);

    const levels = new Map<string, Omit<UnitOwnerLevel, 'isUnit'>>();
    for (const row of ownerships) {
      const name = nameOf(row);
      if (!name) continue;
      const level = levels.get(row.location_id) ?? {
        locationId: row.location_id,
        levelBn: row.locations.location_levels.name_bn,
        levelEn: row.locations.location_levels.name_en,
        owners: [],
      };
      level.owners.push(name);
      levels.set(row.location_id, level);
    }
    const renters = new Map<string, PartyName[]>();
    for (const row of tenancies) {
      const name = nameOf(row);
      if (name) renters.set(row.unit_id, [...(renters.get(row.unit_id) ?? []), name]);
    }

    const owners = new Set(owning.map((unit) => unit.id));
    const rents = new Set(renting.map((unit) => unit.id));
    return new Map(
      units.map((unit) => [
        unit.id,
        {
          owners: owners.has(unit.id)
            ? pathIds(unit.path)
                .reverse()
                .flatMap((id) => {
                  const level = levels.get(id);
                  return level ? [{ ...level, isUnit: id === unit.id }] : [];
                })
            : null,
          renters: rents.has(unit.id) ? (renters.get(unit.id) ?? []) : null,
        },
      ]),
    );
  }

  /**
   * Units whose current owner (at any level of the chain) or renter matches `q` by name or
   * phone, only among the people the caller may view; a search can't find anyone else.
   */
  async matching(actor: Actor, q: string): Promise<string[]> {
    const owning = scopeSql(actor.access, 'ownerships');
    const renting = scopeSql(actor.access, 'tenancies');
    if (!owning && !renting) return [];

    const names = digitVariants(q).map((term) => `%${escapeLike(term)}%`);
    const numbers = [...new Set(digitVariants(q).map((term) => asciiDigits(term).replace(/[\s-]/g, '')))]
      .filter((term) => /^\d{3,}$/.test(term))
      .map((term) => `%${term}%`);
    const list = (values: string[]) => Prisma.sql`array[${Prisma.join(values)}]::text[]`;
    const match = Prisma.sql`(
      p.full_name ilike any(${list(names)}) or coalesce(p.full_name_en, '') ilike any(${list(names)}) or g.name ilike any(${list(names)})
      ${numbers.length > 0 ? Prisma.sql`or p.phone like any(${list(numbers)})` : Prisma.empty}
    )`;
    const rented = Prisma.join(RENTED_STATUSES.map((status) => Prisma.sql`${status}`));

    const either: Prisma.Sql[] = [];
    if (owning) {
      either.push(Prisma.sql`(${owning} and exists (
        select 1 from ownerships o join locations ol on ol.id = o.location_id
          left join persons p on p.id = o.person_id left join organisations g on g.id = o.organisation_id
        where o.society_id = u.society_id and o.end_date is null and starts_with(l.path, ol.path) and ${match}))`);
    }
    if (renting) {
      either.push(Prisma.sql`(${renting} and exists (
        select 1 from tenancies t
          left join persons p on p.id = t.primary_person_id left join organisations g on g.id = t.organisation_id
        where t.unit_id = u.location_id and t.society_id = u.society_id and t.status in (${rented}) and ${match}))`);
    }
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      select u.location_id as id from units u join locations l on l.id = u.location_id
      where u.society_id = ${actor.societyId}::uuid and (${Prisma.join(either, ' or ')})`;
    return rows.map((row) => row.id);
  }

  /**
   * Units that meet the conditions that look up the chain: no owner or no holding number at
   * any level, or an owner living here or elsewhere. Null when none is asked for. The
   * ownership ones keep to the caller's `ownerships` area, so they reveal no one else's.
   */
  async conditions(actor: Actor, filters: { missing?: UnitMissing | undefined; ownerLives?: OwnerLives | undefined }): Promise<string[] | null> {
    const and: Prisma.Sql[] = [];
    const hasOwner = Prisma.sql`exists (
      select 1 from ownerships o join locations ol on ol.id = o.location_id
      where o.society_id = u.society_id and o.end_date is null and starts_with(l.path, ol.path))`;
    const ownerLivesHere = Prisma.sql`exists (
      select 1 from occupants oc
        join ownerships o on o.person_id = oc.person_id and o.society_id = oc.society_id and o.end_date is null
        join locations ol on ol.id = o.location_id
      where oc.unit_id = u.location_id and oc.end_date is null and starts_with(l.path, ol.path))`;
    if (filters.missing === 'code') {
      and.push(Prisma.sql`not exists (select 1 from locations a where a.society_id = u.society_id and starts_with(l.path, a.path) and a.code is not null)`);
    }
    if (filters.missing === 'owner') and.push(Prisma.sql`not ${hasOwner}`);
    if (filters.ownerLives === 'here') and.push(ownerLivesHere);
    if (filters.ownerLives === 'elsewhere') and.push(Prisma.sql`${hasOwner} and not ${ownerLivesHere}`);
    if (and.length === 0) return null;
    if (filters.missing === 'owner' || filters.ownerLives) {
      const owning = scopeSql(actor.access, 'ownerships');
      if (!owning) return [];
      and.push(owning);
    }
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      select u.location_id as id from units u join locations l on l.id = u.location_id
      where u.society_id = ${actor.societyId}::uuid and ${Prisma.join(and, ' and ')}`;
    return rows.map((row) => row.id);
  }
}
