import type { AssetRow, AssetStatus, Locale } from '@s57/shared';
import type { CsvCell } from '../reports/csv.js';

/** Headings and words of the assets CSV, by locale (only the API writes CSV). */
const WORDS = {
  bn: {
    assetNo: 'সম্পদ নম্বর',
    name: 'নাম',
    nameEn: 'নাম (ইংরেজি)',
    category: 'ধরন',
    facility: 'সুবিধা',
    place: 'অবস্থান',
    custodian: 'দায়িত্বে',
    status: 'অবস্থা',
    purchasedOn: 'কেনার তারিখ',
    purchaseCost: 'দাম',
    nextDue: 'পরের রক্ষণাবেক্ষণ',
    more: 'তালিকা কাটা হয়েছে: আরও সম্পদ আছে',
  },
  en: {
    assetNo: 'Asset no.',
    name: 'Name',
    nameEn: 'Name (English)',
    category: 'Category',
    facility: 'Facility',
    place: 'Place',
    custodian: 'Custodian',
    status: 'Status',
    purchasedOn: 'Purchased',
    purchaseCost: 'Cost',
    nextDue: 'Next upkeep',
    more: 'List cut short: there are more assets',
  },
} as const;

const STATUSES: Record<Locale, Record<AssetStatus, string>> = {
  bn: { in_use: 'চালু', repair: 'মেরামতে', retired: 'বাতিল', lost: 'হারানো' },
  en: { in_use: 'In use', repair: 'Under repair', retired: 'Retired', lost: 'Lost' },
};

/** One row per asset, by number. */
export function assetCsv(
  list: { rows: (AssetRow & { purchasedOn: string | null; purchaseCost: string | null })[]; truncated: boolean },
  locale: Locale,
): CsvCell[][] {
  const w = WORDS[locale];
  const pick = (name: { bn: string; en: string | null }) => (locale === 'en' ? (name.en ?? name.bn) : name.bn);
  const rows: CsvCell[][] = [[w.assetNo, w.name, w.nameEn, w.category, w.facility, w.place, w.custodian, w.status, w.purchasedOn, w.purchaseCost, w.nextDue]];
  for (const row of list.rows) {
    rows.push([
      row.assetNo,
      row.name.bn,
      row.name.en,
      row.category,
      row.facility ? pick(row.facility.name) : null,
      [...row.place.address, row.place.name].join(', '),
      row.custodian ? (locale === 'en' ? (row.custodian.nameEn ?? row.custodian.name) : row.custodian.name) : null,
      STATUSES[locale][row.status],
      row.purchasedOn,
      row.purchaseCost,
      row.nextDueOn,
    ]);
  }
  if (list.truncated) rows.push([w.more]);
  return rows;
}
