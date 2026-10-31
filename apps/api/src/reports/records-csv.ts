import { pick, type Locale, type MembersReport, type OccupancyReport, type RentersReport } from '@s57/shared';
import type { CsvCell } from './csv.js';

/** Column headings and words of the records CSV files, by locale (only the API writes CSV). */
const WORDS = {
  bn: {
    area: 'এলাকা',
    units: 'ইউনিট',
    ownerOccupied: 'মালিকের ব্যবহারে',
    rented: 'ভাড়া',
    vacant: 'খালি',
    occupied: 'বসবাস %',
    total: 'মোট',
    memberNo: 'সদস্যপদ আইডি',
    name: 'নাম',
    phone: 'ফোন',
    address: 'ঠিকানা',
    joinedOn: 'যোগদান',
    status: 'অবস্থা',
    unit: 'ইউনিট',
    renter: 'ভাড়াটিয়া',
    renterType: 'ধরন',
    startDate: 'শুরু',
    household: 'সদস্য সংখ্যা',
    policeForm: 'পুলিশ ফরম',
    yes: 'জমা',
    no: 'বাকি',
    membership: { active: 'সক্রিয়', lapsed: 'মেয়াদোত্তীর্ণ', cancelled: 'বাতিল' },
    renterTypes: { family: 'পরিবার', bachelor: 'ব্যাচেলর', office: 'অফিস', warehouse: 'গুদাম', shop: 'দোকান', other: 'অন্যান্য' },
  },
  en: {
    area: 'Area',
    units: 'Units',
    ownerOccupied: 'Owner occupied',
    rented: 'Rented',
    vacant: 'Vacant',
    occupied: 'Occupied %',
    total: 'Total',
    memberNo: 'Membership ID',
    name: 'Name',
    phone: 'Phone',
    address: 'Address',
    joinedOn: 'Joined',
    status: 'Status',
    unit: 'Unit',
    renter: 'Renter',
    renterType: 'Kind',
    startDate: 'Since',
    household: 'People',
    policeForm: 'Police form',
    yes: 'Submitted',
    no: 'Missing',
    membership: { active: 'Active', lapsed: 'Lapsed', cancelled: 'Cancelled' },
    renterTypes: { family: 'Family', bachelor: 'Bachelor', office: 'Office', warehouse: 'Warehouse', shop: 'Shop', other: 'Other' },
  },
} as const;

export function occupancyCsv(report: OccupancyReport, locale: Locale): CsvCell[][] {
  const w = WORDS[locale];
  const line = (name: string, f: OccupancyReport['totals']) => [name, f.units, f.ownerOccupied, f.rented, f.vacant, f.occupiedPercent];
  return [[w.area, w.units, w.ownerOccupied, w.rented, w.vacant, w.occupied], ...report.areas.map((area) => line(area.name, area)), line(w.total, report.totals)];
}

export function membersCsv(report: MembersReport, locale: Locale): CsvCell[][] {
  const w = WORDS[locale];
  return [
    [w.memberNo, w.name, w.phone, w.address, w.joinedOn, w.status],
    ...report.joined.map((row) => [row.membershipCode, pick(row.name, row.nameEn, locale), row.phone, row.address.join(', '), row.joinedOn, w.membership[row.status]]),
  ];
}

export function rentersCsv(report: RentersReport, locale: Locale): CsvCell[][] {
  const w = WORDS[locale];
  return [
    [w.unit, w.address, w.renter, w.phone, w.renterType, w.startDate, w.household, w.policeForm],
    ...report.rows.map((row) => [
      row.unit,
      row.address.join(', '),
      pick(row.renter.name, row.renter.nameEn, locale),
      row.phone,
      w.renterTypes[row.renterType],
      row.startDate,
      row.household,
      row.policeForm ? w.yes : w.no,
    ]),
    [w.total, null, report.totals.tenancies, null, null, null, report.totals.people, null],
  ];
}
