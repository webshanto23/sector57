import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import {
  MAX_ALBUM_PHOTOS,
  type AlbumAdmin,
  type AlbumAdminList,
  type AlbumAdminSummary,
  type AlbumInput,
  type Pagination,
  type PhotoAdmin,
  type PhotoCaptionInput,
} from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isoDate } from '../common/dates.js';
import { mediaUrl, thumbKey } from '../common/media.js';
import { ENV, type Env } from '../config/env.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MediaService } from '../storage/media.service.js';

const photoOrder = [{ sort_order: 'asc' }, { id: 'asc' }] satisfies Prisma.gallery_photosOrderByWithRelationInput[];

const summarySelect = {
  id: true,
  title_bn: true,
  title_en: true,
  event_date: true,
  is_published: true,
  hide_from_gallery: true,
  _count: { select: { gallery_photos: true } },
  gallery_photos: { select: { file_url: true }, orderBy: photoOrder, take: 1 },
} satisfies Prisma.gallery_albumsSelect;

type SummaryRow = Prisma.gallery_albumsGetPayload<{ select: typeof summarySelect }>;

const photoSelect = { id: true, file_url: true, caption_bn: true, caption_en: true } satisfies Prisma.gallery_photosSelect;
type PhotoRow = Prisma.gallery_photosGetPayload<{ select: typeof photoSelect }>;

const albumNotFound = () => new NotFoundException({ code: 'album_not_found', message: 'Album not found' });
const photoNotFound = () => new NotFoundException({ code: 'photo_not_found', message: 'Photo not found' });

const snapshot = (album: Pick<AlbumInput, 'titleBn' | 'titleEn' | 'eventDate' | 'isPublished' | 'hideFromGallery'>) => ({
  titleBn: album.titleBn,
  titleEn: album.titleEn,
  eventDate: album.eventDate,
  isPublished: album.isPublished,
  hideFromGallery: album.hideFromGallery,
});

