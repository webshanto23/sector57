import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  asciiDigits,
  digitVariants,
  toRelation,
  toRenterType,
  type MemberCounts,
  type MemberLink,
  type MemberList,
  type MemberListQuery,
  type MemberRow,
} from '@s57/shared';
import { mediaUrl, thumbKey } from '../common/media.js';
import { ENV, type Env } from '../config/env.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addressOf, TreeService } from '../property/tree.service.js';

type PartyRow = {
  kind: 'person' | 'organisation';
  id: string;
  name: string;
  name_en: string | null;
  phone: string | null;
  photo_url: string | null;
  has_id: boolean;
  verified: boolean | null;
  total: number;
};

type LinkRow = {
  person_id: string | null;
  organisation_id: string | null;
  role: 'owner' | 'renter' | 'occupant';
  detail: string | null;
  renter_household: boolean;
  location_id: string;
  name: string;
  path: string;
  is_unit: boolean;
};

type CountsRow = { owners: number; renter_households: number; bachelor_renters: number; pending: number };

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

/**
 * The members list: people and organisations with what they own, rent or live in now.
 * A scoped caller sees only those linked to a place in their area (and only those links);
 * a whole-society caller also sees people not linked anywhere yet.
 */
@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tree: TreeService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async list(actor: Actor, query: MemberListQuery): Promise<MemberList> {
    const { page, pageSize } = query;
    const scope = actor.access.paths('view', 'members');
    const everyone = scope === 'all';
    const links = this.linksCte(actor.societyId, scope);

    const filters: Prisma.Sql[] = [];
    if (query.q) {
      const names = digitVariants(query.q).map((term) => `%${escapeLike(term)}%`);
      const numbers = [...new Set(digitVariants(query.q).map((term) => asciiDigits(term).replace(/[\s-]/g, '')))]
        .filter((term) => /\d{3,}/.test(term))
        .map((term) => `%${escapeLike(term)}%`);
      const list = (values: string[]) => Prisma.sql`array[${Prisma.join(values)}]::text[]`;
      filters.push(Prisma.sql`(
        p.name ilike any(${list(names)}) or p.name_en ilike any(${list(names)})
        or p.name % ${query.q} or coalesce(p.name_en, '') % ${query.q}
        ${numbers.length > 0 ? Prisma.sql`or p.phone like any(${list(numbers)}) or p.id_number like any(${list(numbers)})` : Prisma.empty}
      )`);
    }
    if (query.role) {
      filters.push(Prisma.sql`exists (select 1 from links k where (k.person_id = p.id or k.organisation_id = p.id) and k.role = ${query.role})`);
    }
    if (query.verification) {
      filters.push(Prisma.sql`p.kind = 'person' and p.verified = ${query.verification === 'verified'}`);
    }
    if (query.areaId) {
      const area = await this.tree.find(actor.societyId, query.areaId);
      filters.push(
        area
          ? Prisma.sql`exists (select 1 from links k where (k.person_id = p.id or k.organisation_id = p.id) and starts_with(k.path, ${area.path}))`
          : Prisma.sql`false`,
      );
    }
    const where = filters.length > 0 ? Prisma.join(filters, ' and ') : Prisma.sql`true`;

    const [rows, [counts]] = await Promise.all([
      this.prisma.$queryRaw<PartyRow[]>`
        with ${links},
        parties as (
          select 'person' as kind, p.id, p.full_name as name, p.full_name_en as name_en, p.phone, p.photo_url,
            p.nid is not null as has_id, p.verified_at is not null as verified, p.nid as id_number
          from persons p
          where p.society_id = ${actor.societyId}::uuid
            and (${everyone} or p.id in (select person_id from links where person_id is not null))
          union all
          select 'organisation', g.id, g.name, null, cp.phone, null,
            g.trade_licence is not null, null, g.trade_licence
          from organisations g left join persons cp on cp.id = g.contact_person_id
          where g.society_id = ${actor.societyId}::uuid
            and (${everyone} or g.id in (select organisation_id from links where organisation_id is not null))
        )
        select p.kind, p.id, p.name, p.name_en, p.phone, p.photo_url, p.has_id, p.verified, count(*) over ()::int as total
        from parties p
        where ${where}
        order by p.name collate natural_sort, p.id
        limit ${pageSize} offset ${(page - 1) * pageSize}`,
      this.prisma.$queryRaw<CountsRow[]>`
        with ${links}
        select
          (select count(*) from (select distinct person_id, organisation_id from links where role = 'owner') o)::int as owners,
          (select count(*) from links where role = 'renter' and detail = 'family')::int as renter_households,
          (select count(*) from links where role = 'renter' and detail = 'bachelor')::int as bachelor_renters,
          (select count(*) from persons p where p.society_id = ${actor.societyId}::uuid and p.verified_at is null
            and p.id in (select person_id from links where person_id is not null))::int as pending`,
    ]);

    const ids = rows.map((row) => row.id);
    const linkRows =
      ids.length === 0
        ? []
        : await this.prisma.$queryRaw<LinkRow[]>`
            with ${links}
            select * from links
            where person_id = any(${ids}::uuid[]) or organisation_id = any(${ids}::uuid[])
            order by case role when 'owner' then 0 when 'renter' then 1 else 2 end, name collate natural_sort, location_id`;
    const names = await this.tree.addressNames(
      actor.societyId,
      linkRows.map((row) => row.path),
    );

    return {
      items: rows.map((row) => this.toRow(row, linkRows.filter((link) => link.person_id === row.id || link.organisation_id === row.id), names)),
      total: rows[0]?.total ?? (page > 1 ? await this.countOnly(actor, query) : 0),
      page,
      pageSize,
      counts: toCounts(counts),
    };
  }

  /** The total when the requested page is past the end (no row carries the window count). */
  private async countOnly(actor: Actor, query: MemberListQuery): Promise<number> {
    const first = await this.list(actor, { ...query, page: 1, pageSize: 1 });
    return first.total;
  }

  private toRow(row: PartyRow, links: LinkRow[], names: Map<string, string>): MemberRow {
    const seen = new Set<string>();
    const memberLinks: MemberLink[] = [];
    // An owner or renter who also heads that household is shown once, as owner or renter.
    const ownsOrRents = { owner: links.some((link) => link.role === 'owner'), renter: links.some((link) => link.role === 'renter') };
    for (const link of links) {
      if (link.role === 'occupant' && link.detail === 'head' && (link.renter_household ? ownsOrRents.renter : ownsOrRents.owner)) continue;
      const item: MemberLink =
        link.role === 'owner'
          ? { role: 'owner' }
          : link.role === 'renter'
            ? { role: 'renter', renterType: toRenterType(link.detail ?? 'other') }
            : { role: 'occupant', relation: toRelation(link.detail ?? 'other'), renter: link.renter_household };
      const key = JSON.stringify(item);
      if (!seen.has(key)) memberLinks.push(item);
      seen.add(key);
    }
    const places = [...new Map(links.map((link) => [link.location_id, link])).values()];
    const first = places[0];
    return {
      kind: row.kind,
      id: row.id,
      name: row.name,
      nameEn: row.name_en,
      phone: row.phone,
      photoUrl: mediaUrl(thumbKey(row.photo_url), this.env.MEDIA_BASE_URL),
      verified: row.verified,
      hasId: row.has_id,
      links: memberLinks,
      place: first ? { id: first.location_id, name: first.name, address: addressOf(first.path, names), isUnit: first.is_unit } : null,
      otherPlaces: Math.max(0, places.length - 1),
    };
  }

  /**
   * `links`: every current ownership, open tenancy and household row at a place the caller
   * may see on `members`, with the place.
   */
  private linksCte(societyId: string, scope: 'all' | readonly string[]): Prisma.Sql {
    const inScope =
      scope === 'all'
        ? Prisma.sql`true`
        : scope.length === 0
          ? Prisma.sql`false`
          : Prisma.sql`(${Prisma.join(
              scope.map((path) => Prisma.sql`starts_with(l.path, ${path})`),
              ' or ',
            )})`;
    return Prisma.sql`links as (
      select o.person_id, o.organisation_id, 'owner' as role, null::text as detail, false as renter_household,
        l.id as location_id, l.name, l.path, lv.is_unit_level as is_unit
      from ownerships o join locations l on l.id = o.location_id join location_levels lv on lv.id = l.level_id
      where o.society_id = ${societyId}::uuid and l.society_id = ${societyId}::uuid and o.end_date is null and ${inScope}
      union all
      select t.primary_person_id, t.organisation_id, 'renter', t.renter_type, false,
        l.id, l.name, l.path, lv.is_unit_level
      from tenancies t join locations l on l.id = t.unit_id join location_levels lv on lv.id = l.level_id
      where t.society_id = ${societyId}::uuid and l.society_id = ${societyId}::uuid and t.status <> 'ended' and ${inScope}
      union all
      select oc.person_id, null, 'occupant', oc.relation, oc.tenancy_id is not null,
        l.id, l.name, l.path, lv.is_unit_level
      from occupants oc join locations l on l.id = oc.unit_id join location_levels lv on lv.id = l.level_id
      where oc.society_id = ${societyId}::uuid and l.society_id = ${societyId}::uuid and oc.end_date is null and ${inScope}
    )`;
  }
}

function toCounts(row: CountsRow | undefined): MemberCounts {
  return {
    owners: row?.owners ?? 0,
    renterHouseholds: row?.renter_households ?? 0,
    bachelorRenters: row?.bachelor_renters ?? 0,
    pendingVerification: row?.pending ?? 0,
  };
}
