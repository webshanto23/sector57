import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  asciiDigits,
  digitVariants,
  toMembershipStatus,
  toMoveKind,
  toRenterType,
  type MemberRegister,
  type MemberRegisterQuery,
  type OwnerRegister,
  type OwnerRegisterQuery,
  type RenterRegister,
  type RenterRegisterQuery,
} from '@s57/shared';
import { isoDate } from '../common/dates.js';
import { mediaUrl, thumbKey } from '../common/media.js';
import { ENV, type Env } from '../config/env.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addressOf, TreeService } from '../property/tree.service.js';
import { inScope } from '../reports/area-tree.js';
import { feeOf, holdingsOf, placesOf, type FeeRow, type OwnedRow } from './registers.policy.js';

type PersonCols = { id: string; name: string; name_en: string | null; phone: string | null; photo_url: string | null; verified: boolean | null };
type MemberRow = PersonCols & FeeRow & { member_no: number; membership_code: string; status: string; joined_on: Date; total: number };
type OwnerRow = PersonCols & { kind: 'person' | 'organisation'; lives_here: boolean | null; member_no: number | null; membership_code: string | null; total: number };
type RenterRow = Omit<PersonCols, 'id'> & {
  id: string;
  party_id: string | null;
  kind: 'person' | 'organisation' | null;
  renter_type: string;
  member_no: number | null;
  membership_code: string | null;
  status: string;
  start_date: Date;
  monthly_rent: string | null;
  police_form_submitted: boolean;
  location_id: string;
  unit_name: string;
  path: string;
  is_unit: boolean;
  ut_code: string;
  ut_bn: string;
  ut_en: string | null;
  residents: number;
  move_id: string | null;
  move_kind: string | null;
  total: number;
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);
const textList = (values: string[]) => Prisma.sql`array[${Prisma.join(values)}]::text[]`;

/** Names (fuzzy) or phone, in either digit form, on the given columns. */
function searchSql(q: string, name: Prisma.Sql, nameEn: Prisma.Sql, phone: Prisma.Sql): Prisma.Sql {
  const names = digitVariants(q).map((term) => `%${escapeLike(term)}%`);
  const numbers = [...new Set(digitVariants(q).map((term) => asciiDigits(term).replace(/[\s-]/g, '')))]
    .filter((term) => /\d{3,}/.test(term))
    .map((term) => `%${escapeLike(term)}%`);
  return Prisma.sql`(
    ${name} ilike any(${textList(names)}) or coalesce(${nameEn}, '') ilike any(${textList(names)})
    or ${name} % ${q} or coalesce(${nameEn}, '') % ${q}
    ${numbers.length > 0 ? Prisma.sql`or ${phone} like any(${textList(numbers)})` : Prisma.empty}
  )`;
}

/**
 * The people registers: members, owners and renters, each limited to the caller's `members`
 * area. Owners and renters are found through places in the area; a member through their
 * membership's place or anything they own, rent or live in there.
 */
@Injectable()
export class RegistersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tree: TreeService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async members(actor: Actor, query: MemberRegisterQuery): Promise<MemberRegister> {
    const { societyId } = actor;
    const scope = inScope(actor.access, 'members');
    const everyone = actor.access.paths('view', 'members') === 'all';
    const linked = Prisma.sql`linked as (
      select o.person_id, l.path from ownerships o join locations l on l.id = o.location_id
      where o.society_id = ${societyId}::uuid and o.end_date is null and o.person_id is not null and ${scope}
      union all
      select t.primary_person_id, l.path from tenancies t join locations l on l.id = t.unit_id
      where t.society_id = ${societyId}::uuid and t.status <> 'ended' and t.primary_person_id is not null and ${scope}
      union all
      select oc.person_id, l.path from occupants oc join locations l on l.id = oc.unit_id
      where oc.society_id = ${societyId}::uuid and oc.end_date is null and ${scope}
    )`;
    const visible = everyone
      ? Prisma.sql`true`
      : Prisma.sql`((m.location_id is not null and ${scope}) or m.person_id in (select person_id from linked))`;

    // The membership fee: its bills (void left out), shown only to society-wide billing viewers.
    const feesShown = actor.access.paths('view', 'billing') === 'all';
    const fees = Prisma.sql`left join lateral (
      select count(*)::int as fee_bills,
        count(*) filter (where i.status in ('unpaid', 'partial'))::int as fee_open,
        trim_scale(sum(i.total - i.paid) filter (where i.status in ('unpaid', 'partial')))::text as fee_owed,
        (array_agg(i.id order by i.due_date, i.id) filter (where i.status in ('unpaid', 'partial')))[1] as fee_open_bill
      from invoices i where i.membership_id = m.id and i.status <> 'void'
    ) f on true`;
    const feePaid = Prisma.sql`(f.fee_bills > 0 and f.fee_open = 0)`;