/** Gallery albums and photos in the dashboard. Photos belong to the society through their album. */
@Injectable()
export class GalleryAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private toSummary(row: SummaryRow): AlbumAdminSummary {
    return {
      id: row.id,
      titleBn: row.title_bn,
      titleEn: row.title_en,
      eventDate: row.event_date ? isoDate(row.event_date) : null,
      isPublished: row.is_published,
      hideFromGallery: row.hide_from_gallery,
      photoCount: row._count.gallery_photos,
      coverUrl: mediaUrl(thumbKey(row.gallery_photos[0]?.file_url), this.env.MEDIA_BASE_URL),
    };
  }

  private toPhoto(row: PhotoRow): PhotoAdmin {
    return {
      id: row.id,
      url: mediaUrl(row.file_url, this.env.MEDIA_BASE_URL),
      thumbUrl: mediaUrl(thumbKey(row.file_url), this.env.MEDIA_BASE_URL),
      captionBn: row.caption_bn,
      captionEn: row.caption_en,
    };
  }

  /** Every album, drafts too, newest event first (undated last). */
  async list(societyId: string, { page, pageSize }: Pagination): Promise<AlbumAdminList> {
    const where = { society_id: societyId };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.gallery_albums.count({ where }),
      this.prisma.gallery_albums.findMany({
        where,
        select: summarySelect,
        orderBy: [{ event_date: { sort: 'desc', nulls: 'first' } }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: rows.map((row) => this.toSummary(row)), total, page, pageSize };
  }

  async get(societyId: string, id: string): Promise<AlbumAdmin> {
    const row = await this.prisma.gallery_albums.findFirst({
      where: { id, society_id: societyId },
      select: { ...summarySelect, gallery_photos: { select: photoSelect, orderBy: photoOrder } },
    });
    if (!row) throw albumNotFound();
    return { ...this.toSummary(row), photos: row.gallery_photos.map((photo) => this.toPhoto(photo)) };
  }

  async create(actor: Actor, input: AlbumInput): Promise<AlbumAdmin> {
    const id = await this.prisma.$transaction(async (tx) => {
      const album = await tx.gallery_albums.create({
        data: { society_id: actor.societyId, ...albumData(input) },
        select: { id: true },
      });
      await this.audit.record({ ...auditOf(actor, 'create', 'gallery_album', album.id), after: snapshot(input) }, tx);
      return album.id;
    });
    return this.get(actor.societyId, id);
  }

  async update(actor: Actor, id: string, input: AlbumInput): Promise<AlbumAdmin> {
    const before = await this.get(actor.societyId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.gallery_albums.update({ where: { id }, data: albumData(input) });
      await this.audit.record(
        { ...auditOf(actor, 'update', 'gallery_album', id), before: snapshot(before), after: snapshot(input) },
        tx,
      );
    });
    return this.get(actor.societyId, id);
  }

  /** Deletes the album, its photo rows and then their files. */
  async remove(actor: Actor, id: string): Promise<void> {
    const before = await this.get(actor.societyId, id);
    const files = await this.prisma.$transaction(async (tx) => {
      const photos = await tx.gallery_photos.findMany({ where: { album_id: id }, select: { file_url: true } });
      await tx.gallery_albums.delete({ where: { id } });
      await this.audit.record(
        { ...auditOf(actor, 'delete', 'gallery_album', id), before: { ...snapshot(before), photoCount: photos.length } },
        tx,
      );
      return photos.map((photo) => photo.file_url);
    });
    await this.media.removeQuietly(actor.societyId, files);
  }

  /** Adds one uploaded photo at the end of the album. 409 `album_full` past MAX_ALBUM_PHOTOS. */
  async addPhoto(actor: Actor, albumId: string, upload: Buffer, caption: PhotoCaptionInput): Promise<PhotoAdmin> {
    await this.get(actor.societyId, albumId);
    if ((await this.prisma.gallery_photos.count({ where: { album_id: albumId } })) >= MAX_ALBUM_PHOTOS) throw albumFull();

    const key = await this.media.saveImage(actor.societyId, 'gallery', upload);
    try {
      const photo = await this.prisma.$transaction(async (tx) => {
        // Locks the album row, so two uploads at once don't get the same position.
        await tx.$queryRaw`select id from gallery_albums where id = ${albumId}::uuid for update`;
        const last = await tx.gallery_photos.aggregate({ where: { album_id: albumId }, _max: { sort_order: true }, _count: true });
        if (last._count >= MAX_ALBUM_PHOTOS) throw albumFull();
        const row = await tx.gallery_photos.create({
          data: {
            album_id: albumId,
            file_url: key,
            caption_bn: caption.captionBn,
            caption_en: caption.captionEn,
            sort_order: (last._max.sort_order ?? -1) + 1,
          },
          select: photoSelect,
        });
        await this.audit.record(
          { ...auditOf(actor, 'create', 'gallery_photo', row.id), after: { albumId, file: key, ...caption } },
          tx,
        );
        return row;
      });
      return this.toPhoto(photo);
    } catch (error) {
      await this.media.removeQuietly(actor.societyId, [key]);
      throw error;
    }
  }

  async updatePhoto(actor: Actor, photoId: string, input: PhotoCaptionInput): Promise<PhotoAdmin> {
    const before = await this.findPhoto(actor.societyId, photoId);
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.gallery_photos.update({
        where: { id: photoId },
        data: { caption_bn: input.captionBn, caption_en: input.captionEn },
        select: photoSelect,
      });
      await this.audit.record(
        {
          ...auditOf(actor, 'update', 'gallery_photo', photoId),
          before: { captionBn: before.caption_bn, captionEn: before.caption_en },
          after: { ...input },
        },
        tx,
      );
      return updated;
    });
    return this.toPhoto(row);
  }

  async removePhoto(actor: Actor, photoId: string): Promise<void> {
    const before = await this.findPhoto(actor.societyId, photoId);
    await this.prisma.$transaction(async (tx) => {
      await tx.gallery_photos.delete({ where: { id: photoId } });
      await this.audit.record(
        { ...auditOf(actor, 'delete', 'gallery_photo', photoId), before: { albumId: before.album_id, file: before.file_url } },
        tx,
      );
    });
    await this.media.removeQuietly(actor.societyId, [before.file_url]);
  }

  /** Sets the album's photo order. `photoIds` must list every photo of the album exactly once (400 `invalid_order`). */
  async reorder(actor: Actor, albumId: string, photoIds: string[]): Promise<AlbumAdmin> {
    const album = await this.get(actor.societyId, albumId);
    const current = new Set(album.photos.map((photo) => photo.id));
    if (photoIds.length !== current.size || new Set(photoIds).size !== photoIds.length || !photoIds.every((id) => current.has(id))) {
      throw new BadRequestException({ code: 'invalid_order', message: 'List every photo of the album once' });
    }
    await this.prisma.$transaction(async (tx) => {
      for (const [index, id] of photoIds.entries()) {
        await tx.gallery_photos.update({ where: { id }, data: { sort_order: index } });
      }
      await this.audit.record(
        { ...auditOf(actor, 'reorder', 'gallery_album', albumId), before: { photoIds: album.photos.map((p) => p.id) }, after: { photoIds } },
        tx,
      );
    });
    return this.get(actor.societyId, albumId);
  }

  private async findPhoto(societyId: string, photoId: string) {
    const photo = await this.prisma.gallery_photos.findFirst({
      where: { id: photoId, gallery_albums: { society_id: societyId } },
      select: { ...photoSelect, album_id: true },
    });
    if (!photo) throw photoNotFound();
    return photo;
  }
}

const albumFull = () =>
  new ConflictException({ code: 'album_full', message: `An album holds at most ${MAX_ALBUM_PHOTOS} photos` });

function albumData(input: AlbumInput) {
  return {
    title_bn: input.titleBn,
    title_en: input.titleEn,
    event_date: input.eventDate ? new Date(`${input.eventDate}T00:00:00.000Z`) : null,
    is_published: input.isPublished,
    hide_from_gallery: input.hideFromGallery,
  };
}

const auditOf = (actor: Actor, action: string, entityType: string, entityId: string) => ({
  societyId: actor.societyId,
  userId: actor.userId,
  action,
  entityType,
  entityId,
  ip: actor.ip,
});
