import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  MEMBERS_REPORT_LIMIT,
  occupancyFiguresOf,
  RENTERS_REPORT_LIMIT,
  SETTING_KEYS,
  type MembershipStatus,
  type MembersReport,
  type MembersReportQuery,
  type Occupancy,
  type OccupancyQuery,
  type OccupancyReport,
  type RenterType,
  type RentersReport,
  type RentersReportQuery,
  type TenancyStatus,
} from '@s57/shared';
import { isoDate, todayDate } from '../common/dates.js';
import { rangeOf } from '../ledger/ledger.service.js';
import type { CallerAccess } from '../permissions/caller-access.js';
import { scopeWhere } from '../permissions/caller-access.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addressOf, TreeService } from '../property/tree.service.js';
import { AreaTree, inScope } from './area-tree.js';

const sharingOff = () =>
  new ForbiddenException({ code: 'thana_sharing_off', message: 'Sharing renter details with the police station is turned off in the settings' });

type RenterRow = {
  id: string;
  unit_id: string;
  name: string;
  path: string;
  renter_type: string;
  status: string;
  start_date: Date;
  police_form_submitted: boolean;
  person_id: string | null;
  full_name: string | null;
  full_name_en: string | null;
  person_phone: string | null;
  organisation_id: string | null;
  organisation_name: string | null;
  organisation_phone: string | null;
  household: number;
};

/**
 * The records reports, read-only: occupancy by area (`units.view`), members (`members.view`)
 * and the renter list for the police station (`members.export`, only while the society shares
 * it). Each is limited to the caller's area for its grant.
 */
