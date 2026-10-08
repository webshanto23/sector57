import { Injectable, NotFoundException } from '@nestjs/common';
import type { SitePage } from '@s57/shared';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class SitePagesService {
  constructor(private readonly prisma: PrismaService) {}

  /** A published page of this society; drafts and other societies' pages read as missing. */
  async getPublished(societyId: string, slug: string): Promise<SitePage> {
    const row = await this.prisma.site_pages.findFirst({
      where: { society_id: societyId, slug, is_published: true },
      select: { slug: true, title_bn: true, title_en: true, content: true, updated_at: true },
    });
    if (!row) throw new NotFoundException({ code: 'page_not_found', message: 'Page not found' });

    const content = row.content;
    return {
      slug: row.slug,
      titleBn: row.title_bn,
      titleEn: row.title_en,
      content: content !== null && typeof content === 'object' && !Array.isArray(content) ? content : {},
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
