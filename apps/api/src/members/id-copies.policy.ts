import { MAX_LICENCE_PAGES, NID_COPY_TYPES, NID_SIDES, type IdCopy, type NidCopies } from '@s57/shared';

/** The part of a `documents` row an ID copy is read from. */
export type IdCopyRow = { id: string; doc_type: string; file_url: string; uploaded_at: Date };

export const toIdCopy = (row: IdCopyRow): IdCopy => ({
  id: row.id,
  kind: row.file_url.endsWith('.pdf') ? 'pdf' : 'image',
  uploadedAt: row.uploaded_at.toISOString(),
});

/** The current copy of each NID side: the newest row of its type (an upload archives the one before, so there is normally one). */
export function nidCopiesOf(rows: IdCopyRow[]): NidCopies {
  const newest = (type: string) =>
    rows.filter((row) => row.doc_type === type).reduce<IdCopyRow | null>((best, row) => (!best || row.uploaded_at > best.uploaded_at ? row : best), null);
  const [front, back] = NID_SIDES.map((side) => newest(NID_COPY_TYPES[side]));
  return { front: front ? toIdCopy(front) : null, back: back ? toIdCopy(back) : null };
}

/** Whether an organisation that keeps `count` licence pages may add one more. */
export const hasLicenceRoom = (count: number) => count < MAX_LICENCE_PAGES;

const PDF_MAGIC = Buffer.from('%PDF-');
/** NID sides take a photo only; a PDF is refused before it is stored. */
export const isPdf = (upload: Buffer) => upload.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC);
