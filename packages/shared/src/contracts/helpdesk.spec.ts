import {
  DEFAULT_SLA_HOURS,
  compareTicketUrgency,
  isTicketOverdue,
  slaHoursOf,
  slaInputSchema,
  statusAfterAssign,
  ticketCreateSchema,
  ticketDueAt,
  ticketNumberOf,
  ticketStatusMoves,
  ticketStatusSchema,
} from './helpdesk.js';

describe('helpdesk contracts', () => {
  it('lists the status changes and what each needs', () => {
    expect(ticketStatusMoves('open')).toEqual([
      { to: 'in_progress', needs: 'edit' },
      { to: 'resolved', needs: 'edit' },
      { to: 'cancelled', needs: 'approve' },
    ]);
    expect(ticketStatusMoves('in_progress').map((move) => move.to)).toEqual(['resolved', 'cancelled']);
    expect(ticketStatusMoves('resolved')).toEqual([
      { to: 'closed', needs: 'approve' },
      { to: 'in_progress', needs: 'approve' },
    ]);
    expect(ticketStatusMoves('closed')).toEqual([]);
    expect(ticketStatusMoves('cancelled')).toEqual([]);
  });

  it('assigns an open ticket and takes an assigned one back', () => {
    expect(statusAfterAssign('open', 'staff-1')).toBe('assigned');
    expect(statusAfterAssign('assigned', null)).toBe('open');
    expect(statusAfterAssign('assigned', 'staff-2')).toBe('assigned');
    expect(statusAfterAssign('in_progress', null)).toBe('in_progress');
    expect(statusAfterAssign('open', null)).toBe('open');
  });

  it('reads the SLA over the defaults and refuses bad hours', () => {
    expect(slaHoursOf(undefined)).toEqual(DEFAULT_SLA_HOURS);
    expect(slaHoursOf({ garbage: 6, water: 0, noise: 'x', extra: 5 })).toEqual({ ...DEFAULT_SLA_HOURS, garbage: 6 });
    expect(slaInputSchema.safeParse(DEFAULT_SLA_HOURS).success).toBe(true);
    expect(slaInputSchema.safeParse({ ...DEFAULT_SLA_HOURS, water: 0 }).success).toBe(false);
    expect(slaInputSchema.safeParse({ ...DEFAULT_SLA_HOURS, extra: 3 }).success).toBe(false);
  });

  it('sets the due time and derives overdue for active tickets only', () => {
    const opened = new Date('2026-10-13T04:00:00Z');
    const due = ticketDueAt(opened, 24);
    expect(due.toISOString()).toBe('2026-10-14T04:00:00.000Z');
    const later = new Date('2026-10-14T05:00:00Z');
    expect(isTicketOverdue('assigned', due, later)).toBe(true);
    expect(isTicketOverdue('open', due, opened)).toBe(false);
    expect(isTicketOverdue('resolved', due, later)).toBe(false);
  });

  it('needs a note to resolve or cancel', () => {
    expect(ticketStatusSchema.safeParse({ status: 'resolved' }).success).toBe(false);
    expect(ticketStatusSchema.safeParse({ status: 'cancelled', note: '  ' }).success).toBe(false);
    expect(ticketStatusSchema.safeParse({ status: 'resolved', note: 'বাতি বদলানো হয়েছে' }).success).toBe(true);
    expect(ticketStatusSchema.safeParse({ status: 'in_progress' }).success).toBe(true);
  });

  it('takes a typed reporter with a phone in either digit form', () => {
    const base = { locationId: '7c4b0a5e-9a4f-4f37-8a51-0b6f3d2f1c11', category: 'water', title: 'পানি নেই' };
    const typed = ticketCreateSchema.parse({ ...base, reporter: { kind: 'typed', name: 'করিম', phone: '০১৭১১-০০০০০০' } });
    expect(typed.reporter).toEqual({ kind: 'typed', name: 'করিম', phone: '01711000000' });
    expect(typed.priority).toBe('normal');
    expect(ticketCreateSchema.parse({ ...base, reporter: { kind: 'typed', name: 'করিম', phone: '' } }).reporter).toEqual({ kind: 'typed', name: 'করিম', phone: null });
    expect(ticketCreateSchema.parse(base).reporter).toEqual({ kind: 'none' });
    expect(ticketCreateSchema.safeParse({ ...base, reporter: { kind: 'typed', name: 'করিম', phone: '123' } }).success).toBe(false);
  });

  it('reads a ticket number in either digit form', () => {
    expect(ticketNumberOf('T-0012')).toBe(12);
    expect(ticketNumberOf('t12')).toBe(12);
    expect(ticketNumberOf('১২')).toBe(12);
    expect(ticketNumberOf('T-')).toBeNull();
    expect(ticketNumberOf('street')).toBeNull();
  });

  it('puts the most urgent first', () => {
    const at = (iso: string) => new Date(iso);
    const rows = [
      { priority: 'normal' as const, dueAt: at('2026-10-13T01:00:00Z') },
      { priority: 'urgent' as const, dueAt: at('2026-10-15T00:00:00Z') },
      { priority: 'normal' as const, dueAt: at('2026-10-12T00:00:00Z') },
    ];
    expect([...rows].sort(compareTicketUrgency)).toEqual([rows[1], rows[2], rows[0]]);
  });
});
