import { Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  asciiDigits,
  digitVariants,
  RENTED_STATUSES,
  type OwnerLives,
  type PartyName,
  type PermissionModule,
  type UnitMissing,
  type UnitOwnerLevel,
} from '@s57/shared';
import type { CallerAccess } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { pathIds } from './tree.service.js';

export type UnitPeople = { owners: UnitOwnerLevel[] | null; renters: PartyName[] | null };

const partySelect = {
  persons: { select: { full_name: true, full_name_en: true } },
  organisations: { select: { name: true } },
} as const;

type PartyRow = { persons: { full_name: string; full_name_en: string | null } | null; organisations: { name: string } | null };

const nameOf = (row: PartyRow): PartyName | null =>
  row.persons ? { name: row.persons.full_name, nameEn: row.persons.full_name_en } : row.organisations ? { name: row.organisations.name, nameEn: null } : null;

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

/** Units `l` whose path lies in the caller's area for `module` (as SQL). */
function inScope(access: CallerAccess, module: PermissionModule): Prisma.Sql | null {
  const scope = access.paths('view', module);
  if (scope === 'all') return Prisma.sql`TRUE`;
  if (scope.length === 0) return null;
  return Prisma.sql`(${Prisma.join(
    scope.map((path) => Prisma.sql`starts_with(l.path, ${path})`),
    ' OR ',
  )})`;
}

/**
 * Who owns and rents units, for the units list: owners at every level of a unit's chain
 * and the current renter, each only where the caller may view ownerships or tenancies.
 */
@Injectable()
export class UnitPeopleService {
  constructor(private readonly prisma: PrismaService) {}

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
    const owning = inScope(actor.access, 'ownerships');
    const renting = inScope(actor.access, 'tenancies');
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
      const owning = inScope(actor.access, 'ownerships');
      if (!owning) return [];
      and.push(owning);
    }
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      select u.location_id as id from units u join locations l on l.id = u.location_id
      where u.society_id = ${actor.societyId}::uuid and ${Prisma.join(and, ' and ')}`;
    return rows.map((row) => row.id);
  }
}
