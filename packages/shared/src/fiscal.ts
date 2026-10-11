/**
 * Fiscal years start on the first day of `societies.fiscal_year_start_month` (July in
 * Bangladesh). A year that spans two calendar years is written `2026-27`; one that
 * starts in January is just `2026`. Dates are plain `YYYY-MM-DD` calendar days (Dhaka).
 */
export type FiscalYear = { startYear: number; label: string; start: string; end: string };

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDay(day: string): { year: number; month: number } {
  const match = ISO_DAY.exec(day);
  if (!match) throw new RangeError(`Not a date: ${day}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** The fiscal year that starts in `startYear`. */
export function fiscalYearStarting(startYear: number, startMonth: number): FiscalYear {
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) throw new RangeError(`Not a month: ${startMonth}`);
  const start = `${startYear}-${pad2(startMonth)}-01`;
  // The day before the next year's start: day 0 of the start month, a year on.
  const endDate = new Date(Date.UTC(startYear + 1, startMonth - 1, 0));
  const end = endDate.toISOString().slice(0, 10);
  const label = startMonth === 1 ? String(startYear) : `${startYear}-${pad2((startYear + 1) % 100)}`;
  return { startYear, label, start, end };
}

/** The fiscal year a calendar day falls in. */
export function fiscalYearOf(day: string, startMonth: number): FiscalYear {
  const { year, month } = parseDay(day);
  return fiscalYearStarting(month >= startMonth ? year : year - 1, startMonth);
}

// ---------------------------------------------------------------------------
// Document numbers
// ---------------------------------------------------------------------------

/** What `document_sequences` numbers. */
export const DOCUMENT_KINDS = ['invoice', 'receipt', 'voucher'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/**
 * The counter a document draws from, so numbering restarts at the right time:
 * invoices each month (`2610`), vouchers each fiscal year (`26` for 2026-27),
 * receipts never (`''`).
 */
export function documentPeriod(kind: DocumentKind, day: string, fiscalStartMonth: number): string {
  const { year, month } = parseDay(day);
  if (kind === 'invoice') return `${pad2(year % 100)}${pad2(month)}`;
  if (kind === 'voucher') return pad2(fiscalYearOf(day, fiscalStartMonth).startYear % 100);
  return '';
}

/** `INV-2610-0001`, `RC-00001`, `EXP-26-0001`. Numbers past the padding just grow longer. */
export function formatDocumentNo(kind: DocumentKind, period: string, no: number): string {
  if (kind === 'invoice') return `INV-${period}-${String(no).padStart(4, '0')}`;
  if (kind === 'voucher') return `EXP-${period}-${String(no).padStart(4, '0')}`;
  return `RC-${String(no).padStart(5, '0')}`;
}
