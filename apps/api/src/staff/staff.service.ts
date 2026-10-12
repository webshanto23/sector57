import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  asciiDigits,
  digitVariants,
  toGender,
  toStaffKind,
  type StaffCreateInput,
  type StaffCsvQuery,
  type StaffDetail,
  type StaffKind,
  type StaffLeaveInput,
  type StaffList,
  type StaffListQuery,
  type StaffRejoinInput,
  type StaffRow,
  type StaffUpdateInput,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { mediaUrl } from '../common/media.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { ENV, type Env } from '../config/env.js';
import { placeSelect, MemberRowsService } from '../members/member-rows.service.js';
import { auditOf, canOnParty, dayOf, endBeforeStart, nidTaken, PartiesService, personData, phoneTaken } from '../members/parties.service.js';
import { scopeWhere, type CallerAccess } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beyondPermissions, locationNotFound, TreeService } from '../property/tree.service.js';

type Tx = Prisma.TransactionClient;

export const staffNotFound = () => new NotFoundException({ code: 'staff_not_found', message: 'Staff member not found' });
const currentExists = () => new ConflictException({ code: 'staff_current_exists', message: 'This person is already working here' });
const alreadyLeft = () => new ConflictException({ code: 'staff_left', message: 'This staff member has already left' });
const notLeft = () => new ConflictException({ code: 'staff_not_left', message: 'This staff member is still working here' });
const payNotAllowed = () => new ForbiddenException({ code: 'beyond_your_permissions', message: 'Only a society-wide staff editor may set pay' });
export const futureDate = () => new BadRequestException({ code: 'future_date', message: 'That day has not come yet' });

/** Most rows a CSV carries. */
const CSV_LIMIT = 5000;

const staffSelect = {
  id: true,
  staff_no: true,
  designation_bn: true,
  designation_en: true,
  kind: true,
  joined_on: true,
  left_on: true,
  persons: { select: { id: true, full_name: true, full_name_en: true, phone: true, photo_url: true } },
  locations: { select: placeSelect },
} satisfies Prisma.staffSelect;
type Selected = Prisma.staffGetPayload<{ select: typeof staffSelect }>;

const detailSelect = {
  ...staffSelect,
  person_id: true,
  left_reason: true,
  monthly_salary: true,
  daily_rate: true,
  created_at: true,
  persons: {
    select: { id: true, full_name: true, full_name_en: true, phone: true, photo_url: true, email: true, nid: true, date_of_birth: true, gender: true },
  },
} satisfies Prisma.staffSelect;
type DetailRow = Prisma.staffGetPayload<{ select: typeof detailSelect }>;

/** The pay column a kind uses. */
const payColumns = (kind: StaffKind, pay: string | null) =>
  kind === 'daily' ? { daily_rate: pay, monthly_salary: null } : { monthly_salary: pay, daily_rate: null };
const payOf = (row: { kind: string; monthly_salary: Prisma.Decimal | null; daily_rate: Prisma.Decimal | null }) =>
  (toStaffKind(row.kind) === 'daily' ? row.daily_rate : row.monthly_salary)?.toFixed(2) ?? null;

/** What an audit row keeps of a stint (never an NID). */
const snapshot = (row: DetailRow) => ({
  staffNo: row.staff_no,
  personId: row.person_id,
  designationBn: row.designation_bn,
  designationEn: row.designation_en,
  kind: row.kind,
  postedLocationId: row.locations.id,
  joinedOn: isoDate(row.joined_on),
  leftOn: row.left_on ? isoDate(row.left_on) : null,
  pay: payOf(row),
});

/** Pay is seen and set only by those who may edit staff across the whole society. */
export const seesPay = (access: CallerAccess) => access.paths('edit', 'staff') === 'all';

