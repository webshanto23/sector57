import { z } from 'zod';

/**
 * Copies of a party's ID papers: the two sides of a person's NID, and the pages of an
 * organisation's trade licence. They are private `documents` rows (kept out of the documents
 * library) and only those who may edit the person or organisation see or change them.
 */
export const NID_SIDES = ['front', 'back'] as const;
export type NidSide = (typeof NID_SIDES)[number];

/** `documents.doc_type` of each copy; `documents.entity_type` is `person` or `organisation`. */
export const NID_COPY_TYPES = { front: 'nid_front', back: 'nid_back' } as const satisfies Record<NidSide, string>;
export const TRADE_LICENCE_TYPE = 'trade_licence';
/** Doc types the documents library never lists or serves. */
export const ID_COPY_TYPES: readonly string[] = [...Object.values(NID_COPY_TYPES), TRADE_LICENCE_TYPE];

/** Most trade licence pages one organisation keeps. */
export const MAX_LICENCE_PAGES = 10;

export const nidSideParam = z.object({ id: z.uuid(), side: z.enum(NID_SIDES) });
export const idCopyParam = z.object({ id: z.uuid(), docId: z.uuid() });

export const idCopySchema = z.object({
  id: z.uuid(),
  /** `pdf` downloads, `image` opens in the browser. */
  kind: z.enum(['pdf', 'image']),
  uploadedAt: z.iso.datetime({ offset: true }),
});
export type IdCopy = z.infer<typeof idCopySchema>;

/** `GET /persons/:id/nid-copy`: the current copy of each side, or null. */
export const nidCopiesSchema = z.object({ front: idCopySchema.nullable(), back: idCopySchema.nullable() });
export type NidCopies = z.infer<typeof nidCopiesSchema>;

/** `GET /organisations/:id/licence-pages`: the current pages in upload order. */
export const licencePagesSchema = z.object({ items: z.array(idCopySchema) });
export type LicencePages = z.infer<typeof licencePagesSchema>;
