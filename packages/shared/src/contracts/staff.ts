import { z } from 'zod';
import { optionalMoneySchema } from '../money.js';
import { optionalText, pagination, text } from '../schemas.js';
import { cleanText } from '../text.js';
import { GENDERS, isoDay, personInputSchema, placeSchema } from './members.js';
import { addDays, daysBetween } from './reports.js';

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

/** `staff.kind`. Daily workers have a daily rate, the others a monthly salary. Labels in i18n (`Staff.kind.*`). */
export const STAFF_KINDS = ['permanent', 'contract', 'daily'] as const;
export type StaffKind = (typeof STAFF_KINDS)[number];
export const toStaffKind = (value: string): StaffKind => ((STAFF_KINDS as readonly string[]).includes(value) ? (value as StaffKind) : 'permanent');

/** Which stints a list shows: current ones (the default), those who left, or both. */
export const STAFF_STATES = ['current', 'left', 'all'] as const;
export type StaffState = (typeof STAFF_STATES)[number];

const reason = z.string().transform(cleanText).pipe(z.string().min(1).max(300));

/**
 * `POST /staff`: a new stint. The person is found by phone (or else NID) or added, as
 * everywhere; someone already working gets 409 `staff_current_exists`. `pay` is the monthly
 * salary, or the daily rate for a daily worker; it may be left blank.
 */
export const staffCreateSchema = z.object({
  person: personInputSchema,
  designationBn: text(100),
  designationEn: optionalText(100),
  kind: z.enum(STAFF_KINDS),
  postedLocationId: z.uuid(),
  joinedOn: isoDay,
  pay: optionalMoneySchema,
});
export type StaffCreateInput = z.infer<typeof staffCreateSchema>;

/**
 * `PATCH /staff/:id` (current stints only). `person` changes the person's own details, allowed
 * when the caller may edit them as a member or they are on file only as staff. `pay` needs a
 * society-wide `staff.edit`.
 */
export const staffUpdateSchema = z.object({
  person: personInputSchema.optional(),
  designationBn: text(100).optional(),
  designationEn: optionalText(100).optional(),
  kind: z.enum(STAFF_KINDS).optional(),
  postedLocationId: z.uuid().optional(),
  joinedOn: isoDay.optional(),
  pay: optionalMoneySchema.optional(),
});
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;

/** `POST /staff/:id/leave`: the last working day (not in the future) and why. */
export const staffLeaveSchema = z.object({ leftOn: isoDay, reason });
export type StaffLeaveInput = z.infer<typeof staffLeaveSchema>;

/** `POST /staff/:id/rejoin`: a new stint for someone who left, with the same post unless changed. */
export const staffRejoinSchema = z.object({ joinedOn: isoDay, postedLocationId: z.uuid().optional() });
export type StaffRejoinInput = z.infer<typeof staffRejoinSchema>;

const search = z.string().transform(cleanText).pipe(z.string().max(100)).optional();

/** `GET /staff`: in the caller's `staff.view` area. */
export const staffListQuery = pagination.extend({
  /** Name, phone or staff number, in either digit form. */
  q: search,
  /** The Bangla designation, exactly (from the list's `designations`). */
  designation: z.string().transform(cleanText).pipe(z.string().max(100)).optional(),
  kind: z.enum(STAFF_KINDS).optional(),
  /** Staff posted at or under this place. */
  areaId: z.uuid().optional(),
  state: z.enum(STAFF_STATES).default('current'),
});
export type StaffListQuery = z.infer<typeof staffListQuery>;

/** The CSV takes the list's filters (no paging). */
export const staffCsvQuery = staffListQuery.omit({ page: true, pageSize: true });
export type StaffCsvQuery = z.infer<typeof staffCsvQuery>;

const designation = z.object({ bn: z.string(), en: z.string().nullable() });

/** Who a staff row is about, as lists show them. */
export const staffPersonSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  nameEn: z.string().nullable(),
  phone: z.string().nullable(),
  photoUrl: z.string().nullable(),
});

