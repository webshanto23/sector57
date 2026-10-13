import { Prisma } from '@s57/db';
import { isTicketOverdue, type Place, type TicketCategory, type TicketPriority, type TicketReporterView, type TicketRow, type TicketStatus } from '@s57/shared';
import { placeSelect } from '../members/member-rows.service.js';

export const staffName = { select: { id: true, staff_no: true, persons: { select: { full_name: true, full_name_en: true } } } } as const;
export const userName = { select: { id: true, phone: true, persons: { select: { full_name: true } } } } as const;

export const ticketSelect = {
  id: true,
  ticket_no: true,
  title: true,
  category: true,
  priority: true,
  status: true,
  reporter_name: true,
  reporter_phone: true,
  due_at: true,
  created_at: true,
  locations: { select: placeSelect },
  persons: { select: { id: true, full_name: true } },
  staff: staffName,
} satisfies Prisma.ticketsSelect;
export type TicketSelected = Prisma.ticketsGetPayload<{ select: typeof ticketSelect }>;

export const ticketDetailSelect = {
  ...ticketSelect,
  description: true,
  resolved_at: true,
  resolution_note: true,
  closed_at: true,
  users: userName,
} satisfies Prisma.ticketsSelect;
export type TicketDetailRow = Prisma.ticketsGetPayload<{ select: typeof ticketDetailSelect }>;

type StaffName = Prisma.staffGetPayload<typeof staffName>;
type UserName = Prisma.usersGetPayload<typeof userName>;

export const staffRefOf = (row: StaffName | null) =>
  row ? { id: row.id, staffNo: row.staff_no, name: row.persons.full_name, nameEn: row.persons.full_name_en } : null;

export const userRefOf = (row: UserName | null) => (row ? { id: row.id, name: row.persons?.full_name ?? row.phone } : null);

export const reporterOf = (row: Pick<TicketSelected, 'persons' | 'reporter_name' | 'reporter_phone'>): TicketReporterView => {
  if (row.persons) return { kind: 'person', personId: row.persons.id, name: row.persons.full_name };
  if (row.reporter_name !== null) return { kind: 'typed', name: row.reporter_name, phone: row.reporter_phone };
  return { kind: 'none' };
};

/** One ticket as a list shows it; `place` comes from `MemberRowsService.places`. */
export function ticketRowOf(row: TicketSelected, place: Place, now: Date): TicketRow {
  const status = row.status as TicketStatus;
  return {
    id: row.id,
    ticketNo: row.ticket_no,
    title: row.title,
    category: row.category as TicketCategory,
    priority: row.priority as TicketPriority,
    status,
    place,
    reporter: reporterOf(row),
    assignee: staffRefOf(row.staff),
    dueAt: row.due_at.toISOString(),
    overdue: isTicketOverdue(status, row.due_at, now),
    createdAt: row.created_at.toISOString(),
  };
}

/** What an audit row keeps of a ticket. */
export const ticketSnapshot = (row: TicketDetailRow) => ({
  locationId: row.locations.id,
  category: row.category,
  title: row.title,
  description: row.description,
  priority: row.priority,
  status: row.status,
  reporterPersonId: row.persons?.id ?? null,
  reporterName: row.reporter_name,
  reporterPhone: row.reporter_phone,
  assignedStaffId: row.staff?.id ?? null,
  dueAt: row.due_at.toISOString(),
});
