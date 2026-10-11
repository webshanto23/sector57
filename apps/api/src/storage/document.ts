import { UnsupportedMediaTypeException } from '@nestjs/common';
import { processImage } from './image.js';

export type ProcessedDocument = { data: Buffer; extension: 'webp' | 'pdf' };

const unsupported = () =>
  new UnsupportedMediaTypeException({ code: 'unsupported_document', message: 'Upload a photo (JPEG, PNG or WebP) or a PDF' });

const PDF_MAGIC = Buffer.from('%PDF-');
const PDF_END = Buffer.from('%%EOF');
// Names of PDF features that run code, open other programs or carry other files. Scanned deeds
// never need them. A basic filter only (compressed object streams can hide names), which is why
// the API also sends every PDF as a download, never inline.
const ACTIVE_PDF = /\/(JavaScript|JS|Launch|EmbeddedFile|EmbeddedFiles|RichMedia|XFA|SubmitForm|ImportData)\b/;

/**
 * Checks a form attachment from its bytes (never its name or declared type):
 * - a photo is re-encoded like any image (`processImage`: upright, at most 1600 px, no EXIF);
 * - a PDF must start with `%PDF-`, end with `%%EOF` (not cut off) and carry no active content.
 * Anything else is 415 `unsupported_document`.
 */
export async function processDocument(input: Buffer): Promise<ProcessedDocument> {
  if (input.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    const tail = input.subarray(Math.max(0, input.length - 1024));
    if (tail.indexOf(PDF_END) === -1) throw unsupported();
    if (ACTIVE_PDF.test(input.toString('latin1'))) throw unsupported();
    return { data: input, extension: 'pdf' };
  }
  try {
    const image = await processImage(input);
    return { data: image.full, extension: 'webp' };
  } catch {
    throw unsupported();
  }
}

/** Content type of a stored document from its key. */
export const documentContentType = (key: string) => (key.endsWith('.pdf') ? 'application/pdf' : 'image/webp');
