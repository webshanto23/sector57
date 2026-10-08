import { z } from 'zod';
import type { Locale } from '../locale.js';

export const pageSlug = z.string().regex(/^[a-z0-9-]{1,60}$/);

/**
 * `GET /public/pages/:slug`. `content` is stored as `{ bn: {...}, en?: {...} }`;
 * its shape depends on the slug, so the API passes it through and the reader
 * validates it with the matching schema below.
 */
export const sitePageSchema = z.object({
  slug: z.string(),
  titleBn: z.string(),
  titleEn: z.string().nullable(),
  content: z.record(z.string(), z.unknown()),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type SitePage = z.infer<typeof sitePageSchema>;

/** Bilingual page content: Bangla is required, English falls back to Bangla as a whole. */
const localized = <T extends z.ZodType>(schema: T) => z.object({ bn: schema, en: schema.optional() });

/** The language version of page content for a locale (English falls back to Bangla). */
export function pickContent<T>(content: { bn: T; en?: T | undefined }, locale: Locale): T {
  return locale === 'en' && content.en ? content.en : content.bn;
}

const line = z.string().min(1).max(300);
const phone = z.string().regex(/^[0-9+\- ]{3,20}$/);

/** Icons the home page's emergency contacts may use (mapped to lucide icons in web). */
export const CONTACT_ICONS = ['siren', 'landmark', 'shield-check', 'stethoscope', 'flame', 'phone'] as const;

/** Slug `home`: content of the public home page that has no table of its own. */
export const homeContentSchema = localized(
  z.object({
    hero: z.object({ label: line, title: line, lead: z.string().max(600) }),
    // Shown as typed; numbers are converted to the locale's digits when rendered.
    stats: z.array(z.object({ label: line, value: z.string().max(20) })).max(6),
    events: z.array(z.object({ date: z.iso.date(), title: line, place: line })).max(6),
    developments: z.array(z.object({ title: line, progress: z.number().int().min(0).max(100) })).max(6),
    emergency: z.array(z.object({ label: line, phone, icon: z.enum(CONTACT_ICONS) })).max(8),
  }),
);
export type HomeContent = z.infer<typeof homeContentSchema>;

/** Slug `site`: footer and contact details shown on every public page. */
export const siteInfoSchema = localized(
  z.object({
    address: line,
    officeHours: line,
    phone,
    email: z.email().optional(),
  }),
);
export type SiteInfo = z.infer<typeof siteInfoSchema>;