@Injectable()
export class RecordsReportsService {
  private readonly unitAreas: AreaTree;
  private readonly memberAreas: AreaTree;
  private readonly renterAreas: AreaTree;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tree: TreeService,
  ) {
    this.unitAreas = new AreaTree(prisma, tree, 'units');
    this.memberAreas = new AreaTree(prisma, tree, 'members');
    this.renterAreas = new AreaTree(prisma, tree, 'members', 'export');
  }

  /** Active units by occupancy per place under the parent. 404 `location_not_found` for a place out of reach. */
  async occupancy(access: CallerAccess, societyId: string, query: OccupancyQuery): Promise<OccupancyReport> {
    const parent = await this.unitAreas.parent(access, societyId, query.parentId);
    const prefix = parent?.path ?? '/';
    const [children, sums] = await Promise.all([
      this.unitAreas.children(access, societyId, parent),
      this.prisma.$queryRaw<{ area_id: string; owner_occupied: number; rented: number; vacant: number }[]>`
        SELECT split_part(substr(l.path, ${prefix.length + 1}), '/', 1) AS area_id,
               count(*) FILTER (WHERE u.occupancy = 'owner_occupied')::int AS owner_occupied,
               count(*) FILTER (WHERE u.occupancy = 'rented')::int AS rented,
               count(*) FILTER (WHERE u.occupancy = 'vacant')::int AS vacant
        FROM units u JOIN locations l ON l.id = u.location_id
        WHERE u.society_id = ${societyId}::uuid AND l.is_active
          AND starts_with(l.path, ${prefix}) AND l.path <> ${prefix} AND ${inScope(access, 'units')}
        GROUP BY 1`,
    ]);
    const byArea = new Map(sums.map((row) => [row.area_id, row]));
    const areas = children.map((child) => {
      const sum = byArea.get(child.id);
      const figures = occupancyFiguresOf(sum?.owner_occupied ?? 0, sum?.rented ?? 0, sum?.vacant ?? 0);
      const occupancy: Occupancy | null = !child.isUnit || figures.units === 0 ? null : figures.rented ? 'rented' : figures.ownerOccupied ? 'owner_occupied' : 'vacant';
      return { id: child.id, name: child.name, isUnit: child.isUnit, occupancy, ...figures };
    });
    const total = (key: 'owner_occupied' | 'rented' | 'vacant') => sums.reduce((count, row) => count + row[key], 0);
    return {
      parent: parent ? { id: parent.id, name: parent.name } : null,
      crumbs: await this.unitAreas.crumbs(access, societyId, parent),
      areas,
      totals: occupancyFiguresOf(total('owner_occupied'), total('rented'), total('vacant')),
    };
  }

  /** Memberships by status, and who joined in the range. 400 `invalid_range`; 404 `location_not_found`. */
  async members(access: CallerAccess, societyId: string, query: MembersReportQuery): Promise<MembersReport> {
    const { from, to } = rangeOf(query);
    const location = query.locationId ? await this.memberAreas.parent(access, societyId, query.locationId) : null;
    // A whole-society caller sees every membership; one limited to an area, those recorded at a place there.
    const where: Prisma.membershipsWhereInput = {
      AND: [
        { society_id: societyId },
        access.paths('view', 'members') === 'all'
          ? {}
          : { locations: scopeWhere(access, 'view', 'members', (prefix) => ({ path: { startsWith: prefix } })) },
        location ? { locations: { path: { startsWith: location.path } } } : {},
      ],
    };
    const [groups, rows] = await Promise.all([
      this.prisma.memberships.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.memberships.findMany({
        where: { AND: [where, { joined_on: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } }] },
        select: {
          member_no: true,
          membership_code: true,
          joined_on: true,
          status: true,
          persons: { select: { id: true, full_name: true, full_name_en: true, phone: true } },
          organisations: { select: { id: true, name: true, persons: { select: { phone: true } } } },
          locations: { select: { name: true, path: true } },
        },
        orderBy: [{ joined_on: 'asc' }, { member_no: 'asc' }],
        take: MEMBERS_REPORT_LIMIT + 1,
      }),
    ]);
    const listed = rows.slice(0, MEMBERS_REPORT_LIMIT);
    const names = await this.tree.addressNames(societyId, listed.flatMap((row) => (row.locations ? [row.locations.path] : [])));
    const count = (status: MembershipStatus) => groups.find((group) => group.status === status)?._count._all ?? 0;
    return {
      from,
      to,
      location: location ? { id: location.id, name: location.name } : null,
      counts: { active: count('active'), lapsed: count('lapsed'), cancelled: count('cancelled') },
      joined: listed.map((row) => ({
        memberNo: row.member_no,
        membershipCode: row.membership_code,
        personId: row.persons?.id ?? null,
        organisationId: row.organisations?.id ?? null,
        name: row.persons?.full_name ?? row.organisations?.name ?? '',
        nameEn: row.persons?.full_name_en ?? null,
        // An organisation is reached through its contact person.
        phone: row.persons ? row.persons.phone : (row.organisations?.persons?.phone ?? null),
        address: row.locations ? [...addressOf(row.locations.path, names), row.locations.name] : [],
        joinedOn: isoDate(row.joined_on),
        status: row.status as MembershipStatus,
      })),
      truncated: rows.length > MEMBERS_REPORT_LIMIT,
    };
  }

  /** Current renters in address order. 403 `thana_sharing_off`; 404 `location_not_found`. */
  async renters(access: CallerAccess, societyId: string, query: RentersReportQuery): Promise<RentersReport> {
    const setting = await this.prisma.society_settings.findUnique({
      where: { society_id_key: { society_id: societyId, key: SETTING_KEYS.shareRentersWithThana } },
      select: { value: true },
    });
    if (setting?.value !== true) throw sharingOff();
    const location = query.locationId ? await this.renterAreas.parent(access, societyId, query.locationId) : null;
    const where = Prisma.sql`t.society_id = ${societyId}::uuid AND t.status IN ('active', 'moving_out')
      AND starts_with(l.path, ${location?.path ?? '/'}) AND ${inScope(access, 'members', 'export')}`;
    const household = Prisma.sql`(SELECT count(*) FROM occupants oc WHERE oc.tenancy_id = t.id AND oc.end_date IS NULL)::int`;
    const [rows, [totals]] = await Promise.all([
      this.prisma.$queryRaw<RenterRow[]>`
        SELECT t.id, t.unit_id, l.name, l.path, t.renter_type, t.status, t.start_date, t.police_form_submitted,
               p.id AS person_id, p.full_name, p.full_name_en, p.phone AS person_phone,
               g.id AS organisation_id, g.name AS organisation_name, cp.phone AS organisation_phone,
               ${household} AS household
        FROM tenancies t
        JOIN locations l ON l.id = t.unit_id
        LEFT JOIN locations pl ON pl.id = l.parent_id
        LEFT JOIN persons p ON p.id = t.primary_person_id
        LEFT JOIN organisations g ON g.id = t.organisation_id
        LEFT JOIN persons cp ON cp.id = g.contact_person_id
        WHERE ${where}
        ORDER BY pl.name COLLATE natural_sort, l.name COLLATE natural_sort, l.id
        LIMIT ${RENTERS_REPORT_LIMIT + 1}`,
      this.prisma.$queryRaw<{ tenancies: number; people: number; missing: number }[]>`
        SELECT count(*)::int AS tenancies, coalesce(sum(${household}), 0)::int AS people,
               count(*) FILTER (WHERE NOT t.police_form_submitted)::int AS missing
        FROM tenancies t JOIN locations l ON l.id = t.unit_id
        WHERE ${where}`,
    ]);
    const listed = rows.slice(0, RENTERS_REPORT_LIMIT);
    const names = await this.tree.addressNames(societyId, listed.map((row) => row.path));
    return {
      asOf: isoDate(todayDate()),
      location: location ? { id: location.id, name: location.name } : null,
      rows: listed.flatMap((row) => {
        const renter = row.person_id
          ? { kind: 'person' as const, id: row.person_id, name: row.full_name!, nameEn: row.full_name_en }
          : row.organisation_id
            ? { kind: 'organisation' as const, id: row.organisation_id, name: row.organisation_name!, nameEn: null }
            : null;
        if (!renter) return [];
        return [
          {
            tenancyId: row.id,
            unitId: row.unit_id,
            unit: row.name,
            address: addressOf(row.path, names),
            renter,
            phone: row.person_id ? row.person_phone : row.organisation_phone,
            renterType: row.renter_type as RenterType,
            status: row.status as TenancyStatus,
            startDate: isoDate(row.start_date),
            household: row.household,
            policeForm: row.police_form_submitted,
          },
        ];
      }),
      totals: { tenancies: totals!.tenancies, people: totals!.people, policeFormMissing: totals!.missing },
      truncated: rows.length > RENTERS_REPORT_LIMIT,
    };
  }
}
