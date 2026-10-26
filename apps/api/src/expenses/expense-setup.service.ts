import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@s57/db';
import type { ExpenseHead, ExpenseHeadInput, ExpenseOptions, Vendor, VendorInput } from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { toFundOption } from '../finance/funds.service.js';
import { SettingsService } from '../finance/settings.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Tx = Prisma.TransactionClient;

const headNotFound = () => new NotFoundException({ code: 'expense_head_not_found', message: 'Expense head not found' });
const vendorNotFound = () => new NotFoundException({ code: 'vendor_not_found', message: 'Vendor not found' });
const headNameTaken = () => new ConflictException({ code: 'expense_head_name_taken', message: 'Another head has this name' });

/**
 * Expense heads and vendors (`expenses.edit` to change). Simple lists that are archived,
 * never deleted, because old expenses keep pointing at them. Vendor names are stored as typed.
 */
@Injectable()
export class ExpenseSetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  /** Heads and vendors (archived ones marked, last) and the open funds a new expense may use. */
  async options(societyId: string): Promise<ExpenseOptions> {
    const [heads, vendors, funds, separateFunds] = await Promise.all([
      this.heads(societyId),
      this.vendors(societyId),
      this.prisma.funds.findMany({
        where: { society_id: societyId, closed_at: null },
        select: { id: true, name_bn: true, name_en: true, is_default: true },
        orderBy: [{ is_default: 'desc' }, { name_bn: 'asc' }],
      }),
      this.settings.separateFunds(societyId),
    ]);
    return { heads, vendors, funds: funds.filter((fund) => separateFunds || fund.is_default).map(toFundOption), separateFunds };
  }

  // -------------------------------------------------------------------------
  // Heads
  // -------------------------------------------------------------------------

  async createHead(actor: Actor, input: ExpenseHeadInput): Promise<ExpenseHead> {
    const id = await this.write(async (tx) => {
      const row = await tx.expense_heads.create({ data: { society_id: actor.societyId, name_bn: input.nameBn, name_en: input.nameEn }, select: { id: true } });
      await this.audit.record({ ...auditOf(actor, 'expense_head', 'create', row.id), after: input }, tx);
      return row.id;
    });
    return this.head(actor.societyId, id);
  }

  async updateHead(actor: Actor, id: string, input: ExpenseHeadInput): Promise<ExpenseHead> {
    const before = await this.prisma.expense_heads.findFirst({ where: { id, society_id: actor.societyId }, select: { name_bn: true, name_en: true } });
    if (!before) throw headNotFound();
    await this.write(async (tx) => {
      await tx.expense_heads.update({ where: { id }, data: { name_bn: input.nameBn, name_en: input.nameEn } });
      await this.audit.record({ ...auditOf(actor, 'expense_head', 'update', id), before: { nameBn: before.name_bn, nameEn: before.name_en }, after: input }, tx);
    });
    return this.head(actor.societyId, id);
  }

  /** Archived heads can't take new expenses; existing ones and budgets keep them. */
  async archiveHead(actor: Actor, id: string, archived: boolean): Promise<ExpenseHead> {
    const row = await this.prisma.expense_heads.findFirst({ where: { id, society_id: actor.societyId }, select: { archived_at: true } });
    if (!row) throw headNotFound();
    if ((row.archived_at !== null) !== archived) {
      await this.prisma.$transaction(async (tx) => {
        await tx.expense_heads.update({ where: { id }, data: { archived_at: archived ? new Date() : null } });
        await this.audit.record(auditOf(actor, 'expense_head', archived ? 'archive' : 'restore', id), tx);
      });
    }
    return this.head(actor.societyId, id);
  }

  // -------------------------------------------------------------------------
  // Vendors
  // -------------------------------------------------------------------------

  async createVendor(actor: Actor, input: VendorInput): Promise<Vendor> {
    const id = await this.prisma.$transaction(async (tx) => {
      const row = await tx.vendors.create({ data: { society_id: actor.societyId, name: input.name, phone: input.phone, service: input.service }, select: { id: true } });
      await this.audit.record({ ...auditOf(actor, 'vendor', 'create', row.id), after: input }, tx);
      return row.id;
    });
    return this.vendor(actor.societyId, id);
  }

  async updateVendor(actor: Actor, id: string, input: VendorInput): Promise<Vendor> {
    const before = await this.prisma.vendors.findFirst({ where: { id, society_id: actor.societyId }, select: { name: true, phone: true, service: true } });
    if (!before) throw vendorNotFound();
    await this.prisma.$transaction(async (tx) => {
      await tx.vendors.update({ where: { id }, data: { name: input.name, phone: input.phone, service: input.service } });
      await this.audit.record({ ...auditOf(actor, 'vendor', 'update', id), before, after: input }, tx);
    });
    return this.vendor(actor.societyId, id);
  }

  async archiveVendor(actor: Actor, id: string, archived: boolean): Promise<Vendor> {
    const row = await this.prisma.vendors.findFirst({ where: { id, society_id: actor.societyId }, select: { archived_at: true } });
    if (!row) throw vendorNotFound();
    if ((row.archived_at !== null) !== archived) {
      await this.prisma.$transaction(async (tx) => {
        await tx.vendors.update({ where: { id }, data: { archived_at: archived ? new Date() : null } });
        await this.audit.record(auditOf(actor, 'vendor', archived ? 'archive' : 'restore', id), tx);
      });
    }
    return this.vendor(actor.societyId, id);
  }

  // -------------------------------------------------------------------------

  private async heads(societyId: string, id?: string): Promise<ExpenseHead[]> {
    const rows = await this.prisma.expense_heads.findMany({
      where: { society_id: societyId, ...(id ? { id } : {}) },
      select: { id: true, name_bn: true, name_en: true, archived_at: true, _count: { select: { expense_lines: true } } },
      orderBy: [{ archived_at: { sort: 'desc', nulls: 'first' } }, { name_bn: 'asc' }],
    });
    return rows.map((row) => ({ id: row.id, nameBn: row.name_bn, nameEn: row.name_en, archived: row.archived_at !== null, used: row._count.expense_lines }));
  }

  private async vendors(societyId: string, id?: string): Promise<Vendor[]> {
    const rows = await this.prisma.vendors.findMany({
      where: { society_id: societyId, ...(id ? { id } : {}) },
      select: { id: true, name: true, phone: true, service: true, archived_at: true, _count: { select: { expense_lines: true } } },
      orderBy: [{ archived_at: { sort: 'desc', nulls: 'first' } }, { name: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({ id: row.id, name: row.name, phone: row.phone, service: row.service, archived: row.archived_at !== null, used: row._count.expense_lines }));
  }

  private async head(societyId: string, id: string): Promise<ExpenseHead> {
    const [row] = await this.heads(societyId, id);
    if (!row) throw headNotFound();
    return row;
  }

  private async vendor(societyId: string, id: string): Promise<Vendor> {
    const [row] = await this.vendors(societyId, id);
    if (!row) throw vendorNotFound();
    return row;
  }

  private async write<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(work);
    } catch (error) {
      if (isUniqueViolation(error)) throw headNameTaken();
      throw error;
    }
  }
}

const auditOf = (actor: Actor, entityType: string, action: string, entityId: string) => ({
  societyId: actor.societyId,
  userId: actor.userId,
  action,
  entityType,
  entityId,
  ip: actor.ip,
});
