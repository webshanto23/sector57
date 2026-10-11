import { z } from 'zod';
import { optionalText, pagination, text } from '../schemas.js';

/** An album on the gallery page. `coverUrl` is null until photos are uploaded (the site draws a placeholder). */
export const albumSummarySchema = z.object({
  id: z.uuid(),
  titleBn: z.string(),
  titleEn: z.string().nullable(),
  eventDate: z.iso.date().nullable(),
  photoCount: z.number().int().min(0),
  coverUrl: z.string().nullable(),
});
export type AlbumSummary = z.infer<typeof albumSummarySchema>;

export const albumListQuery = pagination;

/** `GET /public/gallery` response. */
export const albumListSchema = z.object({
  items: z.array(albumSummarySchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});
export type AlbumList = z.infer<typeof albumListSchema>;

/** One photo; `url` is null when the file is not reachable yet (no media storage configured). */
export const photoSchema = z.object({
  id: z.uuid(),
  url: z.string().nullable(),
  captionBn: z.string().nullable(),
  captionEn: z.string().nullable(),
});
export type Photo = z.infer<typeof photoSchema>;

/** `GET /public/gallery/:id`. */
export const albumSchema = albumSummarySchema.extend({ photos: z.array(photoSchema) });
export type Album = z.infer<typeof albumSchema>;

/** An album in the dashboard: drafts too. */
export const albumAdminSummarySchema = albumSummarySchema.extend({ isPublished: z.boolean() });
export type AlbumAdminSummary = z.infer<typeof albumAdminSummarySchema>;

/** `GET /gallery/albums` response. */
export const albumAdminListSchema = z.object({
  items: z.array(albumAdminSummarySchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});
export type AlbumAdminList = z.infer<typeof albumAdminListSchema>;

/** A photo in the dashboard, with its thumbnail for the editing grid. */
export const photoAdminSchema = photoSchema.extend({ thumbUrl: z.string().nullable() });
export type PhotoAdmin = z.infer<typeof photoAdminSchema>;

/** `GET /gallery/albums/:id`: photos in display order (the first is the cover). */
export const albumAdminSchema = albumAdminSummarySchema.extend({ photos: z.array(photoAdminSchema) });
export type AlbumAdmin = z.infer<typeof albumAdminSchema>;

/** Most photos one album can hold. */
export const MAX_ALBUM_PHOTOS = 300;

/** `POST /gallery/albums` and `PUT /gallery/albums/:id`. */
export const albumInputSchema = z.object({
  titleBn: text(200),
  titleEn: optionalText(200),
  eventDate: z.iso.date().nullish().transform((value) => value ?? null),
  isPublished: z.boolean(),
});
export type AlbumInput = z.infer<typeof albumInputSchema>;

/** `PATCH /gallery/photos/:id`: the captions (blank clears one). */
export const photoCaptionSchema = z.object({
  captionBn: optionalText(300),
  captionEn: optionalText(300),
});
export type PhotoCaptionInput = z.infer<typeof photoCaptionSchema>;

/** `PUT /gallery/albums/:id/photo-order`: every photo of the album, in the new order. */
export const photoOrderSchema = z.object({ photoIds: z.array(z.uuid()).max(MAX_ALBUM_PHOTOS) });
export type PhotoOrderInput = z.infer<typeof photoOrderSchema>;
