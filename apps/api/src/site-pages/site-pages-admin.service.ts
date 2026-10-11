import { Injectable } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import { cleanDeep, pageContentSchemas, type EditablePage, type SitePageAdmin } from '@s57/shared';
import { ZodValidationException } from 'nestjs-zod';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Titles a page gets when it is first saved from the dashboard (the seed creates `home` and `site`). */
const DEFAULT_TITLES: Record<EditablePage, { bn: string; en: string }> = {
  home: { bn: 'প্রথম পাতা', en: 'Home' },
  site: { bn: 'সাইটের তথ্য', en: 'Site details' },
  developments: { bn: 'উন্নয়ন প্রকল্প', en: 'Development projects' },
};

const asRecord = (value: Prisma.JsonValue): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;

/** The editable JSON pages of the public website (home, site details, developments). */
@Injectable()
export class SitePagesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(societyId: string, slug: EditablePage): Promise<SitePageAdmin> {
    const row = await this.prisma.site_pages.findUnique({
      where: { society_id_slug: { society_id: societyId, slug } },
      select: { content: true, updated_at: true },
    });
    return { slug, content: row ? asRecord(row.content) : null, updatedAt: row?.updated_at.toISOString() ?? null };
  }

  /**
   * Replaces the page's content after checking it against the slug's schema (400
   * `validation_failed` with the failing paths otherwise). Text is NFC-normalised and
   * trimmed first. Saving publishes the page.
   */
  async save(actor: Actor, slug: EditablePage, raw: Record<string, unknown>): Promise<SitePageAdmin> {
    const parsed = z.object({ content: pageContentSchemas[slug] }).safeParse({ content: cleanDeep(raw) });
    if (!parsed.success) throw new ZodValidationException(parsed.error);
    const content = parsed.data.content as Prisma.InputJsonObject;

    const before = await this.get(actor.societyId, slug);
    await this.prisma.$transaction(async (tx) => {
      const page = await tx.site_pages.upsert({
        where: { society_id_slug: { society_id: actor.societyId, slug } },
        update: { content, is_published: true, updated_at: new Date() },
        create: {
          society_id: actor.societyId,
          slug,
          title_bn: DEFAULT_TITLES[slug].bn,
          title_en: DEFAULT_TITLES[slug].en,
          content,
          is_published: true,
        },
        select: { id: true },
      });
      await this.audit.record(
        {
          societyId: actor.societyId,
          userId: actor.userId,
          action: 'update',
          entityType: 'site_page',
          entityId: page.id,
          before: before.content ? ({ slug, content: before.content } as Prisma.InputJsonObject) : undefined,
          after: { slug, content },
          ip: actor.ip,
        },
        tx,
      );
    });
    return this.get(actor.societyId, slug);
  }
}
