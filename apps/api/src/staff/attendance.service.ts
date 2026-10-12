import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import {
  attendanceCounts,
  attendanceOpen,
  daysWorked,
  monthDays,
  toAttendanceStatus,
  type AttendanceCsvQuery,
  type AttendanceDay,
  type AttendanceDayQuery,
  type AttendanceMark,
  type AttendanceMonth,
  type AttendanceMonthQuery,
  type AttendanceSaveInput,
  type AttendanceStatus,
  type Locale,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { auditOf, dayOf } from '../members/parties.service.js';
import { scopeWhere } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addressOf, beyondPermissions, TreeService } from '../property/tree.service.js';
import type { CsvCell } from '../reports/csv.js';
import { futureDate, staffNotFound } from './staff.service.js';

const locked = () => new ForbiddenException({ code: 'attendance_locked', message: 'Only an approver may change days before yesterday' });
const notCurrent = () => new ConflictException({ code: 'staff_not_current', message: 'This staff member was not working here that day' });

const userName = { select: { id: true, phone: true, persons: { select: { full_name: true } } } } as const;
const markSelect = { staff_id: true, date: true, status: true, in_time: true, out_time: true, note: true, marked_at: true, users: userName } satisfies Prisma.attendanceSelect;
type MarkRow = Prisma.attendanceGetPayload<{ select: typeof markSelect }>;

/** `time` columns come back as a Date on 1970-01-01 (UTC); `HH:MM` both ways. */
const toTime = (clock: string | null) => (clock ? new Date(`1970-01-01T${clock}:00.000Z`) : null);
const fromTime = (value: Date | null) => (value ? value.toISOString().slice(11, 16) : null);

const toMark = (row: MarkRow): AttendanceMark => ({
  status: toAttendanceStatus(row.status),
  inTime: fromTime(row.in_time),
  outTime: fromTime(row.out_time),
  note: row.note,
  markedBy: row.users ? { id: row.users.id, name: row.users.persons?.full_name ?? row.users.phone } : null,
  markedAt: row.marked_at.toISOString(),
});

const rosterSelect = {
  id: true,
  staff_no: true,
  designation_bn: true,
  designation_en: true,
  joined_on: true,
  left_on: true,
  persons: { select: { full_name: true, full_name_en: true } },
  locations: { select: { id: true, name: true, path: true } },
} satisfies Prisma.staffSelect;

/** Headings of the attendance CSV, by locale (only the API writes CSV). */
const CSV_WORDS = {
  bn: {
    staffNo: 'কর্মী নম্বর',
    name: 'নাম',
    designation: 'পদবি',
    posted: 'কর্মস্থল',
    present: 'উপস্থিত',
    half_day: 'অর্ধদিবস',
    leave: 'ছুটি',
    absent: 'অনুপস্থিত',
    off: 'সাপ্তাহিক ছুটি',
    unmarked: 'হাজিরা নেই',
    worked: 'কর্মদিবস',
  },
  en: {
    staffNo: 'Staff no.',
    name: 'Name',
    designation: 'Designation',
    posted: 'Posted at',
    present: 'Present',
    half_day: 'Half day',
    leave: 'Leave',
    absent: 'Absent',
    off: 'Day off',
    unmarked: 'Not marked',
    worked: 'Days worked',
  },
} as const;

