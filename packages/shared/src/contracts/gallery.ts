import { z } from 'zod';
import { pagination } from '../schemas.js';

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
