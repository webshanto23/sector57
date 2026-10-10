import { z } from 'zod';
import { optionalText, pagination, text } from '../schemas.js';
import { cleanText } from '../text.js';

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

/**
 * Where a notice stands, from its flags: `internal` (not on the website), `scheduled`
 * (public, publish time still ahead) or `published`.
 */
export const NOTICE_STATUSES = ['published', 'scheduled', 'internal'] as const;
export type NoticeStatus = (typeof NOTICE_STATUSES)[number];

export function noticeStatus(notice: { isPublic: boolean; publishAt: string | Date }, now = new Date()): NoticeStatus {
  if (!notice.isPublic) return 'internal';
  return new Date(notice.publishAt) > now ? 'scheduled' : 'published';
}

/** One notice in the dashboard: also private and scheduled ones. */
export const noticeAdminSchema = noticeSchema.extend({
  isPublic: z.boolean(),
  status: z.enum(NOTICE_STATUSES),
  createdByName: z.string().nullable(),
});
export type NoticeAdmin = z.infer<typeof noticeAdminSchema>;

/** `GET /notices` query. `q` matches the Bangla or English title. */
export const noticeAdminListQuery = pagination.extend({
  category: noticeCategory.optional(),
  status: z.enum(NOTICE_STATUSES).optional(),
  q: z.string().transform(cleanText).pipe(z.string().max(100)).optional(),
});
export type NoticeAdminListQuery = z.infer<typeof noticeAdminListQuery>;

/** `GET /notices` response. */
export const noticeAdminListSchema = z.object({
  items: z.array(noticeAdminSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});
export type NoticeAdminList = z.infer<typeof noticeAdminListSchema>;

/** Longest notice body, in characters. */
export const NOTICE_BODY_MAX = 10_000;

/**
 * `POST /notices` and `PUT /notices/:id`: the whole notice. The body is plain text
 * (line breaks kept), never HTML. A publish time in the future schedules a public notice.
 */
export const noticeInputSchema = z.object({
  titleBn: text(200),
  titleEn: optionalText(200),
  bodyBn: z.string().transform(cleanBody).pipe(z.string().min(1).max(NOTICE_BODY_MAX)),
  bodyEn: z
    .string()
    .nullish()
    .transform((value) => (value == null ? null : cleanBody(value) || null))
    .pipe(z.string().max(NOTICE_BODY_MAX).nullable()),
  category: noticeCategory,
  isPublic: z.boolean(),
  publishAt: z.iso.datetime({ offset: true }),
});
export type NoticeInput = z.infer<typeof noticeInputSchema>;

/** Body text: NFC, Windows line breaks made plain, trimmed. */
function cleanBody(value: string): string {
  return cleanText(value.replace(/\r\n?/g, '\n'));
}
