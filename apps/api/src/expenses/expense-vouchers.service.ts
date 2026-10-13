import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ExpenseDetail } from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beyondPermissions } from '../property/tree.service.js';
import { documentContentType } from '../storage/document.js';
import { PrivateFilesService } from '../storage/private-files.service.js';
import { actionsFor, auditOf, conflict, expenseNotFound, MAX_VOUCHERS, VOUCHER_DOC, VOUCHER_ENTITY } from './expense-rows.js';
import { ExpensesService } from './expenses.service.js';

/** Voucher files on an expense: private, served only through the API. */
@Injectable()
export class ExpenseVouchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly files: PrivateFilesService,
    private readonly expenses: ExpensesService,
  ) {}

  /** Attaches a photo or PDF (checked and re-encoded by `processDocument`). */
  async addVoucher(actor: Actor, id: string, upload: Buffer): Promise<ExpenseDetail> {
    const row = await this.prisma.expenses.findFirst({ where: { id, society_id: actor.societyId }, select: { status: true, requested_by: true } });
    if (!row) throw expenseNotFound();
    if (!actionsFor(actor, row).upload) throw new ForbiddenException({ code: 'beyond_your_permissions', message: 'You may not add vouchers to this expense' });
    const stored = await this.files.saveDocument(actor.societyId, 'expenses', upload);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM expenses WHERE id = ${id}::uuid FOR UPDATE`;
        const count = await tx.documents.count({ where: { society_id: actor.societyId, entity_type: VOUCHER_ENTITY, entity_id: id } });
        if (count >= MAX_VOUCHERS) throw conflict('too_many_vouchers', `At most ${MAX_VOUCHERS} files per expense`);
        const doc = await tx.documents.create({
          data: {
            society_id: actor.societyId,
            entity_type: VOUCHER_ENTITY,
            entity_id: id,
            doc_type: VOUCHER_DOC,
            file_url: stored.key,
            file_name: `voucher-${count + 1}.${stored.isImage ? 'webp' : 'pdf'}`,
            visibility: 'office',
            uploaded_by: actor.userId,
          },
          select: { id: true },
        });
        await this.audit.record({ ...auditOf(actor, 'add_voucher', id), after: { documentId: doc.id } }, tx);
      });
    } catch (error) {
      await this.files.removeQuietly(actor.societyId, [stored.key]);
      throw error;
    }
    return this.expenses.get(actor, id);
  }

  /** Removes a wrong file, only before the expense is paid. The file goes once the row is gone. */
  async removeVoucher(actor: Actor, id: string, documentId: string): Promise<ExpenseDetail> {
    const key = await this.prisma.$transaction(async (tx) => {
      const row = await this.expenses.locked(tx, actor, id);
      if (row.status !== 'pending' && row.status !== 'approved') throw conflict('expense_voucher_locked', 'Vouchers of a paid expense stay');
      if (!actionsFor(actor, row).upload) throw beyondPermissions();
      const doc = await tx.documents.findFirst({
        where: { id: documentId, society_id: actor.societyId, entity_type: VOUCHER_ENTITY, entity_id: id },
        select: { file_url: true },
      });
      if (!doc) throw new NotFoundException({ code: 'file_not_found', message: 'File not found' });
      await tx.documents.delete({ where: { id: documentId } });
      await this.audit.record({ ...auditOf(actor, 'remove_voucher', id), before: { documentId } }, tx);
      return doc.file_url;
    });
    await this.files.removeQuietly(actor.societyId, [key]);
    return this.expenses.get(actor, id);
  }

  async voucher(actor: Actor, id: string, documentId: string): Promise<{ data: Buffer; contentType: string; fileName: string }> {
    const doc = await this.prisma.documents.findFirst({
      where: { id: documentId, society_id: actor.societyId, entity_type: VOUCHER_ENTITY, entity_id: id },
      select: { file_url: true, file_name: true },
    });
    if (!doc) throw new NotFoundException({ code: 'file_not_found', message: 'File not found' });
    const data = await this.files.read(actor.societyId, doc.file_url);
    return { data, contentType: documentContentType(doc.file_url), fileName: doc.file_name };
  }
}
