import type { Locale, StickerReason, StickerRow, StickerState, VehicleKind } from '@s57/shared';
import type { CsvCell } from '../reports/csv.js';

/** Headings and words of the stickers CSV, by locale (only the API writes CSV). */
const WORDS = {
  bn: {
    stickerNo: 'স্টিকার নম্বর',
    regNo: 'নিবন্ধন নম্বর',
    kind: 'ধরন',
    place: 'ইউনিট',
    reason: 'কারণ',
    state: 'অবস্থা',
    validUntil: 'মেয়াদ',
    invoiceNo: 'বিল নম্বর',
    issuedAt: 'দেওয়ার তারিখ',
    more: 'তালিকা কাটা হয়েছে: আরও স্টিকার আছে',
  },
  en: {
    stickerNo: 'Sticker no.',
    regNo: 'Registration no.',
    kind: 'Kind',
    place: 'Unit',
    reason: 'Reason',
    state: 'State',
    validUntil: 'Valid until',
    invoiceNo: 'Bill no.',
    issuedAt: 'Issued',
    more: 'List cut short: there are more stickers',
  },
} as const;

const KINDS: Record<Locale, Record<VehicleKind, string>> = {
  bn: { car: 'গাড়ি', motorcycle: 'মোটরসাইকেল', microbus: 'মাইক্রোবাস', cng: 'সিএনজি', bicycle: 'সাইকেল', other: 'অন্যান্য' },
  en: { car: 'Car', motorcycle: 'Motorcycle', microbus: 'Microbus', cng: 'CNG', bicycle: 'Bicycle', other: 'Other' },
};
const REASONS: Record<Locale, Record<StickerReason, string>> = {
  bn: { new: 'নতুন', renewal: 'নবায়ন', replacement: 'বদলি' },
  en: { new: 'New', renewal: 'Renewal', replacement: 'Replacement' },
};
const STATES: Record<Locale, Record<StickerState, string>> = {
  bn: { active: 'চালু', expired: 'মেয়াদোত্তীর্ণ', revoked: 'বাতিল', replaced: 'বদলানো' },
  en: { active: 'Active', expired: 'Expired', revoked: 'Revoked', replaced: 'Replaced' },
};

/** One row per sticker, by number. */
export function stickerCsv(list: { rows: StickerRow[]; truncated: boolean }, locale: Locale): CsvCell[][] {
  const w = WORDS[locale];
  const rows: CsvCell[][] = [[w.stickerNo, w.regNo, w.kind, w.place, w.reason, w.state, w.validUntil, w.invoiceNo, w.issuedAt]];
  for (const row of list.rows) {
    rows.push([
      row.stickerNo,
      row.vehicle.regNo,
      KINDS[locale][row.vehicle.kind],
      [...row.place.address, row.place.name].join(', '),
      REASONS[locale][row.reason],
      STATES[locale][row.state],
      row.validUntil,
      row.invoice?.invoiceNo ?? null,
      row.issuedAt.slice(0, 10),
    ]);
  }
  if (list.truncated) rows.push([w.more]);
  return rows;
}
