import { ConflictException, Injectable, NotFoundException, UnsupportedMediaTypeException } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import { MAX_LICENCE_PAGES, NID_COPY_TYPES, TRADE_LICENCE_TYPE, type LicencePages, type NidCopies, type NidSide } from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate, todayDate } from '../common/dates.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beyondPermissions } from '../property/tree.service.js';
import { documentContentType } from '../storage/document.js';
import { PrivateFilesService } from '../storage/private-files.service.js';
import { hasLicenceRoom, isPdf, nidCopiesOf, toIdCopy } from './id-copies.policy.js';
import { auditOf, canOnParty, organisationNotFound, PartiesService, personNotFound } from './parties.service.js';

type Party = { kind: 'person' | 'organisation'; id: string };
type StoredFile = { data: Buffer; contentType: string; fileName: string };

const NID_TYPES = Object.values(NID_COPY_TYPES);
const copySelect = { id: true, doc_type: true, file_url: true, uploaded_at: true } satisfies Prisma.documentsSelect;

const copyMissing = () => new NotFoundException({ code: 'id_copy_not_found', message: 'That copy is not on file' });
const photoOnly = () => new UnsupportedMediaTypeException({ code: 'unsupported_image', message: 'Upload a photo (JPEG, PNG or WebP)' });
const tooManyPages = () =>
  new ConflictException({ code: 'too_many_licence_pages', message: `At most ${MAX_LICENCE_PAGES} trade licence pages` });

/**
 * Copies of ID papers on the member pages: the front and back of a person's NID (photos) and
 * the pages of an organisation's trade licence (photos or PDFs). Private files with a
 * `documents` row each; only callers who may edit the person or organisation see or change
 * them (`members` grant in their area). Nothing is deleted: a replaced or removed copy is archived.
 */