/**
 * Daily attendance (`attendance` permission, area-scoped through each staff member's post).
 * A day's roster is everyone working that day; saving it writes one row per staff member and
 * day. Today and yesterday need `attendance.edit`; older days `attendance.approve` as well;
 * future days are refused. Each save is audited with what changed.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tree: TreeService,
  ) {}

  async day(actor: Actor, query: AttendanceDayQuery): Promise<AttendanceDay> {
    const { access } = actor;
    const today = isoDate(todayDate());
    const filters: Prisma.staffWhereInput[] = [
      { society_id: actor.societyId, locations: scopeWhere(access, 'view', 'attendance', (prefix) => ({ path: { startsWith: prefix } })) },
      ...this.workingOn(query.date, query.date),
    ];
    if (query.areaId) {
      const area = await this.tree.visible(access, actor.societyId, 'attendance', query.areaId);
      filters.push({ locations: { path: { startsWith: area.path } } });
    }
    const staff = await this.prisma.staff.findMany({ where: { AND: filters }, select: rosterSelect, orderBy: [{ staff_no: 'asc' }] });
    const [marks, names] = await Promise.all([
      this.prisma.attendance.findMany({ where: { staff_id: { in: staff.map((row) => row.id) }, date: dayOf(query.date) }, select: markSelect }),
      this.tree.addressNames(actor.societyId, staff.map((row) => row.locations.path)),
    ]);
    const byStaff = new Map(marks.map((mark) => [mark.staff_id, mark]));
    const open = attendanceOpen(query.date, today);
    const future = query.date > today;
    const items = staff.map((row) => {
      const at = { path: row.locations.path };
      const mark = byStaff.get(row.id);
      return {
        staff: {
          id: row.id,
          staffNo: row.staff_no,
          name: row.persons.full_name,
          nameEn: row.persons.full_name_en,
          designation: { bn: row.designation_bn, en: row.designation_en },
          posted: [...addressOf(row.locations.path, names), row.locations.name].join(', '),
        },
        mark: mark ? toMark(mark) : null,
        editable: !future && access.can('edit', 'attendance', at) && (open || access.can('approve', 'attendance', at)),
      };
    });
    return {
      date: query.date,
      items,
      counts: attendanceCounts(items.map((item) => item.mark?.status ?? null)),
      locked: !future && !open && !access.can('approve', 'attendance'),
    };
  }

  /**
   * Saves the day's marks together. 404 `staff_not_found` for anyone the caller can't see,
   * 403 outside their edit area or `attendance_locked`, 409 `staff_not_current`, 400 `future_date`.
   */
  async save(actor: Actor, input: AttendanceSaveInput): Promise<AttendanceDay> {
    const { access } = actor;
    const today = isoDate(todayDate());
    if (input.date > today) throw futureDate();
    const open = attendanceOpen(input.date, today);
    const date = dayOf(input.date);

    await this.prisma.$transaction(async (tx) => {
      const ids = input.entries.map((entry) => entry.staffId);
      const staff = await tx.staff.findMany({
        where: { id: { in: ids }, society_id: actor.societyId },
        select: { id: true, joined_on: true, left_on: true, locations: { select: { path: true } } },
      });
      const byId = new Map(staff.map((row) => [row.id, row]));
      for (const entry of input.entries) {
        const row = byId.get(entry.staffId);
        const at = row ? { path: row.locations.path } : null;
        if (!row || !at || !access.can('view', 'attendance', at)) throw staffNotFound();
        if (!access.can('edit', 'attendance', at)) throw beyondPermissions();
        if (!open && !access.can('approve', 'attendance', at)) throw locked();
        if (isoDate(row.joined_on) > input.date || (row.left_on && isoDate(row.left_on) < input.date)) throw notCurrent();
      }

      const before = await tx.attendance.findMany({ where: { staff_id: { in: ids }, date }, select: markSelect });
      const old = new Map(before.map((mark) => [mark.staff_id, mark]));
      const changes: { staffId: string; from: AttendanceStatus | null; to: AttendanceStatus }[] = [];
      for (const entry of input.entries) {
        const was = old.get(entry.staffId);
        const same =
          was &&
          was.status === entry.status &&
          fromTime(was.in_time) === entry.inTime &&
          fromTime(was.out_time) === entry.outTime &&
          was.note === entry.note;
        if (same) continue;
        const data = { status: entry.status, in_time: toTime(entry.inTime), out_time: toTime(entry.outTime), note: entry.note, marked_by: actor.userId, marked_at: new Date() };
        await tx.attendance.upsert({
          where: { staff_id_date: { staff_id: entry.staffId, date } },
          create: { ...data, society_id: actor.societyId, staff_id: entry.staffId, date },
          update: data,
        });
        changes.push({ staffId: entry.staffId, from: was ? toAttendanceStatus(was.status) : null, to: entry.status });
      }
      if (changes.length > 0) {
        await this.audit.record({ ...auditOf(actor, 'attendance', 'save', null), after: { date: input.date, late: !open, changes } }, tx);
      }
    });
    return this.day(actor, { date: input.date });
  }

  /** One staff member's month (404 outside the caller's `attendance.view` area). */
  async month(actor: Actor, query: AttendanceMonthQuery): Promise<AttendanceMonth> {
    const row = await this.prisma.staff.findFirst({
      where: { id: query.staffId, society_id: actor.societyId },
      select: { id: true, joined_on: true, left_on: true, locations: { select: { path: true } } },
    });
    if (!row || !actor.access.can('view', 'attendance', { path: row.locations.path })) throw staffNotFound();
    const days = monthDays(query.month);
    const marks = await this.prisma.attendance.findMany({
      where: { staff_id: row.id, date: { gte: dayOf(days[0]!), lte: dayOf(days.at(-1)!) } },
      select: markSelect,
    });
    const byDay = new Map(marks.map((mark) => [isoDate(mark.date), toMark(mark)]));
    const joined = isoDate(row.joined_on);
    const left = row.left_on ? isoDate(row.left_on) : null;
    const today = isoDate(todayDate());
    const shown = days.map((date) => ({ date, outside: date < joined || (left !== null && date > left), mark: byDay.get(date) ?? null }));
    // Days to come are not "unmarked" yet.
    const counted = shown.filter((day) => !day.outside && (day.mark !== null || day.date <= today));
    const counts = attendanceCounts(counted.map((day) => day.mark?.status ?? null));
    return { month: query.month, staffId: row.id, days: shown, counts, daysWorked: daysWorked(counts) };
  }

  /** The month's counts per staff member who worked any of it, in the caller's area: rows for `csvFile`. */
  async csv(actor: Actor, query: AttendanceCsvQuery, locale: Locale): Promise<CsvCell[][]> {
    const { access } = actor;
    const days = monthDays(query.month);
    const first = days[0]!;
    const last = days.at(-1)!;
    const filters: Prisma.staffWhereInput[] = [
      { society_id: actor.societyId, locations: scopeWhere(access, 'view', 'attendance', (prefix) => ({ path: { startsWith: prefix } })) },
      ...this.workingOn(first, last),
    ];
    if (query.areaId) {
      const area = await this.tree.visible(access, actor.societyId, 'attendance', query.areaId);
      filters.push({ locations: { path: { startsWith: area.path } } });
    }
    const staff = await this.prisma.staff.findMany({ where: { AND: filters }, select: rosterSelect, orderBy: [{ staff_no: 'asc' }] });
    const [marks, names] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { staff_id: { in: staff.map((row) => row.id) }, date: { gte: dayOf(first), lte: dayOf(last) } },
        select: { staff_id: true, date: true, status: true },
      }),
      this.tree.addressNames(actor.societyId, staff.map((row) => row.locations.path)),
    ]);
    const today = isoDate(todayDate());
    const w = CSV_WORDS[locale];
    const rows: CsvCell[][] = [[w.staffNo, w.name, w.designation, w.posted, w.present, w.half_day, w.leave, w.absent, w.off, w.unmarked, w.worked]];
    for (const row of staff) {
      const own = new Map(marks.filter((mark) => mark.staff_id === row.id).map((mark) => [isoDate(mark.date), toAttendanceStatus(mark.status)]));
      const joined = isoDate(row.joined_on);
      const left = row.left_on ? isoDate(row.left_on) : null;
      const counted = days.filter((day) => day >= joined && (left === null || day <= left) && (own.has(day) || day <= today));
      const counts = attendanceCounts(counted.map((day) => own.get(day) ?? null));
      rows.push([
        row.staff_no,
        locale === 'en' ? (row.persons.full_name_en ?? row.persons.full_name) : row.persons.full_name,
        locale === 'en' ? (row.designation_en ?? row.designation_bn) : row.designation_bn,
        [...addressOf(row.locations.path, names), row.locations.name].join(', '),
        counts.present,
        counts.half_day,
        counts.leave,
        counts.absent,
        counts.off,
        counts.unmarked,
        daysWorked(counts),
      ]);
    }
    return rows;
  }

  /** Stints that overlap `from`..`to`. */
  private workingOn(from: string, to: string): Prisma.staffWhereInput[] {
    return [{ joined_on: { lte: dayOf(to) } }, { OR: [{ left_on: null }, { left_on: { gte: dayOf(from) } }] }];
  }
}
