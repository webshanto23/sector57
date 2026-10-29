import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import {
  digitVariants,
  DOCUMENT_ENTITIES,
  DOCUMENT_TYPE_KEYS,
  ID_COPY_TYPES,
  isDocumentType,
  MAX_RECORD_DOCUMENTS,
  type Document,
  type DocumentCreateInput,
  type DocumentEntity,
  type DocumentList,
  type DocumentListQuery,
  type DocumentType,
  type DocumentUpdateInput,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import { assetNotFound, AssetsService } from '../facilities/assets.service.js';
import { canOnParty, PartiesService, personNotFound } from '../members/parties.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { locationNotFound, TreeService } from '../property/tree.service.js';
import { documentContentType } from '../storage/document.js';
import { staffNotFound, StaffService } from '../staff/staff.service.js';
import { PrivateFilesService } from '../storage/private-files.service.js';

const notFound = () => new NotFoundException({ code: 'document_not_found', message: 'Document not found' });
const beyond = () => new ForbiddenException({ code: 'beyond_your_permissions', message: 'You may not change the documents here' });
const invalidType = () => new BadRequestException({ code: 'invalid_doc_type', message: 'That kind of document does not belong here' });

const userName = { select: { id: true, phone: true, persons: { select: { full_name: true } } } } as const;
type UserName = { id: string; phone: string; persons: { full_name: string } | null };
const userRef = (user: UserName | null) => (user ? { id: user.id, name: user.persons?.full_name ?? user.phone } : null);

const documentSelect = {
  id: true,
  entity_type: true,
  entity_id: true,
  doc_type: true,
  title: true,
  file_url: true,
  file_name: true,
  uploaded_at: true,
  archived_at: true,
  users: userName,
  archiver: userName,
} satisfies Prisma.documentsSelect;
type Row = Prisma.documentsGetPayload<{ select: typeof documentSelect }>;

/** NID and trade licence copies have their own routes on the person and organisation (`IdCopiesService`). */
const notIdCopy = { doc_type: { notIn: [...ID_COPY_TYPES] } } satisfies Prisma.documentsWhereInput;

/** What the caller may do with the documents of one record. */
type Rights = { view: boolean; create: boolean; edit: boolean; /** NID copies: only for those who may edit the person. */ nid: boolean };

const toEntity = (value: string): DocumentEntity => ((DOCUMENT_ENTITIES as readonly string[]).includes(value) ? (value as DocumentEntity) : 'society');
const toType = (value: string): DocumentType => ((DOCUMENT_TYPE_KEYS as readonly string[]).includes(value) ? (value as DocumentType) : 'other');

/**
 * The documents library (`documents` permission, society-wide): the society's papers, and
 * documents kept with a person or a place. A person's documents also need the right to see
 * (or, to change them, edit) that person where they live; a place's, the right on that place.
 * A staff member's papers follow the `staff` grant at their post, an asset's the `facilities`
 * grant where it is kept. An NID copy is shown only
 * to those who may edit the person. Files are private (checked and stored by
 * `PrivateFilesService`), read only through `GET /documents/:id/file`, and every read is
 * audited. Nothing is deleted: documents are archived.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly files: PrivateFilesService,
    private readonly parties: PartiesService,
    private readonly tree: TreeService,
    private readonly staff: StaffService,
    private readonly assets: AssetsService,
  ) {}

  async list(actor: Actor, query: DocumentListQuery): Promise<DocumentList> {
    const { page, pageSize } = query;
    const entityId = this.entityIdOf(actor, query.entityType, query.entityId);
    const rights = await this.rights(actor, query.entityType, entityId);
    if (!rights.view) throw this.missing(query.entityType);
    const filters: Prisma.documentsWhereInput[] = [
      { society_id: actor.societyId, entity_type: query.entityType, entity_id: entityId },
      { archived_at: query.archived ? { not: null } : null },
      notIdCopy,
    ];
    if (query.docType) filters.push({ doc_type: query.docType });
    if (!rights.nid) filters.push({ doc_type: { not: 'nid' } });
    if (query.q) filters.push({ OR: digitVariants(query.q).map((term) => ({ title: { contains: term, mode: 'insensitive' as const } })) });
    const where: Prisma.documentsWhereInput = { AND: filters };
    const [rows, total] = await Promise.all([
      this.prisma.documents.findMany({ where, select: documentSelect, orderBy: [{ uploaded_at: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.documents.count({ where }),
    ]);
    return { items: rows.map(toDocument), total, page, pageSize, can: { create: rights.create, edit: rights.edit } };
  }

  async get(actor: Actor, id: string): Promise<Document> {
    const { row } = await this.visible(actor, id);
    return toDocument(row);
  }

  /** The file's bytes; each read is audited. */
  async file(actor: Actor, id: string): Promise<{ data: Buffer; contentType: string; fileName: string }> {
    const { row } = await this.visible(actor, id);
    const data = await this.files.read(actor.societyId, row.file_url);
    await this.audit.recordQuietly({ ...this.auditOf(actor, 'view_file', id), after: { docType: row.doc_type, entityType: row.entity_type } });
    return { data, contentType: documentContentType(row.file_url), fileName: row.file_name };
  }

  /** 415 `unsupported_document`; 409 `too_many_documents` (a person or place keeps at most `MAX_RECORD_DOCUMENTS`). */
  async create(actor: Actor, input: DocumentCreateInput, upload: Buffer): Promise<Document> {
    const entityId = this.entityIdOf(actor, input.entityType, input.entityId);
    const rights = await this.rights(actor, input.entityType, entityId);
    if (!rights.view) throw this.missing(input.entityType);
    if (!rights.create) throw beyond();
    const stored = await this.files.saveDocument(actor.societyId, 'documents', upload);
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        if (input.entityType !== 'society') {
          // One upload at a time per record, so the limit holds.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`documents:${entityId}`}, 0))`;
          const count = await tx.documents.count({ where: { society_id: actor.societyId, entity_type: input.entityType, entity_id: entityId, archived_at: null, ...notIdCopy } });
          if (count >= MAX_RECORD_DOCUMENTS) throw new ConflictException({ code: 'too_many_documents', message: `At most ${MAX_RECORD_DOCUMENTS} documents here` });
        }
        const made = await tx.documents.create({
          data: {
            society_id: actor.societyId,
            entity_type: input.entityType,
            entity_id: entityId,
            doc_type: input.docType,
            title: input.title,
            file_url: stored.key,
            file_name: `${input.docType}-${isoDate(todayDate())}.${stored.isImage ? 'webp' : 'pdf'}`,
            visibility: 'office',
            uploaded_by: actor.userId,
          },
          select: { id: true },
        });
        await this.audit.record(
          { ...this.auditOf(actor, 'create', made.id), after: { entityType: input.entityType, entityId, docType: input.docType, title: input.title } },
          tx,
        );
        return made.id;
      });
    } catch (error) {
      await this.files.removeQuietly(actor.societyId, [stored.key]);
      throw error;
    }
    return this.get(actor, id);
  }

  /** 400 `invalid_doc_type` for a type that doesn't fit what the document belongs to. */
  async update(actor: Actor, id: string, input: DocumentUpdateInput): Promise<Document> {
    const { row, rights } = await this.visible(actor, id);
    if (!rights.edit) throw beyond();
    if (input.docType && !isDocumentType(toEntity(row.entity_type), input.docType)) throw invalidType();
    await this.prisma.$transaction(async (tx) => {
      await tx.documents.update({ where: { id }, data: { title: input.title, doc_type: input.docType } });
      await this.audit.record(
        { ...this.auditOf(actor, 'update', id), before: { title: row.title, docType: row.doc_type }, after: { title: input.title ?? row.title, docType: input.docType ?? row.doc_type } },
        tx,
      );
    });
    return this.get(actor, id);
  }

  /** Archive (`archived: true`) or bring back. 409 `document_archived` / `document_not_archived` when it already is (not). */
  async archive(actor: Actor, id: string, archived: boolean): Promise<Document> {
    const { rights } = await this.visible(actor, id);
    if (!rights.edit) throw beyond();
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.documents.updateMany({
        where: { id, archived_at: archived ? null : { not: null } },
        data: archived ? { archived_at: new Date(), archived_by: actor.userId } : { archived_at: null, archived_by: null },
      });
      if (changed.count === 0) {
        throw archived
          ? new ConflictException({ code: 'document_archived', message: 'This document is already archived' })
          : new ConflictException({ code: 'document_not_archived', message: 'This document is not archived' });
      }
      await this.audit.record({ ...this.auditOf(actor, archived ? 'archive' : 'restore', id) }, tx);
    });
    return this.get(actor, id);
  }

  /** A library document the caller may see (404 otherwise, also for form files, vouchers, ID copies and hidden NID copies). */
  private async visible(actor: Actor, id: string): Promise<{ row: Row; rights: Rights }> {
    const row = await this.prisma.documents.findFirst({
      where: { id, society_id: actor.societyId, entity_type: { in: [...DOCUMENT_ENTITIES] }, ...notIdCopy },
      select: documentSelect,
    });
    if (!row) throw notFound();
    const rights = await this.rights(actor, toEntity(row.entity_type), row.entity_id);
    if (!rights.view || (row.doc_type === 'nid' && !rights.nid)) throw notFound();
    return { row, rights };
  }

  /** The society's own documents hang on the society's id. */
  private entityIdOf(actor: Actor, entityType: DocumentEntity, entityId: string | undefined): string {
    if (entityType === 'society') return actor.societyId;
    if (!entityId) throw new BadRequestException({ code: 'invalid_entity', message: 'Say whose documents these are' });
    return entityId;
  }

  private missing(entityType: DocumentEntity) {
    if (entityType === 'person') return personNotFound();
    if (entityType === 'location') return locationNotFound();
    if (entityType === 'asset') return assetNotFound();
    return entityType === 'staff' ? staffNotFound() : notFound();
  }

  private async rights(actor: Actor, entityType: DocumentEntity, entityId: string): Promise<Rights> {
    const { access } = actor;
    const doc = { view: access.can('view', 'documents'), create: access.can('create', 'documents'), edit: access.can('edit', 'documents') };
    if (entityType === 'society') return { ...doc, nid: false };

    if (entityType === 'person') {
      const person = await this.prisma.persons.findFirst({ where: { id: entityId, society_id: actor.societyId }, select: { id: true } });
      if (!person) return { view: false, create: false, edit: false, nid: false };
      const paths = await this.parties.currentPaths(actor.societyId, { personId: entityId });
      const sees = canOnParty(access, 'view', paths);
      const edits = canOnParty(access, 'edit', paths);
      return { view: doc.view && sees, create: doc.create && edits, edit: doc.edit && edits, nid: edits };
    }

    if (entityType === 'staff') {
      const rights = await this.staff.paperRights(actor, entityId);
      if (!rights) return { view: false, create: false, edit: false, nid: false };
      return { view: doc.view && rights.view, create: doc.create && rights.edit, edit: doc.edit && rights.edit, nid: rights.nid };
    }

    if (entityType === 'asset') {
      const rights = await this.assets.paperRights(actor, entityId);
      if (!rights) return { view: false, create: false, edit: false, nid: false };
      return { view: doc.view && rights.view, create: doc.create && rights.edit, edit: doc.edit && rights.edit, nid: false };
    }

    const place = await this.tree.find(actor.societyId, entityId);
    if (!place) return { view: false, create: false, edit: false, nid: false };
    const module = place.isUnit ? 'units' : 'locations';
    const at = { path: place.path };
    const edits = access.can('edit', module, at);
    return { view: doc.view && access.can('view', module, at), create: doc.create && edits, edit: doc.edit && edits, nid: false };
  }

  private auditOf(actor: Actor, action: string, id: string) {
    return { societyId: actor.societyId, userId: actor.userId, action, entityType: 'document', entityId: id, ip: actor.ip };
  }
}

function toDocument(row: Row): Document {
  return {
    id: row.id,
    entityType: toEntity(row.entity_type),
    entityId: row.entity_id,
    docType: toType(row.doc_type),
    title: row.title ?? row.file_name,
    kind: row.file_url.endsWith('.pdf') ? 'pdf' : 'image',
    uploadedBy: userRef(row.users),
    uploadedAt: row.uploaded_at.toISOString(),
    archivedAt: row.archived_at?.toISOString() ?? null,
    archivedBy: userRef(row.archiver),
  };
}
