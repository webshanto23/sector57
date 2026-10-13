import { ConflictException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import { lineTotals, monthBounds, payslipFigures, payslipNet, stintInMonth, toStaffKind, type PayslipLineKind } from '@s57/shared';
import { isoDate } from '../common/dates.js';

type Tx = Prisma.TransactionClient;

/** What a draft refresh keeps of a payslip the office already edited. */
export interface KeptPayslip {
  fundId: string;
  note: string | null;
  lines: { kind: PayslipLineKind; labelBn: string; labelEn: string | null; amount: string }[];
}

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/**
 * Writes one payslip per staff stint that overlaps `month`, from the stint's pay and the
 * month's attendance. Kept fund, note and lines (a refresh) carry over by staff row; everyone
 * else is charged to `defaultFundId`. Returns how many payslips were written.
 */
export async function writePayslips(tx: Tx, societyId: string, runId: string, month: string, defaultFundId: string, kept: Map<string, KeptPayslip>): Promise<number> {
  const { first, last, days } = monthBounds(month);
  const staff = await tx.staff.findMany({
    where: { society_id: societyId, joined_on: { lte: day(last) }, OR: [{ left_on: null }, { left_on: { gte: day(first) } }] },
    select: { id: true, staff_no: true, kind: true, joined_on: true, left_on: true, monthly_salary: true, daily_rate: true },
    orderBy: { staff_no: 'asc' },
  });
  if (staff.length === 0) return 0;
  const marks = await tx.attendance.groupBy({
    by: ['staff_id', 'status'],
    where: { society_id: societyId, staff_id: { in: staff.map((row) => row.id) }, date: { gte: day(first), lte: day(last) } },
    _count: { _all: true },
  });
  const count = (staffId: string, status: string) => marks.find((mark) => mark.staff_id === staffId && mark.status === status)?._count._all ?? 0;

  for (const row of staff) {
    const stint = stintInMonth(month, isoDate(row.joined_on), row.left_on ? isoDate(row.left_on) : null);
    if (!stint) continue;
    const kind = toStaffKind(row.kind);
    const rate = (kind === 'daily' ? row.daily_rate : row.monthly_salary)?.toFixed(2) ?? '0.00';
    const counts = { present: count(row.id, 'present'), halfDay: count(row.id, 'half_day'), absent: count(row.id, 'absent') };
    const figures = payslipFigures(kind, rate, days, stint.days, counts);
    const keep = kept.get(row.id);
    const lines = keep?.lines ?? [];
    const totals = lineTotals(lines);
    const net = payslipNet(figures.base, figures.attendanceDeduction, totals.allowances, totals.deductions);
    if (net === null) {
      throw new ConflictException({ code: 'payslip_negative_net', message: 'Deductions would take a payslip below zero', details: { staffNo: row.staff_no } });
    }
    await tx.payslips.create({
      data: {
        society_id: societyId,
        run_id: runId,
        staff_id: row.id,
        fund_id: keep?.fundId ?? defaultFundId,
        kind,
        rate: new Prisma.Decimal(rate),
        days_in_month: days,
        days_employed: stint.days,
        present_days: counts.present,
        half_days: counts.halfDay,
        absent_days: counts.absent,
        base: new Prisma.Decimal(figures.base),
        attendance_deduction: new Prisma.Decimal(figures.attendanceDeduction),
        allowances: new Prisma.Decimal(totals.allowances),
        deductions: new Prisma.Decimal(totals.deductions),
        net: new Prisma.Decimal(net),
        note: keep?.note ?? null,
        payslip_lines: {
          create: lines.map((line, position) => ({ kind: line.kind, label_bn: line.labelBn, label_en: line.labelEn, amount: new Prisma.Decimal(line.amount), position })),
        },
      },
    });
  }
  return staff.length;
}
