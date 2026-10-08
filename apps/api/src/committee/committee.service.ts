import { Inject, Injectable } from '@nestjs/common';
import type { Committee } from '@s57/shared';
import { isoDate, todayDate } from '../common/dates.js';
import { mediaUrl } from '../common/media.js';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CommitteeService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Members whose term covers today, in display order. Only name, position and photo leave this method. */
  async current(societyId: string): Promise<Committee> {
    const today = todayDate();
    const rows = await this.prisma.committee_members.findMany({
      where: {
        society_id: societyId,
        term_start: { lte: today },
        OR: [{ term_end: null }, { term_end: { gte: today } }],
        // The foreign key does not stop linking another society's person; never show one.
        persons: { society_id: societyId },
      },
      select: {
        id: true,
        position: true,
        term_start: true,
        term_end: true,
        persons: { select: { full_name: true, full_name_en: true, photo_url: true } },
      },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });

    const starts = rows.map((row) => isoDate(row.term_start)).sort();
    const ends = rows.map((row) => (row.term_end ? isoDate(row.term_end) : null));
    return {
      termStart: starts[0] ?? null,
      termEnd: ends.length > 0 && ends.every((end) => end !== null) ? (ends as string[]).sort().at(-1)! : null,
      members: rows.map((row) => ({
        id: row.id,
        nameBn: row.persons.full_name,
        nameEn: row.persons.full_name_en,
        position: row.position,
        photoUrl: mediaUrl(row.persons.photo_url, this.env.MEDIA_BASE_URL),
      })),
    };
  }
}
