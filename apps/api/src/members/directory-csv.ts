import type { DirectoryPrint, Locale, OccupantRelation } from '@s57/shared';
import type { CsvCell } from '../reports/csv.js';

/** Headings and words of the directory CSV, by locale (only the API writes CSV). */
const WORDS = {
  bn: {
    address: 'ঠিকানা',
    unit: 'ইউনিট',
    name: 'নাম',
    nameEn: 'নাম (ইংরেজি)',
    relation: 'সম্পর্ক',
    household: 'পরিবার',
    owner: 'মালিকের',
    renter: 'ভাড়াটিয়ার',
    isOwner: 'মালিক',
    yes: 'হ্যাঁ',
    phone: 'ফোন',
    memberNo: 'সদস্য নম্বর',
    since: 'কবে থেকে',
    more: 'তালিকা কাটা হয়েছে: আরও বাসিন্দা আছেন',
  },
  en: {
    address: 'Address',
    unit: 'Unit',
    name: 'Name',
    nameEn: 'Name (English)',
    relation: 'Relation',
    household: 'Household',
    owner: "Owner's",
    renter: "Renter's",
    isOwner: 'Owner',
    yes: 'Yes',
    phone: 'Phone',
    memberNo: 'Member no.',
    since: 'Since',
    more: 'List cut short: there are more residents',
  },
} as const;

const RELATIONS: Record<Locale, Record<OccupantRelation, string>> = {
  bn: {
    head: 'পরিবারপ্রধান',
    spouse: 'স্বামী/স্ত্রী',
    child: 'সন্তান',
    parent: 'মা/বাবা',
    sibling: 'ভাই/বোন',
    relative: 'আত্মীয়',
    co_renter: 'সহ-ভাড়াটিয়া',
    domestic_help: 'গৃহকর্মী',
    driver: 'গাড়িচালক',
    other: 'অন্যান্য',
  },
  en: {
    head: 'Head of household',
    spouse: 'Spouse',
    child: 'Child',
    parent: 'Parent',
    sibling: 'Sibling',
    relative: 'Relative',
    co_renter: 'Co-renter',
    domestic_help: 'Domestic help',
    driver: 'Driver',
    other: 'Other',
  },
};

/** One row per resident, in address order. No national IDs. */
export function directoryCsv(list: DirectoryPrint, locale: Locale): CsvCell[][] {
  const w = WORDS[locale];
  const rows: CsvCell[][] = [[w.address, w.unit, w.name, w.nameEn, w.relation, w.household, w.isOwner, w.phone, w.memberNo, w.since]];
  for (const row of list.items) {
    rows.push([
      row.place.address.join(', '),
      row.place.name,
      row.person.name,
      row.person.nameEn,
      RELATIONS[locale][row.relation],
      w[row.household],
      row.isOwner ? w.yes : '',
      row.person.phone,
      row.memberNo,
      row.since,
    ]);
  }
  if (list.truncated) rows.push([w.more]);
  return rows;
}
