import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import {
  checklistOf,
  digitVariants,
  asciiDigits,
  isZeroMoney,
  MOVE_CHECKLIST,
  toMoveKind,
  toRenterType,
  toTenancyStatus,
  type MoveCompleteInput,
  type MoveCreateInput,
  type MoveDetail,
  type MoveKind,
  type MoveList,
  type MoveListQuery,
  type MoveRow,
  type MoveStatus,
  type MoveUpdateInput,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { unitDues } from '../billing/unit-dues.js';
import { isoDate } from '../common/dates.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { scopeWhere } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OccupancyService } from '../property/occupancy.service.js';
import { beyondPermissions, TreeService } from '../property/tree.service.js';
import { MemberRowsService, organisationPartySelect, personPartySelect, placeSelect } from './member-rows.service.js';
import { auditOf, dayOf, lockLocation } from './parties.service.js';
import { TenanciesService, tenancyFlatSelect, tenancySnapshot } from './tenancies.service.js';

const notFound = () => new NotFoundException({ code: 'move_not_found', message: 'Move not found' });
const openExists = () => new ConflictException({ code: 'move_open_exists', message: 'This tenancy already has a move under way' });
const closed = () => new ConflictException({ code: 'move_closed', message: 'This move is already done or cancelled' });
const wrongStatus = (kind: MoveKind) =>
  new ConflictException({
    code: 'move_wrong_status',
    message: kind === 'move_in' ? 'Only a pending tenancy can move in' : 'Only an active tenancy can move out',
  });
const invalidCheck = () => new BadRequestException({ code: 'invalid_check', message: 'That checklist item belongs to the other kind of move' });

const STATUSES = ['open', 'done', 'cancelled'] as const;
const toMoveStatus = (value: string): MoveStatus => ((STATUSES as readonly string[]).includes(value) ? (value as MoveStatus) : 'cancelled');
const userName = { select: { id: true, phone: true, persons: { select: { full_name: true } } } } as const;
type UserName = { id: string; phone: string; persons: { full_name: string } | null };
const userRef = (user: UserName | null) => (user ? { id: user.id, name: user.persons?.full_name ?? user.phone } : null);

const moveSelect = {
  id: true,
  kind: true,
  status: true,
  planned_date: true,
  checklist: true,
  created_at: true,
  completed_at: true,
  tenancies: {
    select: {
      renter_type: true,
      units: { select: { locations: { select: placeSelect } } },
      persons: { select: personPartySelect },
      organisations: { select: organisationPartySelect },
    },
  },
} satisfies Prisma.move_eventsSelect;
type MoveSelected = Prisma.move_eventsGetPayload<{ select: typeof moveSelect }>;

/**
 * Move-in and move-out checklists (`tenancies` permission, at the unit). A move-in turns a
 * pending tenancy active on the day it is done; a move-out marks an active tenancy
 * `moving_out` and, when done, ends it with its household. A tenancy has at most one open move.
 * Every change re-derives the unit's occupancy, and each is audited here.
 */
@Injectable()
export class MovesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tree: TreeService,
    private readonly occupancy: OccupancyService,
    private readonly rows: MemberRowsService,
    private readonly tenancies: TenanciesService,
  ) {}

  async list(actor: Actor, query: MoveListQuery): Promise<MoveList> {
    const { page, pageSize } = query;
    const scope: Prisma.move_eventsWhereInput = {
      society_id: actor.societyId,
      tenancies: { units: { locations: scopeWhere(actor.access, 'view', 'tenancies', (prefix) => ({ path: { startsWith: prefix } })) } },
    };
    const filters: Prisma.move_eventsWhereInput[] = [scope];
    if (query.kind) filters.push({ kind: query.kind });
    if (query.status) filters.push({ status: query.status });
    if (query.areaId) {
      const area = await this.tree.visible(actor.access, actor.societyId, 'tenancies', query.areaId);
      filters.push({ tenancies: { units: { locations: { path: { startsWith: area.path } } } } });
    }
    if (query.q) {
      const terms = digitVariants(query.q);
      const phones = [...new Set(terms.map((term) => asciiDigits(term).replace(/[\s-]/g, '')))].filter((term) => /^\d{3,}$/.test(term));
      filters.push({
        OR: [
          ...terms.flatMap((term) => [
            { tenancies: { persons: { full_name: { contains: term, mode: 'insensitive' as const } } } },
            { tenancies: { persons: { full_name_en: { contains: term, mode: 'insensitive' as const } } } },
            { tenancies: { organisations: { name: { contains: term, mode: 'insensitive' as const } } } },
            { tenancies: { units: { locations: { name: { contains: term, mode: 'insensitive' as const } } } } },
          ]),
          ...phones.map((digits) => ({ tenancies: { persons: { phone: { contains: digits } } } })),
        ],
      });
    }
    const where: Prisma.move_eventsWhereInput = { AND: filters };
    const [rows, total, open] = await Promise.all([
      this.prisma.move_events.findMany({
        where,
        select: moveSelect,
        // 'open' sorts after 'done' and 'cancelled': open moves come first, the soonest first.
        orderBy: [{ status: 'desc' }, { planned_date: { sort: 'asc', nulls: 'last' } }, { created_at: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.move_events.count({ where }),
      this.prisma.move_events.groupBy({ by: ['kind'], where: { AND: [scope, { status: 'open' }] }, _count: { _all: true } }),
    ]);
    const toRow = await this.toRows(actor.societyId, rows);
    const openOf = (kind: MoveKind) => open.find((row) => row.kind === kind)?._count._all ?? 0;
    return { items: rows.map(toRow), total, page, pageSize, open: { moveIn: openOf('move_in'), moveOut: openOf('move_out') } };
  }

  async get(actor: Actor, id: string): Promise<MoveDetail> {
    const row = await this.prisma.move_events.findFirst({
      where: { id, society_id: actor.societyId },
      select: {
        ...moveSelect,
        note: true,
        dues_cleared: true,
        cancelled_at: true,
        users: userName,
        completer: userName,
        canceller: userName,
        tenancies: {
          select: {
            ...moveSelect.tenancies.select,
            id: true,
            unit_id: true,
            status: true,
            start_date: true,
            end_date: true,
            police_form_submitted: true,
          },
        },
      },
    });
    const at = row ? { path: row.tenancies.units.locations.path } : null;
    if (!row || !at || !actor.access.can('view', 'tenancies', at)) throw notFound();
    const kind = toMoveKind(row.kind);
    const open = row.status === 'open';
    const edit = open && actor.access.can('edit', 'tenancies', at);
    const dues = actor.access.can('view', 'billing', at) ? await unitDues(this.prisma, actor.societyId, row.tenancies.unit_id) : null;
    const toRow = await this.toRows(actor.societyId, [row]);
    return {
      ...toRow(row),
      tenancy: {
        id: row.tenancies.id,
        status: toTenancyStatus(row.tenancies.status),
        startDate: isoDate(row.tenancies.start_date),
        endDate: row.tenancies.end_date ? isoDate(row.tenancies.end_date) : null,
        policeFormSubmitted: row.tenancies.police_form_submitted,
      },
      checklist: checklistOf(kind, row.checklist),
      note: row.note,
      duesCleared: row.dues_cleared,
      dues,
      createdBy: userRef(row.users),
      completedBy: userRef(row.completer),
      cancelledBy: userRef(row.canceller),
      cancelledAt: row.cancelled_at?.toISOString() ?? null,
      can: { edit, complete: edit, cancel: edit, overrideDues: actor.access.can('approve', 'tenancies', at) },
    };
  }

  /** 409 `move_wrong_status` for a tenancy in the wrong state, `move_open_exists` when one is under way. */
  async create(actor: Actor, input: MoveCreateInput): Promise<MoveDetail> {
    const tenancy = await this.tenancies.row(actor, input.tenancyId, 'edit');
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        await lockLocation(tx, tenancy.unit_id);
        const now = await tx.tenancies.findUniqueOrThrow({ where: { id: tenancy.id }, select: tenancyFlatSelect });
        if (now.status !== (input.kind === 'move_in' ? 'pending' : 'active')) throw wrongStatus(input.kind);
        const open = await tx.move_events.findFirst({ where: { tenancy_id: tenancy.id, status: 'open' }, select: { id: true } });
        if (open) throw openExists();
        const move = await tx.move_events.create({
          data: {
            society_id: actor.societyId,
            tenancy_id: tenancy.id,
            kind: input.kind,
            planned_date: input.plannedDate ? dayOf(input.plannedDate) : null,
            note: input.note ?? null,
            // A police form already on file counts.
            checklist: input.kind === 'move_in' && now.police_form_submitted ? { police_form: true } : {},
            created_by: actor.userId,
          },
          select: { id: true },
        });
        if (input.kind === 'move_out') {
          const after = await tx.tenancies.update({ where: { id: tenancy.id }, data: { status: 'moving_out' }, select: tenancyFlatSelect });
          await this.occupancy.refresh(actor.societyId, tenancy.units.locations.path, tx);
          await this.audit.record(
            { ...auditOf(actor, 'tenancy', 'update', tenancy.id), before: tenancySnapshot(now), after: tenancySnapshot(after) },
            tx,
          );
        }
        await this.audit.record(
          { ...auditOf(actor, 'move_event', 'create', move.id), after: { tenancyId: tenancy.id, kind: input.kind, plannedDate: input.plannedDate ?? null } },
          tx,
        );
        return move.id;
      });
    } catch (error) {
      throw isUniqueViolation(error) ? openExists() : error;
    }
    return this.get(actor, id);
  }

  /** Planned date, note and checklist ticks of an open move. 400 `invalid_check`; 409 `move_closed`. */
  async update(actor: Actor, id: string, input: MoveUpdateInput): Promise<MoveDetail> {
    const before = await this.row(actor, id);
    const kind = toMoveKind(before.kind);
    const allowed = MOVE_CHECKLIST[kind] as readonly string[];
    if (input.checklist && Object.keys(input.checklist).some((key) => !allowed.includes(key))) throw invalidCheck();
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.move_events.findUniqueOrThrow({ where: { id }, select: { status: true, checklist: true } });
      if (current.status !== 'open') throw closed();
      const stored = current.checklist && typeof current.checklist === 'object' ? (current.checklist as Record<string, boolean>) : {};
      const checklist = input.checklist ? { ...stored, ...input.checklist } : undefined;
      await tx.move_events.update({
        where: { id },
        data: {
          planned_date: input.plannedDate === undefined ? undefined : input.plannedDate ? dayOf(input.plannedDate) : null,
          note: input.note === undefined ? undefined : input.note,
          checklist,
        },
      });
      const police = input.checklist?.police_form;
      if (kind === 'move_in' && police !== undefined) {
        await tx.tenancies.update({ where: { id: before.tenancy_id }, data: { police_form_submitted: police } });
      }
      await this.audit.record(
        {
          ...auditOf(actor, 'move_event', 'update', id),
          before: { plannedDate: before.planned_date ? isoDate(before.planned_date) : null, checklist: stored },
          after: { plannedDate: input.plannedDate, checklist: checklist ?? stored, noteChanged: input.note !== undefined },
        },
        tx,
      );
    });
    return this.get(actor, id);
  }

  /**
   * Done on `date`. A move-in makes the tenancy active from that day (its household rows that
   * started with the tenancy move with it); a move-out ends the tenancy and its household.
   * 409 `dues_outstanding` (with `details.owed`) when bills on the unit are unpaid and the
   * caller lacks `tenancies.approve`.
   */
  async complete(actor: Actor, id: string, input: MoveCompleteInput): Promise<MoveDetail> {
    const before = await this.row(actor, id);
    const kind = toMoveKind(before.kind);
    const path = before.tenancies.units.locations.path;
    await this.prisma.$transaction(async (tx) => {
      await lockLocation(tx, before.tenancies.unit_id);
      const tenancy = await tx.tenancies.findUniqueOrThrow({ where: { id: before.tenancy_id }, select: tenancyFlatSelect });
      if (kind === 'move_in' ? tenancy.status !== 'pending' : tenancy.status !== 'moving_out' && tenancy.status !== 'active') throw wrongStatus(kind);
      let duesCleared = false;
      if (kind === 'move_out') {
        const dues = await unitDues(tx, actor.societyId, tenancy.unit_id);
        duesCleared = isZeroMoney(dues.owed);
        if (!duesCleared && !actor.access.can('approve', 'tenancies', { path })) {
          throw new ConflictException({ code: 'dues_outstanding', message: 'Bills on this unit are still unpaid', details: { owed: dues.owed } });
        }
      }
      // Claim the move first (a second click finds it closed), then move the tenancy on.
      const claimed = await tx.move_events.updateMany({
        where: { id, status: 'open' },
        data: { status: 'done', completed_at: new Date(), completed_by: actor.userId, dues_cleared: duesCleared },
      });
      if (claimed.count === 0) throw closed();
      if (kind === 'move_in') {
        const after = await tx.tenancies.update({
          where: { id: tenancy.id },
          data: { status: 'active', start_date: dayOf(input.date) },
          select: tenancyFlatSelect,
        });
        await tx.occupants.updateMany({
          where: { tenancy_id: tenancy.id, end_date: null, start_date: tenancy.start_date },
          data: { start_date: dayOf(input.date) },
        });
        await this.occupancy.refresh(actor.societyId, path, tx);
        await this.audit.record(
          { ...auditOf(actor, 'tenancy', 'update', tenancy.id), before: tenancySnapshot(tenancy), after: tenancySnapshot(after) },
          tx,
        );
      } else {
        await this.tenancies.endIn(tx, actor, { ...tenancy, units: { locations: { path } } }, input.date);
      }
      await this.audit.record({ ...auditOf(actor, 'move_event', 'complete', id), after: { kind, date: input.date, duesCleared } }, tx);
    });
    return this.get(actor, id);
  }

  /** A cancelled move-out puts the tenancy back to `active`; a cancelled move-in leaves it pending. */
  async cancel(actor: Actor, id: string): Promise<MoveDetail> {
    const before = await this.row(actor, id);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.move_events.updateMany({
        where: { id, status: 'open' },
        data: { status: 'cancelled', cancelled_at: new Date(), cancelled_by: actor.userId },
      });
      if (claimed.count === 0) throw closed();
      if (before.kind === 'move_out') {
        const tenancy = await tx.tenancies.findUniqueOrThrow({ where: { id: before.tenancy_id }, select: tenancyFlatSelect });
        if (tenancy.status === 'moving_out') {
          const after = await tx.tenancies.update({ where: { id: tenancy.id }, data: { status: 'active' }, select: tenancyFlatSelect });
          await this.occupancy.refresh(actor.societyId, before.tenancies.units.locations.path, tx);
          await this.audit.record(
            { ...auditOf(actor, 'tenancy', 'update', tenancy.id), before: tenancySnapshot(tenancy), after: tenancySnapshot(after) },
            tx,
          );
        }
      }
      await this.audit.record({ ...auditOf(actor, 'move_event', 'cancel', id), after: { kind: before.kind } }, tx);
    });
    return this.get(actor, id);
  }

  /** An open move the caller may edit (404 / 403), else 409 `move_closed`. */
  private async row(actor: Actor, id: string) {
    const row = await this.prisma.move_events.findFirst({
      where: { id, society_id: actor.societyId },
      select: {
        id: true,
        kind: true,
        status: true,
        tenancy_id: true,
        planned_date: true,
        tenancies: { select: { unit_id: true, units: { select: { locations: { select: { path: true } } } } } },
      },
    });
    const at = row ? { path: row.tenancies.units.locations.path } : null;
    if (!row || !at || !actor.access.can('view', 'tenancies', at)) throw notFound();
    if (!actor.access.can('edit', 'tenancies', at)) throw beyondPermissions();
    if (row.status !== 'open') throw closed();
    return row;
  }

  private async toRows(societyId: string, rows: MoveSelected[]): Promise<(row: MoveSelected) => MoveRow> {
    const place = await this.rows.places(
      societyId,
      rows.map((row) => row.tenancies.units.locations),
    );
    return (row) => {
      const kind = toMoveKind(row.kind);
      const checklist = checklistOf(kind, row.checklist);
      const { persons, organisations } = row.tenancies;
      return {
        id: row.id,
        kind,
        status: toMoveStatus(row.status),
        plannedDate: row.planned_date ? isoDate(row.planned_date) : null,
        place: place(row.tenancies.units.locations),
        renter: persons ? this.rows.personParty(persons) : organisations ? this.rows.organisationParty(organisations) : null,
        renterType: toRenterType(row.tenancies.renter_type),
        checked: checklist.filter((item) => item.done).length,
        checks: checklist.length,
        createdAt: row.created_at.toISOString(),
        completedAt: row.completed_at?.toISOString() ?? null,
      };
    };
  }
}