@Injectable()
export class IdCopiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly parties: PartiesService,
    private readonly files: PrivateFilesService,
  ) {}

  async nidCopies(actor: Actor, personId: string): Promise<NidCopies> {
    const party: Party = { kind: 'person', id: personId };
    await this.editable(actor, party);
    return nidCopiesOf(await this.current(actor, party, NID_TYPES));
  }

  /** Stores a new copy of one side and archives the one it replaces. 415 `unsupported_image` for anything but a photo. */
  async setNidSide(actor: Actor, personId: string, side: NidSide, upload: Buffer): Promise<NidCopies> {
    const party: Party = { kind: 'person', id: personId };
    await this.editable(actor, party);
    if (isPdf(upload)) throw photoOnly();
    await this.store(actor, party, NID_COPY_TYPES[side], upload, async (tx) => {
      const replaced = await this.archiveWhere(actor, tx, { ...this.of(actor, party), doc_type: NID_COPY_TYPES[side] });
      return { action: 'nid_copy_set', after: { side, replaced: replaced > 0 } };
    });
    return this.nidCopies(actor, personId);
  }

  /** 404 `id_copy_not_found` when that side has no copy. */
  async removeNidSide(actor: Actor, personId: string, side: NidSide): Promise<NidCopies> {
    const party: Party = { kind: 'person', id: personId };
    await this.editable(actor, party);
    await this.prisma.$transaction(async (tx) => {
      const archived = await this.archiveWhere(actor, tx, { ...this.of(actor, party), doc_type: NID_COPY_TYPES[side] });
      if (archived === 0) throw copyMissing();
      await this.audit.record({ ...auditOf(actor, 'person', 'nid_copy_remove', personId), after: { side } }, tx);
    });
    return this.nidCopies(actor, personId);
  }

  async licencePages(actor: Actor, organisationId: string): Promise<LicencePages> {
    const party: Party = { kind: 'organisation', id: organisationId };
    await this.editable(actor, party);
    return { items: (await this.current(actor, party, [TRADE_LICENCE_TYPE])).map(toIdCopy) };
  }

  /** 415 `unsupported_document`; 409 `too_many_licence_pages` past `MAX_LICENCE_PAGES`. */
  async addLicencePage(actor: Actor, organisationId: string, upload: Buffer): Promise<LicencePages> {
    const party: Party = { kind: 'organisation', id: organisationId };
    await this.editable(actor, party);
    await this.store(actor, party, TRADE_LICENCE_TYPE, upload, async (tx) => {
      const count = await tx.documents.count({ where: { ...this.of(actor, party), doc_type: TRADE_LICENCE_TYPE } });
      if (!hasLicenceRoom(count)) throw tooManyPages();
      return { action: 'licence_page_add', after: { page: count + 1 } };
    });
    return this.licencePages(actor, organisationId);
  }

  /** 404 `id_copy_not_found` when the page isn't one of the organisation's current pages. */
  async removeLicencePage(actor: Actor, organisationId: string, documentId: string): Promise<LicencePages> {
    const party: Party = { kind: 'organisation', id: organisationId };
    await this.editable(actor, party);
    await this.prisma.$transaction(async (tx) => {
      const archived = await this.archiveWhere(actor, tx, { ...this.of(actor, party), id: documentId, doc_type: TRADE_LICENCE_TYPE });
      if (archived === 0) throw copyMissing();
      await this.audit.record({ ...auditOf(actor, 'organisation', 'licence_page_remove', organisationId), after: { documentId } }, tx);
    });
    return this.licencePages(actor, organisationId);
  }

  /** The bytes of a current copy (404 `id_copy_not_found` otherwise); each read is audited. */
  async file(actor: Actor, party: Party, documentId: string): Promise<StoredFile> {
    await this.editable(actor, party);
    const types = party.kind === 'person' ? NID_TYPES : [TRADE_LICENCE_TYPE];
    const row = await this.prisma.documents.findFirst({
      where: { ...this.of(actor, party), id: documentId, doc_type: { in: types } },
      select: { file_url: true, file_name: true, doc_type: true },
    });
    if (!row) throw copyMissing();
    const data = await this.files.read(actor.societyId, row.file_url);
    await this.audit.recordQuietly({ ...auditOf(actor, party.kind, 'view_id_copy', party.id), after: { documentId, docType: row.doc_type } });
    return { data, contentType: documentContentType(row.file_url), fileName: row.file_name };
  }

  /**
   * Saves the file, then in one transaction (one upload at a time per party, the same lock as
   * the documents library) runs `before`, adds the row and writes the audit entry. The file is
   * removed again when the transaction fails.
   */
  private async store(
    actor: Actor,
    party: Party,
    docType: string,
    upload: Buffer,
    before: (tx: Prisma.TransactionClient) => Promise<{ action: string; after: Record<string, unknown> }>,
  ): Promise<void> {
    const stored = await this.files.saveDocument(actor.societyId, 'documents', upload);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`documents:${party.id}`}, 0))`;
        const { action, after } = await before(tx);
        const made = await tx.documents.create({
          data: {
            society_id: actor.societyId,
            entity_type: party.kind,
            entity_id: party.id,
            doc_type: docType,
            file_url: stored.key,
            file_name: `${docType.replace('_', '-')}-${isoDate(todayDate())}.${stored.isImage ? 'webp' : 'pdf'}`,
            visibility: 'office',
            uploaded_by: actor.userId,
          },
          select: { id: true },
        });
        await this.audit.record({ ...auditOf(actor, party.kind, action, party.id), after: { ...after, documentId: made.id } }, tx);
      });
    } catch (error) {
      await this.files.removeQuietly(actor.societyId, [stored.key]);
      throw error;
    }
  }

  private async archiveWhere(actor: Actor, tx: Prisma.TransactionClient, where: Prisma.documentsWhereInput): Promise<number> {
    const archived = await tx.documents.updateMany({ where, data: { archived_at: new Date(), archived_by: actor.userId } });
    return archived.count;
  }

  private current(actor: Actor, party: Party, types: string[]) {
    return this.prisma.documents.findMany({
      where: { ...this.of(actor, party), doc_type: { in: types } },
      select: copySelect,
      orderBy: [{ uploaded_at: 'asc' }, { id: 'asc' }],
    });
  }

  /** The party's current (not archived) copies. */
  private of(actor: Actor, party: Party) {
    return { society_id: actor.societyId, entity_type: party.kind, entity_id: party.id, archived_at: null } satisfies Prisma.documentsWhereInput;
  }

  /** 404 when the caller can't see the person or organisation, 403 when they can't edit it. */
  private async editable(actor: Actor, party: Party): Promise<void> {
    const where = { id: party.id, society_id: actor.societyId };
    const found =
      party.kind === 'person'
        ? await this.prisma.persons.findFirst({ where, select: { id: true } })
        : await this.prisma.organisations.findFirst({ where, select: { id: true } });
    const missing = party.kind === 'person' ? personNotFound : organisationNotFound;
    if (!found) throw missing();
    const paths = await this.parties.currentPaths(actor.societyId, party.kind === 'person' ? { personId: party.id } : { organisationId: party.id });
    if (!canOnParty(actor.access, 'view', paths)) throw missing();
    if (!canOnParty(actor.access, 'edit', paths)) throw beyondPermissions();
  }
}
