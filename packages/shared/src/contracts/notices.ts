import { z } from 'zod';
import { pagination } from '../schemas.js';

/**
 * Stable notice category keys. Labels live in the i18n files (`Notices.category.*`);
 * `general` is also what an empty or unknown stored category reads as.
 */
export const NOTICE_CATEGORIES = ['billing', 'maintenance', 'agm', 'security', 'development', 'general'] as const;
export type NoticeCategory = (typeof NOTICE_CATEGORIES)[number];
export const noticeCategory = z.enum(NOTICE_CATEGORIES);

export function toNoticeCategory(value: string | null | undefined): NoticeCategory {
  return (NOTICE_CATEGORIES as readonly string[]).includes(value ?? '') ? (value as NoticeCategory) : 'general';
}

/** One public notice. */
export const noticeSchema = z.object({
  id: z.uuid(),
  titleBn: z.string(),
  titleEn: z.string().nullable(),
  bodyBn: z.string(),
  bodyEn: z.string().nullable(),
  category: noticeCategory,
  publishAt: z.iso.datetime({ offset: true }),
});
export type Notice = z.infer<typeof noticeSchema>;

/** `GET /public/notices` query. */
export const noticeListQuery = pagination.extend({
  category: noticeCategory.optional(),
});
export type NoticeListQuery = z.infer<typeof noticeListQuery>;

/** `GET /public/notices` response. */
export const noticeListSchema = z.object({
  items: z.array(noticeSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});
export type NoticeList = z.infer<typeof noticeListSchema>;