    const filters: Prisma.Sql[] = [Prisma.sql`m.status = ${query.status}`];
    if (query.q) filters.push(searchSql(query.q, Prisma.sql`p.full_name`, Prisma.sql`p.full_name_en`, Prisma.sql`p.phone`));
    if (feesShown && query.fee) filters.push(query.fee === 'paid' ? feePaid : Prisma.sql`not ${feePaid}`);
    const area = await this.areaPath(societyId, query.areaId);
    if (area !== undefined) {
      filters.push(
        area === null
          ? Prisma.sql`false`
          : Prisma.sql`(starts_with(l.path, ${area}) or exists (select 1 from linked k where k.person_id = m.person_id and starts_with(k.path, ${area})))`,
      );
    }

    const [rows, counts] = await Promise.all([
      this.prisma.$queryRaw<MemberRow[]>`
        with ${linked}
        select m.member_no, m.membership_code, m.status, m.joined_on, p.id, p.full_name as name, p.full_name_en as name_en, p.phone, p.photo_url,
          p.verified_at is not null as verified, f.fee_bills, f.fee_open, f.fee_owed, f.fee_open_bill, count(*) over ()::int as total
        from memberships m join persons p on p.id = m.person_id left join locations l on l.id = m.location_id ${fees}
        where m.society_id = ${societyId}::uuid and ${visible} and ${Prisma.join(filters, ' and ')}
        order by m.member_no
        limit ${query.pageSize} offset ${(query.page - 1) * query.pageSize}`,
      this.prisma.$queryRaw<{ status: string; count: number; fee_not_paid: number }[]>`
        with ${linked}
        select m.status, count(*)::int as count, count(*) filter (where not ${feePaid})::int as fee_not_paid
        from memberships m left join locations l on l.id = m.location_id ${fees}
        where m.society_id = ${societyId}::uuid and ${visible}
        group by m.status`,
    ]);
    const owned = await this.owned(actor, rows.map((row) => row.id));
    const count = (status: string) => counts.find((row) => row.status === status)?.count ?? 0;
    return {
      items: rows.map((row) => ({
        memberNo: row.member_no,
        membershipCode: row.membership_code,
        status: toMembershipStatus(row.status),
        joinedOn: isoDate(row.joined_on),
        person: this.party('person', row),
        holdings: holdingsOf(owned.filter((own) => own.party_id === row.id)),
        fee: feesShown ? feeOf(row) : null,
      })),
      total: rows[0]?.total ?? 0,
      page: query.page,
      pageSize: query.pageSize,
      counts: {
        active: count('active'),
        lapsed: count('lapsed'),
        cancelled: count('cancelled'),
        feeNotPaid: feesShown ? (counts.find((row) => row.status === query.status)?.fee_not_paid ?? 0) : null,
      },
    };
  }

  async owners(actor: Actor, query: OwnerRegisterQuery): Promise<OwnerRegister> {
    const { societyId } = actor;
    const owned = this.ownedCte(actor);
    const filters: Prisma.Sql[] = [];
    if (query.q) filters.push(searchSql(query.q, Prisma.sql`p.name`, Prisma.sql`p.name_en`, Prisma.sql`p.phone`));
    const area = await this.areaPath(societyId, query.areaId);
    if (area !== undefined) {
      filters.push(area === null ? Prisma.sql`false` : Prisma.sql`exists (select 1 from owned k where k.party_id = p.id and starts_with(k.path, ${area}))`);
    }
    if (query.membership === 'member') filters.push(Prisma.sql`p.member_no is not null`);
    if (query.membership === 'not_member') filters.push(Prisma.sql`p.kind = 'person' and p.member_no is null`);
    if (query.residence === 'here') filters.push(Prisma.sql`p.lives_here`);
    if (query.residence === 'elsewhere') filters.push(Prisma.sql`p.kind = 'person' and not p.lives_here`);
    const where = filters.length > 0 ? Prisma.join(filters, ' and ') : Prisma.sql`true`;
    const parties = Prisma.sql`parties as (
      select 'person' as kind, p.id, p.full_name as name, p.full_name_en as name_en, p.phone, p.photo_url,
        p.verified_at is not null as verified,
        exists (select 1 from occupants oc join locations l on l.id = oc.unit_id
          where oc.person_id = p.id and oc.society_id = ${societyId}::uuid and oc.end_date is null and ${inScope(actor.access, 'members')}) as lives_here,
        (select m.member_no from memberships m where m.person_id = p.id and m.society_id = ${societyId}::uuid and m.status = 'active') as member_no,
        (select m.membership_code from memberships m where m.person_id = p.id and m.society_id = ${societyId}::uuid and m.status = 'active') as membership_code
      from persons p where p.society_id = ${societyId}::uuid and p.id in (select party_id from owned)
      union all
      select 'organisation', g.id, g.name, null, cp.phone, null, null, null, null, null
      from organisations g left join persons cp on cp.id = g.contact_person_id
      where g.society_id = ${societyId}::uuid and g.id in (select party_id from owned)
    )`;

    const [rows, [counts]] = await Promise.all([
      this.prisma.$queryRaw<OwnerRow[]>`
        with ${owned}, ${parties}
        select p.*, count(*) over ()::int as total from parties p
        where ${where}
        order by p.name collate natural_sort, p.id
        limit ${query.pageSize} offset ${(query.page - 1) * query.pageSize}`,
      this.prisma.$queryRaw<{ owners: number; members: number; not_members: number; lives_here: number }[]>`
        with ${owned}, ${parties}
        select count(*)::int as owners, count(member_no)::int as members,
          count(*) filter (where kind = 'person' and member_no is null)::int as not_members,
          count(*) filter (where lives_here)::int as lives_here
        from parties`,
    ]);
    const places = await this.owned(actor, rows.map((row) => row.id));
    const names = await this.tree.addressNames(societyId, places.map((place) => place.path));
    return {
      items: rows.flatMap((row) => {
        const own = placesOf(places.filter((place) => place.party_id === row.id));
        const first = own[0];
        if (!first) return [];
        return [
          {
            ...this.party(row.kind, row),
            holdings: holdingsOf(own),
            place: { id: first.location_id, name: first.name, address: addressOf(first.path, names), isUnit: first.is_unit },
            otherPlaces: own.length - 1,
            livesHere: row.kind === 'person' ? Boolean(row.lives_here) : null,
            memberNo: row.member_no,
        membershipCode: row.membership_code,
          },
        ];
      }),
      total: rows[0]?.total ?? 0,
      page: query.page,
      pageSize: query.pageSize,
      counts: { owners: counts?.owners ?? 0, members: counts?.members ?? 0, notMembers: counts?.not_members ?? 0, livesHere: counts?.lives_here ?? 0 },
    };
  }

  async renters(actor: Actor, query: RenterRegisterQuery): Promise<RenterRegister> {
    const { societyId } = actor;
    const base = Prisma.sql`t.society_id = ${societyId}::uuid and l.society_id = ${societyId}::uuid and t.status <> 'ended'
      and ${inScope(actor.access, 'members')}`;
    const filters: Prisma.Sql[] = [];
    if (query.q) {
      filters.push(searchSql(query.q, Prisma.sql`coalesce(p.full_name, g.name)`, Prisma.sql`p.full_name_en`, Prisma.sql`coalesce(p.phone, cp.phone)`));
    }
    const area = await this.areaPath(societyId, query.areaId);
    if (area !== undefined) filters.push(area === null ? Prisma.sql`false` : Prisma.sql`starts_with(l.path, ${area})`);
    if (query.renterType) filters.push(Prisma.sql`t.renter_type = ${query.renterType}`);
    if (query.unitType) filters.push(Prisma.sql`u.unit_type = ${query.unitType}`);
    if (query.status) filters.push(Prisma.sql`t.status = ${query.status}`);
    const where = filters.length > 0 ? Prisma.join(filters, ' and ') : Prisma.sql`true`;

    const [rows, [counts]] = await Promise.all([
      this.prisma.$queryRaw<RenterRow[]>`
        select t.id, t.renter_type, t.status, t.start_date, trim_scale(t.monthly_rent)::text as monthly_rent, t.police_form_submitted,
          coalesce(p.id, g.id) as party_id,
          case when p.id is not null then 'person' when g.id is not null then 'organisation' end as kind,
          coalesce(p.full_name, g.name) as name, p.full_name_en as name_en, coalesce(p.phone, cp.phone) as phone, p.photo_url,
          case when p.id is not null then p.verified_at is not null end as verified,
          l.id as location_id, l.name as unit_name, l.path, lv.is_unit_level as is_unit,
          ut.code as ut_code, ut.name_bn as ut_bn, ut.name_en as ut_en,
          (select count(*) from occupants oc where oc.tenancy_id = t.id and oc.end_date is null)::int as residents,
          (select m.member_no from memberships m where m.person_id = p.id and m.status = 'active') as member_no,
          (select m.membership_code from memberships m where m.person_id = p.id and m.status = 'active') as membership_code,
          mv.id as move_id, mv.kind as move_kind,
          count(*) over ()::int as total
        from tenancies t
          join units u on u.location_id = t.unit_id
          join unit_types ut on ut.society_id = u.society_id and ut.code = u.unit_type
          join locations l on l.id = t.unit_id join location_levels lv on lv.id = l.level_id
          left join persons p on p.id = t.primary_person_id
          left join organisations g on g.id = t.organisation_id left join persons cp on cp.id = g.contact_person_id
          left join lateral (select me.id, me.kind from move_events me where me.tenancy_id = t.id and me.status = 'open' limit 1) mv on true
        where ${base} and ${where}
        order by coalesce(p.full_name, g.name) collate natural_sort, t.id
        limit ${query.pageSize} offset ${(query.page - 1) * query.pageSize}`,
      this.prisma.$queryRaw<{ renters: number; family: number; bachelor: number; police_missing: number }[]>`
        select count(*)::int as renters,
          count(*) filter (where t.renter_type = 'family')::int as family,
          count(*) filter (where t.renter_type = 'bachelor')::int as bachelor,
          count(*) filter (where not t.police_form_submitted)::int as police_missing
        from tenancies t join locations l on l.id = t.unit_id
        where ${base}`,
    ]);
    const names = await this.tree.addressNames(societyId, rows.map((row) => row.path));
    return {
      items: rows.map((row) => ({
        tenancyId: row.id,
        renter: row.party_id && row.kind ? this.party(row.kind, { ...row, id: row.party_id }) : null,
        renterType: toRenterType(row.renter_type),
        status: row.status === 'pending' || row.status === 'moving_out' ? row.status : 'active',
        startDate: isoDate(row.start_date),
        monthlyRent: row.monthly_rent,
        policeFormSubmitted: row.police_form_submitted,
        openMove: row.move_id ? { id: row.move_id, kind: toMoveKind(row.move_kind ?? 'move_in') } : null,
        unit: { id: row.location_id, name: row.unit_name, address: addressOf(row.path, names), isUnit: row.is_unit },
        unitType: { code: row.ut_code, nameBn: row.ut_bn, nameEn: row.ut_en },
        residents: row.residents,
        memberNo: row.member_no,
        membershipCode: row.membership_code,
      })),
      total: rows[0]?.total ?? 0,
      page: query.page,
      pageSize: query.pageSize,
      counts: { renters: counts?.renters ?? 0, family: counts?.family ?? 0, bachelor: counts?.bachelor ?? 0, policeFormMissing: counts?.police_missing ?? 0 },
    };
  }

  /** The area filter's path: undefined without one, null when the place isn't in this society. */
  private async areaPath(societyId: string, areaId: string | undefined): Promise<string | null | undefined> {
    if (!areaId) return undefined;
    return (await this.tree.find(societyId, areaId))?.path ?? null;
  }

  /** `owned`: every current ownership at a place in the caller's area, with the place and its level. */
  private ownedCte(actor: Actor): Prisma.Sql {
    return Prisma.sql`owned as (
      select coalesce(o.person_id, o.organisation_id) as party_id, l.id as location_id, l.name, l.path,
        lv.is_unit_level as is_unit, lv.id as level_id, lv.name_bn as level_bn, lv.name_en as level_en, lv.depth
      from ownerships o join locations l on l.id = o.location_id join location_levels lv on lv.id = l.level_id
      where o.society_id = ${actor.societyId}::uuid and l.society_id = ${actor.societyId}::uuid and o.end_date is null
        and ${inScope(actor.access, 'members')}
    )`;
  }

  private async owned(actor: Actor, partyIds: string[]): Promise<OwnedRow[]> {
    if (partyIds.length === 0) return [];
    return this.prisma.$queryRaw<OwnedRow[]>`
      with ${this.ownedCte(actor)}
      select * from owned where party_id = any(${partyIds}::uuid[])
      order by depth, name collate natural_sort, location_id`;
  }

  private party(kind: 'person' | 'organisation', row: PersonCols) {
    return {
      kind,
      id: row.id,
      name: row.name,
      nameEn: row.name_en,
      phone: row.phone,
      photoUrl: mediaUrl(thumbKey(row.photo_url), this.env.MEDIA_BASE_URL),
      verified: row.verified,
    };
  }
}