export const staffRowSchema = z.object({
  id: z.uuid(),
  staffNo: z.number().int().min(1),
  person: staffPersonSchema,
  designation,
  kind: z.enum(STAFF_KINDS),
  posted: placeSchema,
  joinedOn: isoDay,
  leftOn: isoDay.nullable(),
});
export type StaffRow = z.infer<typeof staffRowSchema>;

export const staffListSchema = z.object({
  items: z.array(staffRowSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  /** Current staff in the caller's area (filters ignored). */
  current: z.number().int().min(0),
  /** The designations in use in the caller's area, for the filter. */
  designations: z.array(designation),
  can: z.object({ create: z.boolean(), export: z.boolean() }),
});
export type StaffList = z.infer<typeof staffListSchema>;

/** `GET /staff/:id`. */
export const staffDetailSchema = staffRowSchema.extend({
  leftReason: z.string().nullable(),
  /** The person's own details, as the edit form shows them. `nid` only for those who may edit this staff member. */
  personDetail: z.object({
    fullName: z.string(),
    fullNameEn: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    nid: z.string().nullable(),
    hasNid: z.boolean(),
    dateOfBirth: isoDay.nullable(),
    gender: z.enum(GENDERS).nullable(),
  }),
  /** Monthly salary or daily rate (by kind); null when blank or when the caller may not see pay. */
  pay: z.string().nullable(),
  /** Their other stints, newest first. */
  stints: z.array(z.object({ id: z.uuid(), staffNo: z.number().int(), designation, joinedOn: isoDay, leftOn: isoDay.nullable() })),
  /** Whether they also have a dashboard login (a `users` row for the same person). */
  hasLogin: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
  can: z.object({
    edit: z.boolean(),
    /** Change the person's own name, phone and NID from here. */
    editPerson: z.boolean(),
    /** See and change pay (society-wide `staff.edit`). */
    pay: z.boolean(),
    leave: z.boolean(),
    rejoin: z.boolean(),
    /** See the month calendar (`attendance.view` at their post). */
    attendance: z.boolean(),
    /** Open their record in Members. */
    viewPerson: z.boolean(),
  }),
});
export type StaffDetail = z.infer<typeof staffDetailSchema>;

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

/** `attendance.status`; labels in i18n (`Attendance.status.*`). Times are kept only for present and half days. */
export const ATTENDANCE_STATUSES = ['present', 'half_day', 'leave', 'absent', 'off'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export const toAttendanceStatus = (value: string): AttendanceStatus =>
  (ATTENDANCE_STATUSES as readonly string[]).includes(value) ? (value as AttendanceStatus) : 'absent';
export const attendanceHasTimes = (status: AttendanceStatus): boolean => status === 'present' || status === 'half_day';

/**
 * Days back that `attendance.edit` may still change: today and yesterday. Older days need
 * `attendance.approve` (403 `attendance_locked`); future days are refused (400 `future_date`).
 */
export const ATTENDANCE_EDIT_DAYS = 1;

/** May a day be changed with `attendance.edit` alone (`today` in Dhaka)? */
export const attendanceOpen = (date: string, today: string): boolean => {
  const back = daysBetween(date, today);
  return back >= 0 && back <= ATTENDANCE_EDIT_DAYS;
};

/** A clock time `HH:MM` (24 hours); blank is null. */
const clock = z
  .string()
  .nullish()
  .transform((value) => (value == null ? null : value.trim() || null))
  .pipe(
    z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'invalid_time')
      .nullable(),
  );

/** Most staff one roster save may carry. */
export const MAX_ROSTER = 500;

export const attendanceEntrySchema = z
  .object({
    staffId: z.uuid(),
    status: z.enum(ATTENDANCE_STATUSES),
    inTime: clock,
    outTime: clock,
    note: optionalText(300),
  })
  .refine((entry) => attendanceHasTimes(entry.status) || (entry.inTime === null && entry.outTime === null), {
    message: 'times_not_allowed',
    path: ['inTime'],
  });
export type AttendanceEntry = z.infer<typeof attendanceEntrySchema>;

/**
 * `PUT /attendance`: the day's marks, saved together (each staff member at most once).
 * Staff not listed keep what they have. Every one must be current on that day and in the
 * caller's `attendance.edit` area.
 */
export const attendanceSaveSchema = z
  .object({ date: isoDay, entries: z.array(attendanceEntrySchema).min(1).max(MAX_ROSTER) })
  .refine((input) => new Set(input.entries.map((entry) => entry.staffId)).size === input.entries.length, {
    message: 'duplicate_staff',
    path: ['entries'],
  });
export type AttendanceSaveInput = z.infer<typeof attendanceSaveSchema>;

/** `GET /attendance?date=`: everyone working that day in the caller's area (or under `areaId`). */
export const attendanceDayQuery = z.object({ date: isoDay, areaId: z.uuid().optional() });
export type AttendanceDayQuery = z.infer<typeof attendanceDayQuery>;

const userRef = z.object({ id: z.uuid(), name: z.string() });

export const attendanceMarkSchema = z.object({
  status: z.enum(ATTENDANCE_STATUSES),
  inTime: z.string().nullable(),
  outTime: z.string().nullable(),
  note: z.string().nullable(),
  markedBy: userRef.nullable(),
  markedAt: z.iso.datetime({ offset: true }),
});
export type AttendanceMark = z.infer<typeof attendanceMarkSchema>;

const count = z.number().int().min(0);
const counts = z.object({ present: count, half_day: count, leave: count, absent: count, off: count, unmarked: count });
export type AttendanceCounts = z.infer<typeof counts>;

export const attendanceDaySchema = z.object({
  date: isoDay,
  items: z.array(
    z.object({
      staff: z.object({
        id: z.uuid(),
        staffNo: z.number().int(),
        name: z.string(),
        nameEn: z.string().nullable(),
        designation,
        posted: z.string(),
      }),
      mark: attendanceMarkSchema.nullable(),
      /** May the caller change this one on this day? */
      editable: z.boolean(),
    }),
  ),
  counts,
  /** The day is past the `attendance.edit` window and the caller lacks `attendance.approve`. */
  locked: z.boolean(),
});
export type AttendanceDay = z.infer<typeof attendanceDaySchema>;

/** A month, `YYYY-MM`. */
export const isoMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'invalid_month');

