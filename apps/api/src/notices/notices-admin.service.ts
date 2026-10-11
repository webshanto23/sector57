import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import {
  noticeStatus,
  toNoticeCategory,
  type NoticeAdmin,
  type NoticeAdminList,
  type NoticeAdminListQuery,
  type NoticeInput,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

const select = {
  id: true,
  title_bn: true,
  title_en: true,
  body_bn: true,
  body_en: true,
  category: true,
  is_public: true,
  publish_at: true,
  users: { select: { phone: true, persons: { select: { full_name: true } } } },
} satisfies Prisma.noticesSelect;

type NoticeRow = Prisma.noticesGetPayload<{ select: typeof select }>;

function toNotice(row: NoticeRow, now: Date): NoticeAdmin {
  const notice = {
    id: row.id,
    titleBn: row.title_bn,
    titleEn: row.title_en,
    bodyBn: row.body_bn,
    bodyEn: row.body_en,
    category: toNoticeCategory(row.category),
    isPublic: row.is_public,
    publishAt: row.publish_at.toISOString(),
    createdByName: row.users ? (row.users.persons?.full_name ?? row.users.phone) : null,
  };
  return { ...notice, status: noticeStatus(notice, now) };
}

/** What an audit row keeps of a notice. */
const snapshot = (n: NoticeInput | NoticeAdmin) => ({
  titleBn: n.titleBn,
  titleEn: n.titleEn,
  bodyBn: n.bodyBn,
  bodyEn: n.bodyEn,
  category: n.category,
  isPublic: n.isPublic,
  publishAt: n.publishAt,
});

const notFound = () => new NotFoundException({ code: 'notice_not_found', message: 'Notice not found' });

/** Notices in the dashboard: every notice of the society, including private and scheduled ones. */
@Injectable()
export class NoticesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(societyId: string, query: NoticeAdminListQuery): Promise<NoticeAdminList> {
    const { page, pageSize, category, status, q } = query;
    const now = new Date();
    const and: Prisma.noticesWhereInput[] = [{ society_id: societyId }];
    // `general` also covers notices saved without a category.
    if (category === 'general') and.push({ OR: [{ category: 'general' }, { category: null }] });
    else if (category) and.push({ category });
    if (status === 'internal') and.push({ is_public: false });
    if (status === 'scheduled') and.push({ is_public: true, publish_at: { gt: now } });
    if (status === 'published') and.push({ is_public: true, publish_at: { lte: now } });
    if (q) {
      and.push({ OR: [{ title_bn: { contains: q, mode: 'insensitive' } }, { title_en: { contains: q, mode: 'insensitive' } }] });
    }
    const where = { AND: and };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.notices.count({ where }),
      this.prisma.notices.findMany({
        where,
        select,
        orderBy: [{ publish_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: rows.map((row) => toNotice(row, now)), total, page, pageSize };
  }

  async get(societyId: string, id: string): Promise<NoticeAdmin> {
    const row = await this.prisma.notices.findFirst({ where: { id, society_id: societyId }, select });
    if (!row) throw notFound();
    return toNotice(row, new Date());
  }

  async create(actor: Actor, input: NoticeInput): Promise<NoticeAdmin> {
    const id = await this.prisma.$transaction(async (tx) => {
      const row = await tx.notices.create({
        data: { ...toData(input), society_id: actor.societyId, created_by: actor.userId },
        select: { id: true },
      });
      await this.audit.record({ ...auditOf(actor, 'create', row.id), after: snapshot(input) }, tx);
      return row.id;
    });
    return this.get(actor.societyId, id);
  }

  async update(actor: Actor, id: string, input: NoticeInput): Promise<NoticeAdmin> {
    const before = await this.get(actor.societyId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.notices.update({ where: { id }, data: toData(input) });
      await this.audit.record({ ...auditOf(actor, 'update', id), before: snapshot(before), after: snapshot(input) }, tx);
    });
    return this.get(actor.societyId, id);
  }

  async remove(actor: Actor, id: string): Promise<void> {
    const before = await this.get(actor.societyId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.notices.delete({ where: { id } });
      await this.audit.record({ ...auditOf(actor, 'delete', id), before: snapshot(before) }, tx);
    });
  }
}

function toData(input: NoticeInput) {
  return {
    title_bn: input.titleBn,
    title_en: input.titleEn,
    body_bn: input.bodyBn,
    body_en: input.bodyEn,
    category: input.category,
    is_public: input.isPublic,
    publish_at: new Date(input.publishAt),
  };
}

const auditOf = (actor: Actor, action: string, entityId: string) => ({
  societyId: actor.societyId,
  userId: actor.userId,
  action,
  entityType: 'notice',
  entityId,
  ip: actor.ip,
});
