import { z } from 'zod';
import { pagination, text } from '../schemas.js';
import { cleanText } from '../text.js';

/**
 * What a library document belongs to: the society itself (minutes, circulars, licences), a
 * person, a place in the location tree (a unit or a building), or a staff member's stint.
 * Form uploads and expense vouchers are documents too, but stay on their own pages with
 * their own rules.
 */
export const DOCUMENT_ENTITIES = ['society', 'person', 'location', 'staff'] as const;
export type DocumentEntity = (typeof DOCUMENT_ENTITIES)[number];

/** Kinds of document, per what they belong to. Labels live in i18n (`Documents.type.*`). */
export const DOCUMENT_TYPES = {
  society: ['minutes', 'agm', 'circular', 'licence', 'agreement', 'other'],
  person: ['deed', 'nid', 'agreement', 'other'],
  location: ['deed', 'plan', 'agreement', 'other'],
  staff: ['contract', 'nid', 'other'],
} as const satisfies Record<DocumentEntity, readonly string[]>;
export const DOCUMENT_TYPE_KEYS = ['minutes', 'agm', 'circular', 'licence', 'agreement', 'deed', 'nid', 'plan', 'contract', 'other'] as const;
export type DocumentType = (typeof DOCUMENT_TYPE_KEYS)[number];

/** Most documents one person, place or staff member keeps (society papers have no limit). */
export const MAX_RECORD_DOCUMENTS = 50;

export const isDocumentType = (entity: DocumentEntity, type: string): type is DocumentType =>
  (DOCUMENT_TYPES[entity] as readonly string[]).includes(type);

/**
 * `POST /documents` (multipart: `file` plus these fields). `entityId` is required for a person,
 * place or staff member and left out for the society. A type that doesn't fit the entity is refused.
 */
export const documentCreateSchema = z
  .object({
    entityType: z.enum(DOCUMENT_ENTITIES),
    entityId: z.uuid().optional(),
    docType: z.enum(DOCUMENT_TYPE_KEYS),
    title: text(200),
  })
  .refine((input) => (input.entityType === 'society') === (input.entityId === undefined), { message: 'invalid_entity', path: ['entityId'] })
  .refine((input) => isDocumentType(input.entityType, input.docType), { message: 'invalid_doc_type', path: ['docType'] });
export type DocumentCreateInput = z.infer<typeof documentCreateSchema>;

/** `PATCH /documents/:id`: the title and type (the type must fit what it belongs to). */
export const documentUpdateSchema = z.object({
  title: text(200).optional(),
  docType: z.enum(DOCUMENT_TYPE_KEYS).optional(),
});
export type DocumentUpdateInput = z.infer<typeof documentUpdateSchema>;

/** `GET /documents`: the society's papers, or with `entityType` and `entityId`, one person's or place's documents. */
export const documentListQuery = pagination.extend({
  entityType: z.enum(DOCUMENT_ENTITIES).default('society'),
  entityId: z.uuid().optional(),
  docType: z.enum(DOCUMENT_TYPE_KEYS).optional(),
  q: z.string().transform(cleanText).pipe(z.string().max(100)).optional(),
  /** Archived documents instead of current ones. */
  archived: z.stringbool().default(false),
});
export type DocumentListQuery = z.infer<typeof documentListQuery>;

const userRef = z.object({ id: z.uuid(), name: z.string() });

export const documentSchema = z.object({
  id: z.uuid(),
  entityType: z.enum(DOCUMENT_ENTITIES),
  entityId: z.uuid(),
  docType: z.enum(DOCUMENT_TYPE_KEYS),
  title: z.string(),
  /** `pdf` downloads, `image` opens in the browser. */
  kind: z.enum(['pdf', 'image']),
  uploadedBy: userRef.nullable(),
  uploadedAt: z.iso.datetime({ offset: true }),
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
  archivedBy: userRef.nullable(),
});
export type Document = z.infer<typeof documentSchema>;

export const documentListSchema = z.object({
  items: z.array(documentSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  /** What the caller may do with this list's documents. */
  can: z.object({ create: z.boolean(), edit: z.boolean() }),
});
export type DocumentList = z.infer<typeof documentListSchema>;