/** `GET /attendance/month?month=&staffId=`: one staff member's calendar. */
export const attendanceMonthQuery = z.object({ month: isoMonth, staffId: z.uuid() });
export type AttendanceMonthQuery = z.infer<typeof attendanceMonthQuery>;

export const attendanceMonthSchema = z.object({
  month: isoMonth,
  staffId: z.uuid(),
  days: z.array(
    z.object({
      date: isoDay,
      /** Before they joined or after they left. */
      outside: z.boolean(),
      mark: attendanceMarkSchema.nullable(),
    }),
  ),
  counts,
  /** Present days plus half days at a half, as a decimal string (`22.5`). */
  daysWorked: z.string(),
});
export type AttendanceMonth = z.infer<typeof attendanceMonthSchema>;

/** `GET /attendance/csv?month=`: one row per staff member with the month's counts. */
export const attendanceCsvQuery = z.object({ month: isoMonth, areaId: z.uuid().optional() });
export type AttendanceCsvQuery = z.infer<typeof attendanceCsvQuery>;

/** Every day of a month, `YYYY-MM-DD`, in order. */
export function monthDays(month: string): string[] {
  const first = `${month}-01`;
  const days: string[] = [];
  for (let day = first; day.startsWith(month); day = addDays(day, 1)) days.push(day);
  return days;
}

/** Counts per status, plus the days with no mark. */
export function attendanceCounts(marks: readonly (AttendanceStatus | null)[]): AttendanceCounts {
  const result: AttendanceCounts = { present: 0, half_day: 0, leave: 0, absent: 0, off: 0, unmarked: 0 };
  for (const mark of marks) result[mark ?? 'unmarked'] += 1;
  return result;
}

/** Present days plus half days at a half, as a decimal string: `22`, `22.5`. */
export function daysWorked(counts: Pick<AttendanceCounts, 'present' | 'half_day'>): string {
  const halves = counts.present * 2 + counts.half_day;
  return halves % 2 === 0 ? String(halves / 2) : `${(halves - 1) / 2}.5`;
}
