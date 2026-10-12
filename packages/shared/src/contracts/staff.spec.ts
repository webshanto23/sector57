import {
  attendanceCounts,
  attendanceEntrySchema,
  attendanceOpen,
  attendanceSaveSchema,
  daysWorked,
  isoMonth,
  monthDays,
  staffCreateSchema,
  staffLeaveSchema,
} from './staff.js';

const STAFF = '7a1f1c2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';
const OTHER = '8b2f1c2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';

describe('staff contracts', () => {
  it('cleans a new staff member and reads Bangla digits in the pay', () => {
    const parsed = staffCreateSchema.parse({
      person: { fullName: '  কালাম মিয়া ', phone: '০১৭১১-০০০০০১' },
      designationBn: ' নিরাপত্তা প্রহরী ',
      designationEn: '',
      kind: 'permanent',
      postedLocationId: STAFF,
      joinedOn: '2026-01-01',
      pay: '১২,০০০',
    });
    expect(parsed).toMatchObject({ designationBn: 'নিরাপত্তা প্রহরী', designationEn: null, pay: '12000.00' });
    expect(parsed.person).toMatchObject({ fullName: 'কালাম মিয়া', phone: '01711000001' });
    expect(staffCreateSchema.parse({ ...parsed, person: { fullName: 'ক' }, pay: '' }).pay).toBeNull();
    expect(staffCreateSchema.safeParse({ ...parsed, kind: 'volunteer' }).success).toBe(false);
  });

  it('needs a reason to leave', () => {
    expect(staffLeaveSchema.safeParse({ leftOn: '2026-05-01', reason: '  ' }).success).toBe(false);
    expect(staffLeaveSchema.parse({ leftOn: '2026-05-01', reason: ' চুক্তি শেষ ' }).reason).toBe('চুক্তি শেষ');
  });
});

describe('attendance contracts', () => {
  it('keeps times only for present and half days', () => {
    expect(attendanceEntrySchema.parse({ staffId: STAFF, status: 'present', inTime: '08:00', outTime: '' })).toMatchObject({ inTime: '08:00', outTime: null });
    expect(attendanceEntrySchema.safeParse({ staffId: STAFF, status: 'absent', inTime: '08:00' }).success).toBe(false);
    expect(attendanceEntrySchema.safeParse({ staffId: STAFF, status: 'present', inTime: '24:00' }).success).toBe(false);
  });

  it('refuses the same staff member twice in one save', () => {
    const entry = { staffId: STAFF, status: 'present' };
    expect(attendanceSaveSchema.safeParse({ date: '2026-10-12', entries: [entry, entry] }).success).toBe(false);
    expect(attendanceSaveSchema.safeParse({ date: '2026-10-12', entries: [entry, { ...entry, staffId: OTHER }] }).success).toBe(true);
  });

  it('opens today and yesterday to plain edits', () => {
    expect(attendanceOpen('2026-10-12', '2026-10-12')).toBe(true);
    expect(attendanceOpen('2026-10-11', '2026-10-12')).toBe(true);
    expect(attendanceOpen('2026-10-10', '2026-10-12')).toBe(false);
    expect(attendanceOpen('2026-10-13', '2026-10-12')).toBe(false);
  });

  it('lists the days of a month', () => {
    expect(monthDays('2028-02')).toHaveLength(29);
    expect(monthDays('2026-10').at(-1)).toBe('2026-10-31');
    expect(isoMonth.safeParse('2026-13').success).toBe(false);
  });

  it('counts marks and days worked, half days at a half', () => {
    const counts = attendanceCounts(['present', 'present', 'half_day', 'absent', null, 'off']);
    expect(counts).toEqual({ present: 2, half_day: 1, leave: 0, absent: 1, off: 1, unmarked: 1 });
    expect(daysWorked(counts)).toBe('2.5');
    expect(daysWorked({ present: 22, half_day: 2 })).toBe('23');
  });
});