/**
 * Staff (`staff` permission, area-scoped through where they are posted). A staff member is
 * a person plus one row per stint of work: leaving is dated, nothing is deleted, and someone
 * who comes back starts a new stint with a new number. The person's own details change here
 * only when the caller may edit them as a member, or they are on file only as staff. Pay
 * needs a society-wide `staff.edit`. Every change is audited here.
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tree: TreeService,
    private readonly parties: PartiesService,
    private readonly rows: MemberRowsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async list(actor: Actor, query: StaffListQuery): Promise<StaffList> {
    const { page, pageSize } = query;
    const scope = this.scope(actor);
    const where = await this.where(actor, query);
    const current: Prisma.staffWhereInput = { AND: [scope, { left_on: null }] };
    const [rows, total, currentCount, designations] = await Promise.all([
      this.prisma.staff.findMany({ where, select: staffSelect, orderBy: [{ staff_no: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.staff.count({ where }),
      this.prisma.staff.count({ where: current }),
      this.prisma.staff.groupBy({ by: ['designation_bn'], where: current, _max: { designation_en: true }, orderBy: { designation_bn: 'asc' } }),
    ]);
    return {
      items: await this.toRows(actor.societyId, rows),
      total,
      page,
      pageSize,
      current: currentCount,
      designations: designations.map((row) => ({ bn: row.designation_bn, en: row._max.designation_en })),
      can: { create: actor.access.can('create', 'staff'), export: actor.access.can('export', 'staff') },
    };
  }

  /** The list's rows without paging (for the CSV), with pay when the caller may see it. */
  async all(actor: Actor, query: StaffCsvQuery): Promise<{ rows: (StaffRow & { pay: string | null })[]; truncated: boolean }> {
    const where = await this.where(actor, query);
    const rows = await this.prisma.staff.findMany({
      where,
      select: { ...staffSelect, monthly_salary: true, daily_rate: true },
      orderBy: [{ staff_no: 'asc' }],
      take: CSV_LIMIT + 1,
    });
    const kept = rows.slice(0, CSV_LIMIT);
    const pay = seesPay(actor.access);
    const shown = await this.toRows(actor.societyId, kept);
    return { rows: shown.map((row, i) => ({ ...row, pay: pay ? payOf(kept[i]!) : null })), truncated: rows.length > CSV_LIMIT };
  }

  async get(actor: Actor, id: string): Promise<StaffDetail> {
    const row = await this.visible(actor, id);
    const { access } = actor;
    const at = { path: row.locations.path };
    const [paths, stints, logins, current] = await Promise.all([
      this.parties.currentPaths(actor.societyId, { personId: row.person_id }),
      this.prisma.staff.findMany({
        where: { society_id: actor.societyId, person_id: row.person_id, NOT: { id } },
        select: { id: true, staff_no: true, designation_bn: true, designation_en: true, joined_on: true, left_on: true },
        orderBy: [{ joined_on: 'desc' }],
      }),
      this.prisma.users.count({ where: { society_id: actor.societyId, person_id: row.person_id } }),
      this.prisma.staff.count({ where: { person_id: row.person_id, left_on: null } }),
    ]);
    const edit = access.can('edit', 'staff', at);
    const editPerson = edit && this.mayEditPerson(access, paths);
    const pay = seesPay(access);
    const [shown] = await this.toRows(actor.societyId, [row]);
    const person = row.persons;
    return {
      ...shown!,
      leftReason: row.left_reason,
      personDetail: {
        fullName: person.full_name,
        fullNameEn: person.full_name_en,
        phone: person.phone,
        email: person.email,
        nid: editPerson ? person.nid : null,
        hasNid: person.nid !== null,
        dateOfBirth: person.date_of_birth ? isoDate(person.date_of_birth) : null,
        gender: toGender(person.gender),
      },
      pay: pay ? payOf(row) : null,
      stints: stints.map((stint) => ({
        id: stint.id,
        staffNo: stint.staff_no,
        designation: { bn: stint.designation_bn, en: stint.designation_en },
        joinedOn: isoDate(stint.joined_on),
        leftOn: stint.left_on ? isoDate(stint.left_on) : null,
      })),
      hasLogin: logins > 0,
      createdAt: row.created_at.toISOString(),
      can: {
        edit: edit && row.left_on === null,
        editPerson: editPerson && row.left_on === null,
        pay,
        leave: edit && row.left_on === null,
        rejoin: access.can('create', 'staff', at) && row.left_on !== null && current === 0,
        attendance: access.can('view', 'attendance', at),
        viewPerson: canOnParty(access, 'view', paths),
      },
    };
  }

  /** 409 `staff_current_exists` when the person already works here; 403 when setting pay without a society-wide grant. */
  async create(actor: Actor, input: StaffCreateInput): Promise<StaffDetail> {
    if (input.pay !== null && !seesPay(actor.access)) throw payNotAllowed();
    const id = await this.prisma.$transaction(async (tx) => {
      const post = await this.postAt(actor, input.postedLocationId, 'create');
      const person = await this.parties.resolvePerson(tx, actor.societyId, input.person);
      return this.insert(tx, actor, {
        person_id: person.id,
        designation_bn: input.designationBn,
        designation_en: input.designationEn,
        kind: input.kind,
        posted_location_id: post,
        joined_on: dayOf(input.joinedOn),
        ...payColumns(input.kind, input.pay),
      });
    });
    return this.get(actor, id);
  }

  /**
   * Current stints only (409 `staff_left`). Moving someone needs `staff.edit` at the new post
   * as well. A change of kind between daily and monthly clears the pay unless a new one is given.
   */
  async update(actor: Actor, id: string, input: StaffUpdateInput): Promise<StaffDetail> {
    const before = await this.editable(actor, id);
    const kind = input.kind ?? toStaffKind(before.kind);
    const switchesPay = (kind === 'daily') !== (toStaffKind(before.kind) === 'daily');
    const pay = input.pay !== undefined ? input.pay : switchesPay ? null : payOf(before);
    if ((input.pay !== undefined || (switchesPay && payOf(before) !== null)) && !seesPay(actor.access)) throw payNotAllowed();
    if (input.person) {
      const paths = await this.parties.currentPaths(actor.societyId, { personId: before.person_id });
      if (!this.mayEditPerson(actor.access, paths)) throw beyondPermissions();
      await this.checkUnique(actor.societyId, input.person.phone, input.person.nid, before.person_id);
    }
    const post = input.postedLocationId && input.postedLocationId !== before.locations.id ? await this.postAt(actor, input.postedLocationId, 'edit') : undefined;
    if (input.joinedOn) await this.checkJoinedOn(actor.societyId, id, input.joinedOn);

    try {
      await this.prisma.$transaction(async (tx) => {
        if (input.person) await tx.persons.update({ where: { id: before.person_id }, data: personData(input.person) });
        const after = await tx.staff.update({
          where: { id },
          data: {
            designation_bn: input.designationBn,
            designation_en: input.designationEn,
            kind,
            posted_location_id: post,
            joined_on: input.joinedOn ? dayOf(input.joinedOn) : undefined,
            ...payColumns(kind, pay),
          },
          select: detailSelect,
        });
        await this.audit.record(
          {
            ...auditOf(actor, 'staff', 'update', id),
            before: snapshot(before),
            after: { ...snapshot(after), ...(input.person ? { personChanged: true, nidChanged: before.persons.nid !== after.persons.nid } : {}) },
          },
          tx,
        );
      });
    } catch (error) {
      throw isUniqueViolation(error) ? phoneTaken() : error;
    }
    return this.get(actor, id);
  }

  /**
   * The last working day (not in the future, not before joining) and why. 409 `staff_left`;
   * 409 `attendance_after_leave` when days after it are already marked.
   */
  async leave(actor: Actor, id: string, input: StaffLeaveInput): Promise<StaffDetail> {
    const row = await this.editable(actor, id);
    if (input.leftOn > isoDate(todayDate())) throw futureDate();
    if (input.leftOn < isoDate(row.joined_on)) throw endBeforeStart();
    await this.prisma.$transaction(async (tx) => {
      const later = await tx.attendance.count({ where: { staff_id: id, date: { gt: dayOf(input.leftOn) } } });
      if (later > 0) throw new ConflictException({ code: 'attendance_after_leave', message: 'Days after that are already marked' });
      const { count } = await tx.staff.updateMany({ where: { id, left_on: null }, data: { left_on: dayOf(input.leftOn), left_reason: input.reason } });
      if (count === 0) throw alreadyLeft();
      await this.audit.record({ ...auditOf(actor, 'staff', 'leave', id), after: { leftOn: input.leftOn, reason: input.reason } }, tx);
    });
    return this.get(actor, id);
  }

  /**
   * A new stint for someone who left: same designation, kind and pay, at the same post unless
   * another is given. 409 `staff_not_left`, `staff_current_exists`; 400 `rejoin_before_leave`.
   */
  async rejoin(actor: Actor, id: string, input: StaffRejoinInput): Promise<StaffDetail> {
    const row = await this.visible(actor, id);
    if (!row.left_on) throw notLeft();
    if (input.joinedOn <= isoDate(row.left_on)) {
      throw new BadRequestException({ code: 'rejoin_before_leave', message: 'A new stint starts after the last one ended' });
    }
    const newId = await this.prisma.$transaction(async (tx) => {
      const post = await this.postAt(actor, input.postedLocationId ?? row.locations.id, 'create');
      return this.insert(
        tx,
        actor,
        {
          person_id: row.person_id,
          designation_bn: row.designation_bn,
          designation_en: row.designation_en,
          kind: row.kind,
          posted_location_id: post,
          joined_on: dayOf(input.joinedOn),
          monthly_salary: row.monthly_salary,
          daily_rate: row.daily_rate,
        },
        id,
      );
    });
    return this.get(actor, newId);
  }

  /**
   * What the caller may do with a stint's papers in the documents library: see them (`staff.view`
   * at the post), change them (`staff.edit` there), and see an NID copy (only those who may also
   * edit the person). Null when the stint is not in the society.
   */
  async paperRights(actor: Actor, id: string): Promise<{ view: boolean; edit: boolean; nid: boolean } | null> {
    const row = await this.prisma.staff.findFirst({
      where: { id, society_id: actor.societyId },
      select: { person_id: true, locations: { select: { path: true } } },
    });
    if (!row) return null;
    const at = { path: row.locations.path };
    const edit = actor.access.can('edit', 'staff', at);
    const nid = edit && this.mayEditPerson(actor.access, await this.parties.currentPaths(actor.societyId, { personId: row.person_id }));
    return { view: actor.access.can('view', 'staff', at), edit, nid };
  }

  /** A stint the caller may see at its post, or 404. */
  async visible(actor: Actor, id: string): Promise<DetailRow> {
    const row = await this.prisma.staff.findFirst({ where: { id, society_id: actor.societyId }, select: detailSelect });
    if (!row || !actor.access.can('view', 'staff', { path: row.locations.path })) throw staffNotFound();
    return row;
  }

  /** Staff rows in the caller's `staff.view` area. */
  private scope(actor: Actor): Prisma.staffWhereInput {
    return { society_id: actor.societyId, locations: scopeWhere(actor.access, 'view', 'staff', (prefix) => ({ path: { startsWith: prefix } })) };
  }

  private async where(actor: Actor, query: StaffCsvQuery): Promise<Prisma.staffWhereInput> {
    const filters: Prisma.staffWhereInput[] = [this.scope(actor)];
    if (query.state === 'current') filters.push({ left_on: null });
    if (query.state === 'left') filters.push({ left_on: { not: null } });
    if (query.kind) filters.push({ kind: query.kind });
    if (query.designation) filters.push({ designation_bn: query.designation });
    if (query.areaId) {
      const area = await this.tree.visible(actor.access, actor.societyId, 'staff', query.areaId);
      filters.push({ locations: { path: { startsWith: area.path } } });
    }
    if (query.q) {
      const terms = digitVariants(query.q);
      const digits = [...new Set(terms.map((term) => asciiDigits(term).replace(/[\s-]/g, '')))].filter((term) => /^\d+$/.test(term));
      filters.push({
        OR: [
          ...terms.flatMap((term) => [
            { persons: { full_name: { contains: term, mode: 'insensitive' as const } } },
            { persons: { full_name_en: { contains: term, mode: 'insensitive' as const } } },
            { designation_bn: { contains: term, mode: 'insensitive' as const } },
            { designation_en: { contains: term, mode: 'insensitive' as const } },
          ]),
          ...digits.flatMap((value) => [
            ...(value.length >= 3 ? [{ persons: { phone: { contains: value } } }] : []),
            ...(value.length <= 9 ? [{ staff_no: Number(value) }] : []),
          ]),
        ],
      });
    }
    return { AND: filters };
  }

  private async toRows(societyId: string, rows: Selected[]): Promise<StaffRow[]> {
    const place = await this.rows.places(societyId, rows.map((row) => row.locations));
    return rows.map((row) => ({
      id: row.id,
      staffNo: row.staff_no,
      person: {
        id: row.persons.id,
        name: row.persons.full_name,
        nameEn: row.persons.full_name_en,
        phone: row.persons.phone,
        photoUrl: mediaUrl(row.persons.photo_url, this.env.MEDIA_BASE_URL),
      },
      designation: { bn: row.designation_bn, en: row.designation_en },
      kind: toStaffKind(row.kind),
      posted: place(row.locations),
      joinedOn: isoDate(row.joined_on),
      leftOn: row.left_on ? isoDate(row.left_on) : null,
    }));
  }

  /** A current stint the caller may edit at its post (404 unseen, 403 view only, 409 `staff_left`). */
  private async editable(actor: Actor, id: string): Promise<DetailRow> {
    const row = await this.visible(actor, id);
    if (!actor.access.can('edit', 'staff', { path: row.locations.path })) throw beyondPermissions();
    if (row.left_on) throw alreadyLeft();
    return row;
  }

  /** The post a stint goes to: a place the caller sees (404) and may `action` staff at (403). */
  private async postAt(actor: Actor, locationId: string, action: 'create' | 'edit'): Promise<string> {
    const place = await this.tree.find(actor.societyId, locationId);
    if (!place || !(actor.access.can('view', 'staff', { path: place.path }) || actor.access.can('view', 'locations', { path: place.path }))) {
      throw locationNotFound();
    }
    if (!actor.access.can(action, 'staff', { path: place.path })) throw beyondPermissions();
    return place.id;
  }

  /** Staff details may change a person who is on file only as staff, or whom the caller may edit as a member. */
  private mayEditPerson(access: CallerAccess, paths: readonly string[]): boolean {
    return paths.length === 0 || canOnParty(access, 'edit', paths);
  }

  /** Adds a stint with the society's next staff number (one at a time per society). */
  private async insert(tx: Tx, actor: Actor, data: Omit<Prisma.staffUncheckedCreateInput, 'society_id' | 'staff_no'>, rejoinOf?: string): Promise<string> {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`staff:${actor.societyId}`}))`;
    const current = await tx.staff.findFirst({ where: { person_id: data.person_id, left_on: null }, select: { id: true } });
    if (current) throw currentExists();
    const { _max } = await tx.staff.aggregate({ where: { society_id: actor.societyId }, _max: { staff_no: true } });
    const made = await tx.staff.create({
      data: { ...data, society_id: actor.societyId, staff_no: (_max.staff_no ?? 0) + 1, created_by: actor.userId },
      select: detailSelect,
    });
    await this.audit.record({ ...auditOf(actor, 'staff', rejoinOf ? 'rejoin' : 'create', made.id), after: { ...snapshot(made), ...(rejoinOf ? { rejoinOf } : {}) } }, tx);
    return made.id;
  }

  /** A new joining day may not leave marked days before it. */
  private async checkJoinedOn(societyId: string, id: string, joinedOn: string): Promise<void> {
    const earlier = await this.prisma.attendance.count({ where: { society_id: societyId, staff_id: id, date: { lt: dayOf(joinedOn) } } });
    if (earlier > 0) throw new ConflictException({ code: 'attendance_before_join', message: 'Days before that are already marked' });
  }

  /** Phone and NID are unique per society. */
  private async checkUnique(societyId: string, phone: string | null, nid: string | null, personId: string): Promise<void> {
    const other = { NOT: { id: personId } };
    const [byPhone, byNid] = await Promise.all([
      phone ? this.prisma.persons.findFirst({ where: { society_id: societyId, phone, ...other }, select: { id: true } }) : null,
      nid ? this.prisma.persons.findFirst({ where: { society_id: societyId, nid, ...other }, select: { id: true } }) : null,
    ]);
    if (byPhone) throw phoneTaken();
    if (byNid) throw nidTaken();
  }
}
