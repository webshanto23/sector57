import { Injectable } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  asciiDigits,
  digitVariants,
  HELPDESK_SLA_KEY,
  slaHoursOf,
  type SlaHours,
  type SlaView,
  type TicketReporterInput,
  type TicketStaffList,
  type TicketStaffQuery,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { auditOf, personNotFound } from '../members/parties.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { pathIds } from '../property/tree.service.js';
import { staffNotFound } from '../staff/staff.service.js';
import { staffName, staffRefOf } from './ticket-rows.js';

type Client = Pick<PrismaService, 'society_settings'>;

/** Most staff a search returns. */
const STAFF_LIMIT = 20;

/** The modules whose work may be given to staff here. */
type StaffModule = 'helpdesk' | 'work_orders';

/** The reporter columns of a ticket. */
export type ReporterColumns = { reporter_person_id: string | null; reporter_name: string | null; reporter_phone: string | null };

/**
 * What tickets lean on: the SLA hours per category (a society setting), the staff a ticket
 * may be given to, and the reporter.
 */
@Injectable()
export class HelpdeskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The hours in force: the saved setting over the defaults. */
  async slaHours(societyId: string, client: Client = this.prisma): Promise<SlaHours> {
    const row = await client.society_settings.findUnique({ where: { society_id_key: { society_id: societyId, key: HELPDESK_SLA_KEY } }, select: { value: true } });
    return slaHoursOf(row?.value);
  }

  async sla(actor: Actor): Promise<SlaView> {
    return { hours: await this.slaHours(actor.societyId), can: { edit: actor.access.can('edit', 'settings') } };
  }

  /** Saves the hours for every category; tickets already open keep their due time. */
  async setSla(actor: Actor, hours: SlaHours): Promise<SlaView> {
    await this.prisma.$transaction(async (tx) => {
      const before = await this.slaHours(actor.societyId, tx);
      await tx.society_settings.upsert({
        where: { society_id_key: { society_id: actor.societyId, key: HELPDESK_SLA_KEY } },
        update: { value: hours, updated_by: actor.userId },
        create: { society_id: actor.societyId, key: HELPDESK_SLA_KEY, value: hours, updated_by: actor.userId },
      });
      await this.audit.record({ ...auditOf(actor, 'setting', 'update', null), before: { [HELPDESK_SLA_KEY]: before }, after: { [HELPDESK_SLA_KEY]: hours } }, tx);
    });
    return this.sla(actor);
  }

  /** Current staff the caller may give tickets (or work orders) to. Names and designations only. */
  async staff(actor: Actor, query: TicketStaffQuery, module: StaffModule = 'helpdesk'): Promise<TicketStaffList> {
    const filters: Prisma.staffWhereInput[] = [this.staffScope(actor, module)];
    if (query.q) {
      const terms = digitVariants(query.q);
      const numbers = [...new Set(terms.map((term) => asciiDigits(term)))].filter((term) => /^\d{1,9}$/.test(term));
      filters.push({
        OR: [
          ...terms.flatMap((term) => [
            { persons: { full_name: { contains: term, mode: 'insensitive' as const } } },
            { persons: { full_name_en: { contains: term, mode: 'insensitive' as const } } },
            { designation_bn: { contains: term, mode: 'insensitive' as const } },
          ]),
          ...numbers.map((value) => ({ staff_no: Number(value) })),
        ],
      });
    }
    const rows = await this.prisma.staff.findMany({
      where: { AND: filters },
      select: { ...staffName.select, designation_bn: true, designation_en: true },
      orderBy: [{ staff_no: 'asc' }],
      take: STAFF_LIMIT,
    });
    return { items: rows.map((row) => ({ ...staffRefOf(row)!, designation: { bn: row.designation_bn, en: row.designation_en } })) };
  }

  /** A staff member the caller may give a ticket (or work order) to (404 `staff_not_found` otherwise). */
  async pickStaff(actor: Actor, staffId: string, module: StaffModule = 'helpdesk'): Promise<{ id: string; name: string }> {
    const row = await this.prisma.staff.findFirst({ where: { AND: [this.staffScope(actor, module), { id: staffId }] }, select: staffName.select });
    if (!row) throw staffNotFound();
    return { id: row.id, name: row.persons.full_name };
  }

  /** The reporter as columns; a person must be in the society (404 `person_not_found`). */
  async reporter(societyId: string, input: TicketReporterInput): Promise<ReporterColumns> {
    if (input.kind === 'typed') return { reporter_person_id: null, reporter_name: input.name, reporter_phone: input.phone };
    if (input.kind === 'none') return { reporter_person_id: null, reporter_name: null, reporter_phone: null };
    const person = await this.prisma.persons.findFirst({ where: { id: input.personId, society_id: societyId }, select: { id: true } });
    if (!person) throw personNotFound();
    return { reporter_person_id: person.id, reporter_name: null, reporter_phone: null };
  }

  /** Current staff posted inside the caller's create or edit area of `module`, or above it. */
  private staffScope(actor: Actor, module: StaffModule): Prisma.staffWhereInput {
    const create = actor.access.paths('create', module);
    const edit = actor.access.paths('edit', module);
    const base: Prisma.staffWhereInput = { society_id: actor.societyId, left_on: null };
    if (create === 'all' || edit === 'all') return base;
    const paths = [...new Set([...create, ...edit])];
    const above = [...new Set(paths.flatMap((path) => pathIds(path).slice(0, -1)))];
    return { ...base, OR: [...paths.map((path) => ({ locations: { path: { startsWith: path } } })), { posted_location_id: { in: above } }] };
  }
}
