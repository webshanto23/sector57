import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  CERTIFICATE_TEMPLATES_KEY,
  certificateTemplatesOf,
  digitVariants,
  renderCertificate,
  tiedForCertificate,
  type CertificateCreateInput,
  type CertificateDetail,
  type CertificateLang,
  type CertificateList,
  type CertificateListQuery,
  type CertificateType,
  type CertificateUpdateInput,
  type VehicleUnitPeople,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { unitDues } from '../billing/unit-dues.js';
import { isoDate, todayDate } from '../common/dates.js';
import { MemberRowsService } from '../members/member-rows.service.js';
import { auditOf, personNotFound } from '../members/parties.service.js';
import { unitTies, type TieUnit } from '../members/unit-ties.js';
import { scopeWhere } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beyondPermissions } from '../property/tree.service.js';
import { certificatePlace, certificateRowOf, certificateSelect, certificateSnapshot, letterValues, userRefOf, type CertificateSelected } from './certificate-rows.js';

type Client = Prisma.TransactionClient;

export const certificateNotFound = () => new NotFoundException({ code: 'certificate_not_found', message: 'Certificate not found' });
export const certificateNotDraft = () => new ConflictException({ code: 'certificate_not_draft', message: 'This certificate has been issued' });
const unitNotFound = () => new NotFoundException({ code: 'unit_not_found', message: 'Unit not found' });
const personNotAtUnit = () =>
  new ConflictException({ code: 'certificate_person_not_at_unit', message: 'This person is not tied to the unit as this certificate needs' });
const notMember = () => new ConflictException({ code: 'certificate_not_member', message: 'This person has no active membership' });

/**
 * Certificates and NOCs (সনদ ও অনাপত্তিপত্র), under the `certificates` permission where their
 * unit is: lists, the detail and drafts. Issuing, voiding, printing and the templates are in
 * `CertificateActionsService`. Both write their own audit rows.
 */
