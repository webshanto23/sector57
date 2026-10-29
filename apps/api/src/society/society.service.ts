import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { brandingOf, SETTING_KEYS, type Branding } from '@s57/shared';
import type { Request } from 'express';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type SocietyContext = {
  id: string;
  slug: string;
  nameBn: string;
  nameEn: string | null;
  fiscalYearStartMonth: number;
  requireIdNumbers: boolean;
} & Branding;

type CacheEntry = { value: SocietyContext | null; active: boolean; expires: number };

const CACHE_MS = 60_000;

@Injectable()
export class SocietyService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Which society a request belongs to. Single-society deploys use the default
   * slug; resolving by host name for other societies plugs in here later.
   */
  slugFor(_request: Request): string {
    return this.env.DEFAULT_SOCIETY_SLUG;
  }

  /** Drops the cached row after the society itself changed (fiscal year start, name, branding, ID rule). */
  forget(slug: string): void {
    this.cache.delete(slug);
  }

  /** Active society for the slug, or 404 / 403. Cached briefly; the row rarely changes. */
  async resolve(slug: string): Promise<SocietyContext> {
    const now = Date.now();
    let entry = this.cache.get(slug);
    if (!entry || entry.expires <= now) {
      const row = await this.prisma.societies.findUnique({
        where: { slug },
        include: {
          society_settings: { where: { key: { in: [SETTING_KEYS.branding, SETTING_KEYS.requireIdNumbers] } }, select: { key: true, value: true } },
        },
      });
      entry = {
        expires: now + CACHE_MS,
        active: row?.status === 'active',
        value: row && {
          id: row.id,
          slug: row.slug,
          nameBn: row.name_bn,
          nameEn: row.name_en,
          fiscalYearStartMonth: row.fiscal_year_start_month,
          requireIdNumbers: row.society_settings.find((s) => s.key === SETTING_KEYS.requireIdNumbers)?.value === true,
          ...brandingOf(row.society_settings.find((s) => s.key === SETTING_KEYS.branding)?.value, row.name_bn),
        },
      };
      this.cache.set(slug, entry);
    }

    if (!entry.value) throw new NotFoundException({ code: 'society_not_found', message: 'Society not found' });
    if (!entry.active) {
      throw new ForbiddenException({ code: 'society_suspended', message: 'This society is suspended' });
    }
    return entry.value;
  }
}
