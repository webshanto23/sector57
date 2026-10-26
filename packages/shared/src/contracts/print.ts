import { z } from 'zod';
import { optionalText } from '../schemas.js';

// ---------------------------------------------------------------------------
// Print formats: the paper a document prints on
// ---------------------------------------------------------------------------

/**
 * Every paper the app knows. A format is data: adding one (say `thermal58`) means a new value
 * here, a layout in the web, and listing it for the document types that have that layout.
 */
export const PRINT_FORMATS = ['a4', 'a5', 'thermal80'] as const;
export type PrintFormat = (typeof PRINT_FORMATS)[number];
export const printFormatSchema = z.enum(PRINT_FORMATS);

/** The formats each document type has a layout for. Thermal joins bills in Step 30b. */
export const PRINT_SUPPORT = {
  bill: ['a4', 'a5'],
} as const satisfies Record<string, readonly PrintFormat[]>;
export type PrintDocument = keyof typeof PRINT_SUPPORT;

/** Longest bill note; each line prints as one point. */
export const BILL_NOTE_MAX = 600;

/** One document type's choice: what the office offers and which one prints unless someone picks. */
export const printChoiceSchema = z.object({
  default: printFormatSchema,
  offered: z.array(printFormatSchema),
});
export type PrintChoice = z.infer<typeof printChoiceSchema>;

/** The `print_formats` setting as read. Bills also carry the note printed on them. */
export const printFormatsSchema = z.object({
  bill: printChoiceSchema.extend({ noteBn: z.string().nullable(), noteEn: z.string().nullable() }),
});
export type PrintFormats = z.infer<typeof printFormatsSchema>;
export type BillPrintSettings = PrintFormats['bill'];

/** What a society prints before it saves a choice: A4 bills, with A5 offered too. */
export const DEFAULT_PRINT_FORMATS: PrintFormats = {
  bill: { default: 'a4', offered: ['a4', 'a5'], noteBn: null, noteEn: null },
};

/** Keeps a choice to formats the document has a layout for; the default falls back to the first one left. */
function supportedChoice<T extends PrintChoice>(document: PrintDocument, choice: T, fallback: T): T {
  const supported: readonly PrintFormat[] = PRINT_SUPPORT[document];
  const offered = supported.filter((format) => choice.offered.includes(format));
  if (offered.length === 0) return fallback;
  return { ...choice, offered, default: offered.includes(choice.default) ? choice.default : offered[0]! };
}

/** The saved setting, or the defaults for anything missing or no longer valid. */
export function printFormatsOf(value: unknown): PrintFormats {
  const parsed = printFormatsSchema.safeParse(value);
  if (!parsed.success) return DEFAULT_PRINT_FORMATS;
  return { bill: supportedChoice('bill', parsed.data.bill, DEFAULT_PRINT_FORMATS.bill) };
}

/** For a choice's `superRefine`: only formats the document has, each once, and the default among them. */
function refineChoice(document: PrintDocument) {
  return (choice: PrintChoice, ctx: z.RefinementCtx) => {
    const supported: readonly PrintFormat[] = PRINT_SUPPORT[document];
    if (choice.offered.some((format) => !supported.includes(format))) {
      ctx.addIssue({ code: 'custom', path: ['offered'], message: 'print_format_unsupported' });
    }
    if (new Set(choice.offered).size !== choice.offered.length) ctx.addIssue({ code: 'custom', path: ['offered'], message: 'print_format_twice' });
    if (!choice.offered.includes(choice.default)) ctx.addIssue({ code: 'custom', path: ['default'], message: 'print_default_not_offered' });
  };
}

/** `PATCH /settings` `printFormats`. */
export const printFormatsInputSchema = z.object({
  bill: printChoiceSchema
    .extend({ offered: z.array(printFormatSchema).min(1), noteBn: optionalText(BILL_NOTE_MAX), noteEn: optionalText(BILL_NOTE_MAX) })
    .superRefine(refineChoice('bill')),
});

/**
 * Which paper prints: a one-off pick, else this device's remembered choice, else the society's
 * default. A pick or a remembered choice counts only while the society still offers it.
 */
export function pickFormat(choice: PrintChoice, device: string | null, oneOff: string | null = null): PrintFormat {
  for (const wanted of [oneOff, device]) {
    const format = PRINT_FORMATS.find((known) => known === wanted);
    if (format && choice.offered.includes(format)) return format;
  }
  return choice.default;
}

/** Above this many lines an A4 bill prints compact rows and merges payment and notes, to stay on one page. */
export const BILL_COMPACT_ABOVE = 10;

export const billDensity = (lineCount: number): 'normal' | 'compact' => (lineCount > BILL_COMPACT_ABOVE ? 'compact' : 'normal');

/** The office's note as points: one per non-blank line. */
export const notePoints = (note: string | null): string[] =>
  (note ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