@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rows: MemberRowsService,
  ) {}

  async list(actor: Actor, query: CertificateListQuery): Promise<CertificateList> {
    const { page, pageSize } = query;
    const scope = this.scope(actor);
    const where: Prisma.certificatesWhereInput = { AND: [scope, ...this.filters(query)] };
    const [rows, total, counts] = await Promise.all([
      this.prisma.certificates.findMany({ where, select: certificateSelect, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.certificates.count({ where }),
      this.prisma.certificates.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
    ]);
    const place = await this.rows.places(actor.societyId, rows.map(certificatePlace));
    const count = (status: string) => counts.find((row) => row.status === status)?._count._all ?? 0;
    return {
      items: rows.map((row) => certificateRowOf(row, place(certificatePlace(row)))),
      total,
      page,
      pageSize,
      counts: { draft: count('draft'), issued: count('issued'), void: count('void') },
      can: { create: actor.access.can('create', 'certificates') },
    };
  }

  async get(actor: Actor, id: string): Promise<CertificateDetail> {
    const row = await this.visible(actor, id);
    const unit = certificatePlace(row);
    const place = (await this.rows.places(actor.societyId, [unit]))(unit);
    const at = { path: unit.path };
    const draft = row.status === 'draft';
    const body = row.body ?? (await this.letter(this.prisma, actor.societyId, row, isoDate(todayDate()), null));
    const dues = draft && actor.access.can('view', 'billing', at) ? await unitDues(this.prisma, actor.societyId, unit.id) : null;
    return {
      ...certificateRowOf(row, place),
      addressee: row.addressee,
      body,
      signerName: row.signer_name,
      signerTitle: row.signer_title,
      duesOwedAtIssue: row.dues_owed?.toFixed(2) ?? null,
      issuedBy: userRefOf(row.users_issued),
      voidedAt: row.voided_at?.toISOString() ?? null,
      voidedBy: userRefOf(row.users_voided),
      voidReason: row.void_reason,
      createdBy: userRefOf(row.users),
      dues,
      can: {
        edit: draft && actor.access.can('edit', 'certificates', at),
        delete: draft && actor.access.can('delete', 'certificates', at),
        issue: draft && actor.access.can('approve', 'certificates', at),
        void: row.status === 'issued' && actor.access.can('approve', 'certificates', at),
      },
    };
  }

  /** A draft. 404 `unit_not_found`, `person_not_found`; 409 `certificate_person_not_at_unit`, `certificate_not_member`. */
  async create(actor: Actor, input: CertificateCreateInput): Promise<CertificateDetail> {
    const unit = await this.unitAt(actor, input.unitId, 'create');
    await this.checkPerson(this.prisma, actor.societyId, input.type, unit, input.personId);
    const id = await this.prisma.$transaction(async (tx) => {
      const made = await tx.certificates.create({
        data: {
          society_id: actor.societyId,
          type: input.type,
          lang: input.lang,
          person_id: input.personId,
          unit_id: unit.id,
          addressee: input.addressee,
          purpose: input.purpose,
          created_by: actor.userId,
        },
        select: certificateSelect,
      });
      await this.audit.record({ ...auditOf(actor, 'certificate', 'create', made.id), after: certificateSnapshot(made) }, tx);
      return made.id;
    });
    return this.get(actor, id);
  }

  /** Drafts only (409 `certificate_not_draft`); a new person is checked again. */
  async update(actor: Actor, id: string, input: CertificateUpdateInput): Promise<CertificateDetail> {
    const before = await this.changeable(actor, id, 'edit');
    if (input.personId && input.personId !== before.person_id) {
      await this.checkPerson(this.prisma, actor.societyId, before.type as CertificateType, certificatePlace(before), input.personId);
    }
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.certificates.updateMany({
        where: { id, status: 'draft' },
        data: { lang: input.lang, person_id: input.personId, addressee: input.addressee, purpose: input.purpose, updated_at: new Date() },
      });
      if (count === 0) throw certificateNotDraft();
      const after = await tx.certificates.findUniqueOrThrow({ where: { id }, select: certificateSelect });
      await this.audit.record({ ...auditOf(actor, 'certificate', 'update', id), before: certificateSnapshot(before), after: certificateSnapshot(after) }, tx);
    });
    return this.get(actor, id);
  }

  /** A draft made by mistake; issued ones are voided instead (409 `certificate_not_draft`). */
  async remove(actor: Actor, id: string): Promise<void> {
    const before = await this.changeable(actor, id, 'delete');
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.certificates.deleteMany({ where: { id, status: 'draft' } });
      if (count === 0) throw certificateNotDraft();
      await this.audit.record({ ...auditOf(actor, 'certificate', 'delete', id), before: certificateSnapshot(before) }, tx);
    });
  }

  /** The letter in its language with today's values; `certNo` null while a draft. */
  async letter(client: Client, societyId: string, row: CertificateSelected, day: string, certNo: string | null): Promise<string> {
    const [society, setting, membership] = await Promise.all([
      client.societies.findUniqueOrThrow({ where: { id: societyId }, select: { name_bn: true, name_en: true } }),
      client.society_settings.findUnique({ where: { society_id_key: { society_id: societyId, key: CERTIFICATE_TEMPLATES_KEY } }, select: { value: true } }),
      client.memberships.findFirst({ where: { society_id: societyId, person_id: row.persons.id, status: 'active' }, select: { member_no: true }, orderBy: { joined_on: 'desc' } }),
    ]);
    const unit = certificatePlace(row);
    const place = (await this.rows.places(societyId, [unit]))(unit);
    const lang = row.lang as CertificateLang;
    const template = certificateTemplatesOf(setting?.value)[row.type as CertificateType][lang];
    return renderCertificate(
      template,
      letterValues({ lang, person: row.persons, place, society, day, certNo, memberNo: membership?.member_no ?? null, addressee: row.addressee, purpose: row.purpose }),
    );
  }

  /**
   * The person is in this society (404), tied to the unit as the type needs (409
   * `certificate_person_not_at_unit`) and, for a membership certificate, an active member (409).
   */
  async checkPerson(client: Client, societyId: string, type: CertificateType, unit: TieUnit, personId: string): Promise<void> {
    const person = await client.persons.findFirst({ where: { id: personId, society_id: societyId }, select: { id: true } });
    if (!person) throw personNotFound();
    const ties = await unitTies(client, societyId, unit, personId);
    if (!tiedForCertificate(type, ties.map((row) => row.tie))) throw personNotAtUnit();
    if (type === 'membership') {
      const member = await client.memberships.count({ where: { society_id: societyId, person_id: personId, status: 'active' } });
      if (member === 0) throw notMember();
    }
  }

  /** A certificate the caller may see where its unit is, or 404. */
  async visible(actor: Actor, id: string): Promise<CertificateSelected> {
    const row = await this.prisma.certificates.findFirst({ where: { id, society_id: actor.societyId }, select: certificateSelect });
    if (!row || !actor.access.can('view', 'certificates', { path: certificatePlace(row).path })) throw certificateNotFound();
    return row;
  }

  /** A certificate the caller may `action` at its unit (403); drafts only unless `approve` (409 `certificate_not_draft`). */
  async changeable(actor: Actor, id: string, action: 'edit' | 'delete' | 'approve'): Promise<CertificateSelected> {
    const row = await this.visible(actor, id);
    if (!actor.access.can(action, 'certificates', { path: certificatePlace(row).path })) throw beyondPermissions();
    if (action !== 'approve' && row.status !== 'draft') throw certificateNotDraft();
    return row;
  }

  /** Certificate rows in the caller's `certificates.view` area. */
  scope(actor: Actor): Prisma.certificatesWhereInput {
    return {
      society_id: actor.societyId,
      units: { locations: scopeWhere(actor.access, 'view', 'certificates', (prefix) => ({ path: { startsWith: prefix } })) },
    };
  }

  /** Who owns (at or above), rents or lives in a unit the caller sees certificates at (404 `unit_not_found`). */
  async unitPeople(actor: Actor, unitId: string): Promise<VehicleUnitPeople> {
    const unit = await this.unitAt(actor, unitId, 'view');
    const ties = await unitTies(this.prisma, actor.societyId, unit, null);
    const people = await this.prisma.persons.findMany({
      where: { id: { in: [...new Set(ties.map((tie) => tie.person_id))] }, society_id: actor.societyId },
      select: { id: true, full_name: true, full_name_en: true },
      orderBy: [{ full_name: 'asc' }, { id: 'asc' }],
    });
    return {
      items: people.map((person) => ({
        id: person.id,
        name: person.full_name,
        nameEn: person.full_name_en,
        ties: ties.filter((tie) => tie.person_id === person.id).map((tie) => tie.tie),
      })),
    };
  }

  /** A unit the caller sees (404 `unit_not_found`) and may `action` certificates at (403). */
  private async unitAt(actor: Actor, unitId: string, action: 'view' | 'create'): Promise<TieUnit> {
    const row = await this.prisma.units.findFirst({ where: { location_id: unitId, society_id: actor.societyId }, select: { locations: { select: { id: true, path: true } } } });
    const at = row && { path: row.locations.path };
    if (!at || !(actor.access.can('view', 'certificates', at) || actor.access.can('view', 'locations', at))) throw unitNotFound();
    if (!actor.access.can(action, 'certificates', at)) throw action === 'view' ? unitNotFound() : beyondPermissions();
    return row.locations;
  }

  private filters(query: CertificateListQuery): Prisma.certificatesWhereInput[] {
    const filters: Prisma.certificatesWhereInput[] = [];
    if (query.type) filters.push({ type: query.type });
    if (query.status) filters.push({ status: query.status });
    if (query.unitId) filters.push({ unit_id: query.unitId });
    if (query.personId) filters.push({ person_id: query.personId });
    if (query.locationId) filters.push({ units: { locations: { path: { contains: `/${query.locationId}/` } } } });
    if (query.q) {
      filters.push({
        OR: digitVariants(query.q).flatMap((term) => [
          { cert_no: { contains: term, mode: 'insensitive' as const } },
          { persons: { full_name: { contains: term, mode: 'insensitive' as const } } },
          { persons: { full_name_en: { contains: term, mode: 'insensitive' as const } } },
          { persons: { phone: { contains: term } } },
        ]),
      });
    }
    return filters;
  }
}
