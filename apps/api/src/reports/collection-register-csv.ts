import { pick, type CollectionRegister, type Locale, type RegisterTotals } from '@s57/shared';
import type { CsvCell } from './csv.js';

const WORDS = {
  bn: {
    date: 'তারিখ',
    payer: 'পরিশোধকারী',
    role: 'ধরন',
    months: 'মাস',
    receipt: 'রসিদ',
    method: 'পদ্ধতি',
    collector: 'আদায়কারী',
    donation: 'দান',
    total: 'মোট',
    void: 'বাতিল',
    yes: 'হ্যাঁ',
    dayTotal: 'দিনের মোট',
    monthTotal: 'মাসের মোট',
    roles: { owner: 'মালিক', renter: 'ভাড়াটিয়া', member: 'সদস্য' },
    methods: { cash: 'নগদ', bank: 'ব্যাংক', cheque: 'চেক', mobile: 'মোবাইল ওয়ালেট' },
  },
  en: {
    date: 'Date',
    payer: 'Payer',
    role: 'Role',
    months: 'Months',
    receipt: 'Receipt',
    method: 'Method',
    collector: 'Collector',
    donation: 'Donation',
    total: 'Total',
    void: 'Void',
    yes: 'Yes',
    dayTotal: 'Day total',
    monthTotal: 'Month total',
    roles: { owner: 'Owner', renter: 'Renter', member: 'Member' },
    methods: { cash: 'Cash', bank: 'Bank', cheque: 'Cheque', mobile: 'Mobile wallet' },
  },
} as const;

/** The register as one row per receipt, a total row under each day and the month total last. Voided rows are marked and never counted. */
export function collectionRegisterCsv(report: CollectionRegister, locale: Locale): CsvCell[][] {
  const w = WORDS[locale];
  const money = report.columns.map((column) => (column.nameBn ? pick(column.nameBn, column.nameEn, locale) : w.donation));
  const levels = report.levels.map((level) => pick(level.nameBn, level.nameEn, locale));
  const gap = (count: number): CsvCell[] => Array.from({ length: count }, () => null);
  const figures = (totals: RegisterTotals): CsvCell[] => [...report.columns.map((column) => totals.amounts[column.key] ?? null), totals.total];

  const rows: CsvCell[][] = [[w.date, w.payer, w.role, w.months, ...levels, w.receipt, w.method, w.collector, ...money, w.total, w.void]];
  for (const day of report.days) {
    for (const row of day.rows) {
      rows.push([
        row.day,
        row.payer,
        row.role ? w.roles[row.role] : null,
        row.months.join(' + '),
        ...row.places,
        row.receiptNo,
        w.methods[row.method],
        row.collector.name,
        ...report.columns.map((column) => row.amounts[column.key] ?? null),
        row.total,
        row.void ? w.yes : null,
      ]);
    }
    rows.push([day.day, w.dayTotal, null, null, ...gap(levels.length), day.receipts, null, null, ...figures(day), null]);
  }
  rows.push([report.month, w.monthTotal, null, null, ...gap(levels.length), report.totals.receipts, null, null, ...figures(report.totals), null]);
  return rows;
}
