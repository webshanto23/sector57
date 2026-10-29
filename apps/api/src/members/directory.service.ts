import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  asciiDigits,
  digitVariants,
  DIRECTORY_EXPORT_LIMIT,
  toRelation,
  type DirectoryAllQuery,
  type DirectoryList,
  type DirectoryPrint,
  type DirectoryQuery,
  type DirectoryRow,
} from '@s57/shared';
import { isoDate } from '../common/dates.js';
import { mediaUrl, thumbKey } from '../common/media.js';
import { ENV, type Env } from '../config/env.js';
import type { CallerAccess } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addressOf, TreeService } from '../property/tree.service.js';

type Row = {
  id: string;
  person_id: string;
  full_name: string;
  full_name_en: string | null;
  phone: string | null;
  photo_url: string | null;
  relation: string;
  tenancy_id: string | null;
  start_date: Date;
  unit_id: string;
  unit_name: string;
  path: string;
  is_owner: boolean;
  member_no: number | null;
  membership_code: string | null;
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

/** SQL: the unit `l` lies in the caller's `members.view` area. */
function inScope(access: CallerAccess): Prisma.Sql {
  const scope = access.paths('view', 'members');
  if (scope === 'all') return Prisma.sql`TRUE`;
  if (scope.length === 0) return Prisma.sql`FALSE`;
  return Prisma.sql`(${Prisma.join(
    scope.map((path) => Prisma.sql`starts_with(l.path, ${path})`),
    ' OR ',
  )})`;
}

/**
 * The resident directory (`members.view`, limited to the caller's area): everyone in a current
 * household row, owners' and renters' households alike, ordered by address in natural order.
 * Read-only; national IDs never leave here.
 */
@Injectable()
export class DirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tree: TreeService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async list(actor: Actor, query: DirectoryQuery): Promise<DirectoryList> {
    const { page, pageSize } = query;
    const where = await this.where(actor, query);
    const base = Prisma.sql`o.society_id = ${actor.societyId}::uuid AND o.end_date IS NULL AND ${inScope(actor.access)}`;
    const [rows, [{ total }], [counts]] = await Promise.all([
      this.rows(where, pageSize, (page - 1) * pageSize),
      this.prisma.$queryRaw<[{ total: number }]>`
        SELECT count(*)::int AS total FROM occupants o JOIN locations l ON l.id = o.unit_id JOIN persons p ON p.id = o.person_id WHERE ${where}`,
      this.prisma.$queryRaw<{ units: number; residents: number }[]>`
        SELECT count(DISTINCT o.unit_id)::int AS units, count(*)::int AS residents
        FROM occupants o JOIN locations l ON l.id = o.unit_id WHERE ${base}`,
    ]);
    return { items: await this.toRows(actor.societyId, rows), total, page, pageSize, counts: counts! };
  }

  /** Everyone under the place (at most `DIRECTORY_EXPORT_LIMIT`), for printing or CSV. */
  async all(actor: Actor, query: DirectoryAllQuery): Promise<DirectoryPrint> {
    const where = await this.where(actor, query);
    const rows = await this.rows(where, DIRECTORY_EXPORT_LIMIT + 1, 0);
    const area = query.areaId ? await this.tree.visible(actor.access, actor.societyId, 'members', query.areaId) : null;
    return {
      area: area ? { id: area.id, name: area.name } : null,
      items: await this.toRows(actor.societyId, rows.slice(0, DIRECTORY_EXPORT_LIMIT)),
      truncated: rows.length > DIRECTORY_EXPORT_LIMIT,
    };
  }

  private async where(actor: Actor, query: { q?: string | undefined; areaId?: string | undefined }): Promise<Prisma.Sql> {
    const and = [Prisma.sql`o.society_id = ${actor.societyId}::uuid AND o.end_date IS NULL AND ${inScope(actor.access)}`];
    if (query.areaId) {
      const area = await this.tree.visible(actor.access, actor.societyId, 'members', query.areaId);
      and.push(Prisma.sql`starts_with(l.path, ${area.path})`);
    }
    if (query.q) {
      const names = digitVariants(query.q).map((term) => `%${escapeLike(term)}%`);
      const numbers = [...new Set(digitVariants(query.q).map((term) => asciiDigits(term).replace(/[\s-]/g, '')))]
        .filter((term) => /^\d{3,}$/.test(term))
        .map((term) => `%${term}%`);
      const list = (values: string[]) => Prisma.sql`array[${Prisma.join(values)}]::text[]`;
      and.push(Prisma.sql`(
        p.full_name ilike any(${list(names)}) OR coalesce(p.full_name_en, '') ilike any(${list(names)}) OR l.name ilike any(${list(names)})
        ${numbers.length > 0 ? Prisma.sql`OR p.phone like any(${list(numbers)})` : Prisma.empty}
      )`);
    }
    return Prisma.join(and, ' AND ');
  }

  /** In address order: the names from the top down, compared naturally; the household head first. */
  private rows(where: Prisma.Sql, limit: number, offset: number): Promise<Row[]> {
    return this.prisma.$queryRaw<Row[]>`
      SELECT o.id, o.person_id, p.full_name, p.full_name_en, p.phone, p.photo_url, o.relation, o.tenancy_id, o.start_date,
             l.id AS unit_id, l.name AS unit_name, l.path,
             EXISTS (
               SELECT 1 FROM ownerships w JOIN locations wl ON wl.id = w.location_id
               WHERE w.person_id = o.person_id AND w.end_date IS NULL AND starts_with(l.path, wl.path)
             ) AS is_owner,
             (SELECT m.member_no FROM memberships m WHERE m.person_id = o.person_id AND m.status = 'active' ORDER BY m.member_no LIMIT 1) AS member_no,
             (SELECT m.membership_code FROM memberships m WHERE m.person_id = o.person_id AND m.status = 'active' ORDER BY m.member_no LIMIT 1) AS membership_code
      FROM occupants o JOIN locations l ON l.id = o.unit_id JOIN persons p ON p.id = o.person_id
      WHERE ${where}
      ORDER BY (
        SELECT string_agg(a.name, E'\\x1f' ORDER BY length(a.path))
        FROM locations a WHERE a.id = ANY (string_to_array(trim(BOTH '/' FROM l.path), '/')::uuid[])
      ) COLLATE natural_sort, (o.tenancy_id IS NULL) DESC, (o.relation = 'head') DESC, p.full_name, o.id
      LIMIT ${limit} OFFSET ${offset}`;
  }

  private async toRows(societyId: string, rows: Row[]): Promise<DirectoryRow[]> {
    const names = await this.tree.addressNames(
      societyId,
      rows.map((row) => row.path),
    );
    return rows.map((row) => ({
      id: row.id,
      person: {
        id: row.person_id,
        name: row.full_name,
        nameEn: row.full_name_en,
        phone: row.phone,
        photoUrl: mediaUrl(thumbKey(row.photo_url), this.env.MEDIA_BASE_URL),
      },
      relation: toRelation(row.relation),
      household: row.tenancy_id ? 'renter' : 'owner',
      isOwner: row.is_owner,
      memberNo: row.member_no,
      membershipCode: row.membership_code,
      place: { id: row.unit_id, name: row.unit_name, address: addressOf(row.path, names), isUnit: true },
      since: isoDate(row.start_date),
    }));
  }
}
