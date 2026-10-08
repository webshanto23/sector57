import { Injectable, NotFoundException } from '@nestjs/common';
import { toNoticeCategory, type Notice, type NoticeList, type NoticeListQuery } from '@s57/shared';
import { PrismaService } from '../prisma/prisma.service.js';

type NoticeRow = {
  id: string;
  title_bn: string;
  title_en: string | null;
  body_bn: string;
  body_en: string | null;
  category: string | null;
  publish_at: Date;
};

const select = {
  id: true,
  title_bn: true,
  title_en: true,
  body_bn: true,
  body_en: true,
  category: true,
  publish_at: true,
} as const;

function toNotice(row: NoticeRow): Notice {
  return {
    id: row.id,
    titleBn: row.title_bn,
    titleEn: row.title_en,
    bodyBn: row.body_bn,
    bodyEn: row.body_en,
    category: toNoticeCategory(row.category),
    publishAt: row.publish_at.toISOString(),
  };
}

@Injectable()
export class NoticesService {
  constructor(private readonly prisma: PrismaService) {}

  /** What the public website may show: this society's public notices whose publish time has passed. */
  private publicWhere(societyId: string) {
    return { society_id: societyId, is_public: true, publish_at: { lte: new Date() } };
  }

  async listPublic(societyId: string, query: NoticeListQuery): Promise<NoticeList> {
    const { page, pageSize, category } = query;
    const where = {
      ...this.publicWhere(societyId),
      // `general` also covers notices saved without a category.
      ...(category === 'general'
        ? { OR: [{ category: 'general' }, { category: null }] }
        : category
          ? { category }
          : {}),
    };

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

    return { items: rows.map(toNotice), total, page, pageSize };
  }

  async getPublic(societyId: string, id: string): Promise<Notice> {
    const row = await this.prisma.notices.findFirst({ where: { id, ...this.publicWhere(societyId) }, select });
    // Same answer for "missing", "other society", "private" and "not yet published".
    if (!row) throw new NotFoundException({ code: 'notice_not_found', message: 'Notice not found' });
    return toNotice(row);
  }
}
