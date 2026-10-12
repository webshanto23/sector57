import type { Locale, StaffKind, StaffRow } from '@s57/shared';
import type { CsvCell } from '../reports/csv.js';

/** Headings and words of the staff CSV, by locale (only the API writes CSV). */
const WORDS = {
  bn: {
    staffNo: 'কর্মী নম্বর',
    name: 'নাম',
    nameEn: 'নাম (ইংরেজি)',
    phone: 'ফোন',
    designation: 'পদবি',
    kind: 'ধরন',
    posted: 'কর্মস্থল',
    joined: 'যোগদান',
    left: 'বিদায়',
    pay: 'বেতন / দৈনিক মজুরি',
    more: 'তালিকা কাটা হয়েছে: আরও কর্মী আছেন',
  },
  en: {
    staffNo: 'Staff no.',
    name: 'Name',
    nameEn: 'Name (English)',
    phone: 'Phone',
    designation: 'Designation',
    kind: 'Kind',
    posted: 'Posted at',
    joined: 'Joined',
    left: 'Left',
    pay: 'Salary / daily rate',
    more: 'List cut short: there are more staff',
  },
} as const;

const KINDS: Record<Locale, Record<StaffKind, string>> = {
  bn: { permanent: 'স্থায়ী', contract: 'চুক্তিভিত্তিক', daily: 'দৈনিক' },
  en: { permanent: 'Permanent', contract: 'Contract', daily: 'Daily' },
};

/** One row per stint, by staff number. No national IDs; pay only when `withPay`. */
export function staffCsv(list: { rows: (StaffRow & { pay: string | null })[]; truncated: boolean }, locale: Locale, withPay: boolean): CsvCell[][] {
  const w = WORDS[locale];
  const head: CsvCell[] = [w.staffNo, w.name, w.nameEn, w.phone, w.designation, w.kind, w.posted, w.joined, w.left];
  const rows: CsvCell[][] = [withPay ? [...head, w.pay] : head];
  for (const row of list.rows) {
    const cells: CsvCell[] = [
      row.staffNo,
      row.person.name,
      row.person.nameEn,
      row.person.phone,
      locale === 'en' ? (row.designation.en ?? row.designation.bn) : row.designation.bn,
      KINDS[locale][row.kind],
      [...row.posted.address, row.posted.name].join(', '),
      row.joinedOn,
      row.leftOn,
    ];
    rows.push(withPay ? [...cells, row.pay] : cells);
  }
  if (list.truncated) rows.push([w.more]);
  return rows;
}
