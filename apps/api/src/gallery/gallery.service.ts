import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import type { Album, AlbumList, AlbumSummary, Pagination } from '@s57/shared';
import { isoDate } from '../common/dates.js';
import { mediaUrl, thumbKey } from '../common/media.js';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

const summarySelect = {
  id: true,
  title_bn: true,
  title_en: true,
  event_date: true,
  _count: { select: { gallery_photos: true } },
  // The first photo is the cover.
  gallery_photos: { select: { file_url: true }, orderBy: [{ sort_order: 'asc' }, { id: 'asc' }], take: 1 },
} satisfies Prisma.gallery_albumsSelect;

type SummaryRow = {
  id: string;
  title_bn: string;
  title_en: string | null;
  event_date: Date | null;
  _count: { gallery_photos: number };
  gallery_photos: { file_url: string }[];
};

@Injectable()
export class GalleryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private toSummary(row: SummaryRow): AlbumSummary {
    return {
      id: row.id,
      titleBn: row.title_bn,
      titleEn: row.title_en,
      eventDate: row.event_date ? isoDate(row.event_date) : null,
      photoCount: row._count.gallery_photos,
      // The cover is shown small: its thumbnail when it has one.
      coverUrl: mediaUrl(thumbKey(row.gallery_photos[0]?.file_url), this.env.MEDIA_BASE_URL),
    };
  }

  /** Published albums of the society, newest event first (undated last). Hidden ones are left out of the list only: the home slider still reads them by id. */
  async listPublic(societyId: string, { page, pageSize }: Pagination): Promise<AlbumList> {
    const where = { society_id: societyId, is_published: true, hide_from_gallery: false };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.gallery_albums.count({ where }),
      this.prisma.gallery_albums.findMany({
        where,
        select: summarySelect,
        orderBy: [{ event_date: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: rows.map((row) => this.toSummary(row)), total, page, pageSize };
  }

  /** One published album with its photos; drafts and other societies' albums read as missing. */
  async getPublic(societyId: string, id: string): Promise<Album> {
    const row = await this.prisma.gallery_albums.findFirst({
      where: { id, society_id: societyId, is_published: true },
      select: {
        ...summarySelect,
        gallery_photos: {
          select: { id: true, file_url: true, caption_bn: true, caption_en: true },
          orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!row) throw new NotFoundException({ code: 'album_not_found', message: 'Album not found' });

    return {
      ...this.toSummary(row),
      photos: row.gallery_photos.map((photo) => ({
        id: photo.id,
        url: mediaUrl(photo.file_url, this.env.MEDIA_BASE_URL),
        captionBn: photo.caption_bn,
        captionEn: photo.caption_en,
      })),
    };
  }
}
