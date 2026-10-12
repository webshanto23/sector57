import { pick, TIME_ZONE, type ArrearsReport, type CollectionReport, type DayBook, type IncomeReport, type Locale } from '@s57/shared';
import type { CsvCell } from './csv.js';

/**
 * Column headings and words of the CSV files, by locale. Only the API writes CSV, so they
 * live here rather than in the web's message files.
 */
const WORDS = {
  bn: {
    section: 'বিভাগ',
    number: 'নম্বর',
    time: 'সময়',
    name: 'নাম / বিবরণ',
    place: 'ইউনিট / খাত / তহবিল',
    account: 'হিসাব',
    amount: 'টাকা',
    by: 'আদায়কারী / পরিশোধকারী',
    void: 'বাতিল',
    yes: 'হ্যাঁ',
    receipts: 'বিল আদায়',
    donations: 'দান',
    expenses: 'খরচ',
    transfers: 'স্থানান্তর',
    cash: 'নগদ',
    bank: 'ব্যাংক',
    area: 'এলাকা',
    bills: 'বিল',
    billed: 'বিল করা',
    collected: 'আদায়',
    outstanding: 'বাকি',
    percent: 'আদায় %',
    total: 'মোট',
    unit: 'ইউনিট',
    code: 'হোল্ডিং নম্বর',
    address: 'ঠিকানা',
    billTo: 'বিল প্রাপক',
    phone: 'ফোন',
    oldestDue: 'সবচেয়ে পুরনো শেষ তারিখ',
    d30: '১–৩০ দিন',
    d90: '৩১–৯০ দিন',
    older: '৯০+ দিন',
    owed: 'মোট বকেয়া',
    income: 'আয়',
    expenditure: 'ব্যয়',
    budget: 'বাজেট',
    remaining: 'অবশিষ্ট',
    surplus: 'উদ্বৃত্ত',
    donationsLine: 'দান',
  },
  en: {
    section: 'Section',
    number: 'Number',
    time: 'Time',
    name: 'Name / description',
    place: 'Unit / head / fund',
    account: 'Account',
    amount: 'Amount',
    by: 'Collected or paid by',
    void: 'Void',
    yes: 'Yes',
    receipts: 'Bill receipts',
    donations: 'Donations',
    expenses: 'Expenses',
    transfers: 'Transfers',
    cash: 'Cash',
    bank: 'Bank',
    area: 'Area',
    bills: 'Bills',
    billed: 'Billed',
    collected: 'Collected',
    outstanding: 'Outstanding',
    percent: 'Collected %',
    total: 'Total',
    unit: 'Unit',
    code: 'Holding no.',
    address: 'Address',
    billTo: 'Bill to',
    phone: 'Phone',
    oldestDue: 'Oldest due date',
    d30: '1–30 days',
    d90: '31–90 days',
    older: '90+ days',
    owed: 'Total owed',
    income: 'Income',
    expenditure: 'Expenditure',
    budget: 'Budget',
    remaining: 'Remaining',
    surplus: 'Surplus',
    donationsLine: 'Donations',
  },
} as const satisfies Record<Locale, Record<string, string>>;

const time = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const name = (ref: { nameBn: string; nameEn: string | null }, locale: Locale) => pick(ref.nameBn, ref.nameEn, locale);

export function dayBookCsv(book: DayBook, locale: Locale): CsvCell[][] {
  const w = WORDS[locale];
  const rows: CsvCell[][] = [[w.section, w.number, w.time, w.name, w.place, w.account, w.amount, w.by, w.void]];
  const flag = (value: boolean) => (value ? w.yes : null);
  for (const row of book.receipts?.items ?? []) {
    rows.push([w.receipts, row.receiptNo, time(row.at), row.payer, row.unit?.join(', ') ?? null, w.cash, row.amount, row.collector.name, flag(row.void)]);
  }
  for (const row of book.donations?.items ?? []) {
    rows.push([w.donations, row.receiptNo, time(row.at), row.payer, name(row.fund, locale), w.cash, row.amount, row.collector.name, flag(row.void)]);
  }
  for (const row of book.expenses?.items ?? []) {
    rows.push([w.expenses, row.voucherNo, time(row.at), row.description, name(row.head, locale), w[row.account], row.amount, row.paidBy, flag(row.void)]);
  }
  for (const row of book.transfers?.items ?? []) {
    const from = `${name(row.from.fund, locale)} (${w[row.from.account]})`;
    const to = `${name(row.to.fund, locale)} (${w[row.to.account]})`;
    rows.push([w.transfers, null, null, row.memo, `${from} → ${to}`, null, row.amount, null, flag(row.void)]);
  }
  return rows;
}

export function collectionCsv(report: CollectionReport, locale: Locale): CsvCell[][] {
  const w = WORDS[locale];
  return [
    [w.area, w.bills, w.billed, w.collected, w.outstanding, w.percent],
    ...report.areas.map((area) => [area.name, area.bills, area.billed, area.collected, area.outstanding, area.percent]),
    [w.total, report.totals.bills, report.totals.billed, report.totals.collected, report.totals.outstanding, report.totals.percent],
  ];
}

export function arrearsCsv(report: ArrearsReport, locale: Locale): CsvCell[][] {
  const w = WORDS[locale];
  const { totals } = report;
  return [
    [w.unit, w.code, w.address, w.billTo, w.phone, w.bills, w.oldestDue, w.d30, w.d90, w.older, w.owed],
    ...report.rows.map((row) => [
      row.unit,
      row.code,
      row.address.join(', '),
      row.billTo?.name ?? null,
      row.billTo?.phone ?? null,
      row.bills,
      row.oldestDue,
      row.buckets.d30,
      row.buckets.d90,
      row.buckets.older,
      row.owed,
    ]),
    [w.total, null, null, null, null, totals.bills, null, totals.d30, totals.d90, totals.older, totals.owed],
  ];
}

export function incomeCsv(report: IncomeReport, locale: Locale): CsvCell[][] {
  const w = WORDS[locale];
  const { income, expenditure } = report;
  return [
    [w.section, w.name, w.billed, w.amount, w.budget, w.remaining],
    ...income.charges.map((line) => [w.income, name(line.chargeType, locale), line.billed, line.collected, null, null]),
    [w.income, w.donationsLine, null, income.donations, null, null],
    [w.income, w.total, income.billed, income.total, null, null],
    ...expenditure.heads.map((line) => [w.expenditure, name(line.head, locale), null, line.spent, line.budget, line.remaining]),
    [w.expenditure, w.total, null, expenditure.total, expenditure.budget, null],
    [w.surplus, null, null, report.surplus, null, null],
  ];
}
