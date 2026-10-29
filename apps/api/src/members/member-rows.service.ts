import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import {
  toMembershipStatus,
  toMoveKind,
  toRelation,
  toRenterType,
  toTenancyStatus,
  type Membership,
  type Occupant,
  type Ownership,
  type Party,
  type Place,
  type Tenancy,
} from '@s57/shared';
import { isoDate } from '../common/dates.js';
import { mediaUrl, thumbKey } from '../common/media.js';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addressOf, TreeService } from '../property/tree.service.js';

export const personPartySelect = {
  id: true,
  full_name: true,
  full_name_en: true,
  phone: true,
  photo_url: true,
  verified_at: true,
} satisfies Prisma.personsSelect;

export const organisationPartySelect = {
  id: true,
  name: true,
  persons: { select: { phone: true } },
} satisfies Prisma.organisationsSelect;

export const placeSelect = { id: true, name: true, path: true, location_levels: { select: { is_unit_level: true } } } satisfies Prisma.locationsSelect;

const ownershipSelect = {
  id: true,
  share_percent: true,
  start_date: true,
  end_date: true,
  locations: { select: placeSelect },
  persons: { select: personPartySelect },
  organisations: { select: organisationPartySelect },
} satisfies Prisma.ownershipsSelect;

const tenancySelect = {
  id: true,
  renter_type: true,
  status: true,
  start_date: true,
  end_date: true,
  monthly_rent: true,
  police_form_submitted: true,
  units: { select: { locations: { select: placeSelect } } },
  persons: { select: personPartySelect },
  organisations: { select: organisationPartySelect },
  move_events: { where: { status: 'open' }, select: { id: true, kind: true }, take: 1 },
} satisfies Prisma.tenanciesSelect;

const occupantSelect = {
  id: true,
  tenancy_id: true,
  relation: true,
  start_date: true,
  end_date: true,
  units: { select: { locations: { select: placeSelect } } },
  persons: { select: personPartySelect },
} satisfies Prisma.occupantsSelect;

type PersonParty = Prisma.personsGetPayload<{ select: typeof personPartySelect }>;
type OrganisationParty = Prisma.organisationsGetPayload<{ select: typeof organisationPartySelect }>;
type PlaceRow = Prisma.locationsGetPayload<{ select: typeof placeSelect }>;

/** Current rows first (no end date), then the newest. */
const currentFirst = [{ end_date: { sort: 'desc', nulls: 'first' } }, { start_date: 'desc' }, { id: 'asc' }] as const;

/**
 * Reads ownerships, tenancies and household rows with their person or organisation and
 * the place they point at. Callers pass the `where` that keeps rows in the society and the
 * caller's area.
 */
@Injectable()
export class MemberRowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tree: TreeService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  personParty(row: PersonParty): Party {
    return {
      kind: 'person',
      id: row.id,
      name: row.full_name,
      nameEn: row.full_name_en,
      phone: row.phone,
      photoUrl: mediaUrl(thumbKey(row.photo_url), this.env.MEDIA_BASE_URL),
      verified: row.verified_at !== null,
    };
  }

  organisationParty(row: OrganisationParty): Party {
    return { kind: 'organisation', id: row.id, name: row.name, nameEn: null, phone: row.persons?.phone ?? null, photoUrl: null, verified: null };
  }

  private party(person: PersonParty | null, organisation: OrganisationParty | null): Party | null {
    if (person) return this.personParty(person);
    if (organisation) return this.organisationParty(organisation);
    return null;
  }

  /** Builds `Place`s for these locations, with their addresses read in one query. */
  async places(societyId: string, rows: PlaceRow[]): Promise<(row: PlaceRow) => Place> {
    const names = await this.tree.addressNames(
      societyId,
      rows.map((row) => row.path),
    );
    return (row) => ({ id: row.id, name: row.name, address: addressOf(row.path, names), isUnit: row.location_levels.is_unit_level });
  }

  async ownerships(societyId: string, where: Prisma.ownershipsWhereInput): Promise<Ownership[]> {
    const rows = await this.prisma.ownerships.findMany({
      where: { AND: [where, { society_id: societyId, locations: { society_id: societyId } }] },
      select: ownershipSelect,
      orderBy: [...currentFirst],
    });
    const place = await this.places(societyId, rows.map((row) => row.locations));
    return rows.flatMap((row) => {
      const owner = this.party(row.persons, row.organisations);
      if (!owner) return [];
      return [
        {
          id: row.id,
          place: place(row.locations),
          owner,
          sharePercent: row.share_percent.toString(),
          startDate: isoDate(row.start_date),
          endDate: row.end_date ? isoDate(row.end_date) : null,
        },
      ];
    });
  }

  async tenancies(societyId: string, where: Prisma.tenanciesWhereInput): Promise<Tenancy[]> {
    const rows = await this.prisma.tenancies.findMany({
      where: { AND: [where, { society_id: societyId, units: { society_id: societyId } }] },
      select: tenancySelect,
      orderBy: [...currentFirst],
    });
    const place = await this.places(societyId, rows.map((row) => row.units.locations));
    return rows.map((row) => ({
      id: row.id,
      place: place(row.units.locations),
      renter: this.party(row.persons, row.organisations),
      renterType: toRenterType(row.renter_type),
      status: toTenancyStatus(row.status),
      startDate: isoDate(row.start_date),
      endDate: row.end_date ? isoDate(row.end_date) : null,
      monthlyRent: row.monthly_rent?.toString() ?? null,
      policeFormSubmitted: row.police_form_submitted,
      openMove: row.move_events[0] ? { id: row.move_events[0].id, kind: toMoveKind(row.move_events[0].kind) } : null,
    }));
  }

  async occupants(societyId: string, where: Prisma.occupantsWhereInput): Promise<Occupant[]> {
    const rows = await this.prisma.occupants.findMany({
      where: { AND: [where, { society_id: societyId, units: { society_id: societyId } }] },
      select: occupantSelect,
      orderBy: [...currentFirst],
    });
    const place = await this.places(societyId, rows.map((row) => row.units.locations));
    return rows.map((row) => ({
      id: row.id,
      place: place(row.units.locations),
      person: this.personParty(row.persons),
      tenancyId: row.tenancy_id,
      relation: toRelation(row.relation),
      startDate: isoDate(row.start_date),
      endDate: row.end_date ? isoDate(row.end_date) : null,
    }));
  }

  /** A person's or organisation's active membership, else their latest one. */
  async membership(societyId: string, where: Prisma.membershipsWhereInput): Promise<Membership | null> {
    const row = await this.prisma.memberships.findFirst({
      where: { ...where, society_id: societyId },
      orderBy: [{ status: 'asc' }, { joined_on: 'desc' }],
      select: { member_no: true, membership_code: true, status: true, joined_on: true, ended_on: true },
    });
    return row
      ? {
          memberNo: row.member_no,
          membershipCode: row.membership_code,
          status: toMembershipStatus(row.status),
          joinedOn: isoDate(row.joined_on),
          endedOn: row.ended_on ? isoDate(row.ended_on) : null,
        }
      : null;
  }
}
