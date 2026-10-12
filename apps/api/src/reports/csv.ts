import { StreamableFile } from '@nestjs/common';

export type CsvCell = string | number | null | undefined;

/** Plain numbers (money, counts) are written as they are, even when negative. */
const NUMBER = /^-?\d+(\.\d+)?$/;
/** A cell starting with one of these could run as a formula in a spreadsheet. */
const FORMULA = /^[=+\-@\t\r]/;

function cell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (!NUMBER.test(text) && FORMULA.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * A CSV file as Excel opens it: UTF-8 with a byte order mark (so Bangla shows), CRLF
 * lines, quoted where needed, and text that looks like a formula defused with a `'`.
 */
export function toCsv(rows: CsvCell[][]): string {
  return `﻿${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

/** The CSV as a download named `<name>.csv`. Names are plain ASCII, built by the API. */
export function csvFile(name: string, rows: CsvCell[][]): StreamableFile {
  const data = Buffer.from(toCsv(rows), 'utf8');
  return new StreamableFile(data, {
    type: 'text/csv; charset=utf-8',
    disposition: `attachment; filename="${name}.csv"`,
    length: data.length,
  });
}
