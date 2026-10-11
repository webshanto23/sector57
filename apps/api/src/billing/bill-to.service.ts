import { Injectable } from '@nestjs/common';
import {
  OPEN_TENANCY_STATUSES,
  pickBillTo,
  toBillTo,
  toTenancyStatus,
  type BillToSnapshot,
  type OwnerCandidate,
  type Party,
  type Payer,
} from '@s57/shared';
import { isoDate } from '../common/dates.js';
import { MemberRowsService, organisationPartySelect, personPartySelect } from '../members/member-rows.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addressOf, pathIds, TreeService } from '../property/tree.service.js';

type Client = Pick<PrismaService, 'units' | 'tenancies' | 'ownerships' | 'persons' | 'organisations'>;

/** A unit as billing needs it. */
export type BillableUnit = { id: string; name: string; code: string | null; path: string; isActive: boolean };

export type BillToChoice = { payer: Payer; role: 'owner' | 'renter' };

const payerOf = (personId: string | null, organisationId: string | null): Payer | null =>
  personId ? { kind: 'person', id: personId } : organisationId ? { kind: 'organisation', id: organisationId } : null;

/**
 * Works out who a unit's bills go to (the rule is `pickBillTo` in shared) and writes down
 * who and where that was on the day, for the bill to keep.
 */
@Injectable()
export class BillToService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tree: TreeService,
    private readonly rows: MemberRowsService,
  ) {}

  /** Who each unit's bill would go to now, by unit id (null: nobody found). Pass `tx` to read inside a transaction. */
  async choose(societyId: string, units: Pick<BillableUnit, 'id' | 'path'>[], client: Client = this.prisma): Promise<Map<string, BillToChoice | null>> {
    if (units.length === 0) return new Map();
    const unitIds = units.map((unit) => unit.id);
    const locationIds = [...new Set(units.flatMap((unit) => pathIds(unit.path)))];
    const [settings, tenancies, ownerships] = await Promise.all([
      client.units.findMany({ where: { location_id: { in: unitIds }, society_id: societyId }, select: { location_id: true, bill_to: true } }),
      client.tenancies.findMany({
        where: { society_id: societyId, unit_id: { in: unitIds }, status: { in: [...OPEN_TENANCY_STATUSES] } },
        select: { unit_id: true, status: true, primary_person_id: true, organisation_id: true },
      }),
      client.ownerships.findMany({
        where: { society_id: societyId, location_id: { in: locationIds }, end_date: null },
        select: { location_id: true, person_id: true, organisation_id: true, share_percent: true, start_date: true },
        orderBy: { id: 'asc' },
      }),
    ]);

    const owners = new Map<string, OwnerCandidate[]>();
    for (const row of ownerships) {
      const payer = payerOf(row.person_id, row.organisation_id);
      if (!payer) continue;
      const list = owners.get(row.location_id) ?? [];
      list.push({ payer, sharePercent: row.share_percent.toFixed(2), startDate: isoDate(row.start_date) });
      owners.set(row.location_id, list);
    }
    const billTo = new Map(settings.map((row) => [row.location_id, toBillTo(row.bill_to)]));
    const tenancy = new Map(tenancies.map((row) => [row.unit_id, row]));

    return new Map(
      units.map((unit) => {
        const open = tenancy.get(unit.id);
        const choice = pickBillTo({
          billTo: billTo.get(unit.id) ?? 'owner',
          tenancy: open ? { status: toTenancyStatus(open.status), payer: payerOf(open.primary_person_id, open.organisation_id) } : null,
          // The unit itself first, then each location above it, nearest first.
          ownersByLevel: pathIds(unit.path)
            .reverse()
            .map((id) => owners.get(id) ?? []),
        });
        return [unit.id, choice];
      }),
    );
  }

  /** The payer as shown in a list. */
  async parties(payers: Payer[]): Promise<Map<string, Party>> {
    const personIds = payers.filter((p) => p.kind === 'person').map((p) => p.id);
    const organisationIds = payers.filter((p) => p.kind === 'organisation').map((p) => p.id);
    const [persons, organisations] = await Promise.all([
      personIds.length ? this.prisma.persons.findMany({ where: { id: { in: personIds } }, select: personPartySelect }) : [],
      organisationIds.length ? this.prisma.organisations.findMany({ where: { id: { in: organisationIds } }, select: organisationPartySelect }) : [],
    ]);
    return new Map<string, Party>([
      ...persons.map((row) => [row.id, this.rows.personParty(row)] as const),
      ...organisations.map((row) => [row.id, this.rows.organisationParty(row)] as const),
    ]);
  }

  /** What the bill keeps of its payer and unit. */
  async snapshot(
    client: Client,
    societyId: string,
    payer: Payer,
    role: BillToSnapshot['role'],
    unit: BillableUnit | null,
    memberNo: number | null = null,
  ): Promise<BillToSnapshot> {
    const party =
      payer.kind === 'person'
        ? await client.persons
            .findFirstOrThrow({ where: { id: payer.id, society_id: societyId }, select: { full_name: true, full_name_en: true, phone: true } })
            .then((row) => ({ name: row.full_name, nameEn: row.full_name_en, phone: row.phone }))
        : await client.organisations
            .findFirstOrThrow({ where: { id: payer.id, society_id: societyId }, select: { name: true, persons: { select: { phone: true } } } })
            .then((row) => ({ name: row.name, nameEn: null, phone: row.persons?.phone ?? null }));
    const names = unit ? await this.tree.addressNames(societyId, [unit.path]) : new Map<string, string>();
    return {
      kind: payer.kind,
      id: payer.id,
      ...party,
      role,
      memberNo,
      unit: unit ? { id: unit.id, name: unit.name, code: unit.code, address: addressOf(unit.path, names) } : null,
    };
  }
}
