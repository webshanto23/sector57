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

/** Photos of the hero album the home page slider shows (the album's first ones, in gallery order). */
export const HERO_SLIDES_MAX = 5;

/**
 * Slug `home`: content of the public home page that has no table of its own.
 * `heroAlbumId` (same for both languages) picks a gallery album for the hero
 * slider; without it, or while that album is unpublished or empty, the site
 * draws its illustration.
 */
export const homeContentSchema = localized(
  z.object({
    hero: z.object({ label: line, title: line, lead: z.string().max(600) }),
    // Shown as typed; numbers are converted to the locale's digits when rendered.
    stats: z.array(z.object({ label: line, value: z.string().max(20) })).max(6),
    events: z.array(z.object({ date: z.iso.date(), title: line, place: line })).max(6),
    emergency: z.array(z.object({ label: line, phone, icon: z.enum(CONTACT_ICONS) })).max(8),
  }),
).extend({ heroAlbumId: z.uuid().optional() });
export type HomeContent = z.infer<typeof homeContentSchema>;

/** Illustrations the site can draw where a photo is missing (ports of the mockup's `art()` scenes). */
export const ART_SCENES = [
  'lake',
  'road',
  'cctv',
  'field',
  'sports',
  'mosque',
  'trees',
  'boishakh',
  'meeting',
  'art',
  'drain',
  'hall',
] as const;
export type ArtScene = (typeof ART_SCENES)[number];

/** Decimal money as a string (BDT, up to 2 decimals). Never a JS number. */
const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);

export const PROJECT_STATUSES = ['planned', 'in_progress', 'completed'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/**
 * Slug `developments`: development projects. Bilingual per field (`*Bn` / `*En`)
 * rather than `{bn, en}`, so the figures are stored once. Budget and spent are
 * display figures, not accounting: linking them to expenses needs a projects table.
 */
export const developmentsContentSchema = z.object({
  projects: z
    .array(
      z.object({
        titleBn: line,
        titleEn: line.optional(),
        descriptionBn: z.string().max(600),
        descriptionEn: z.string().max(600).optional(),
        status: z.enum(PROJECT_STATUSES),
        progress: z.number().int().min(0).max(100),
        budget: money,
        spent: money,
        art: z.enum(ART_SCENES).default('road'),
      }),
    )
    .max(50),
});
export type DevelopmentsContent = z.infer<typeof developmentsContentSchema>;

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

/** Pages the dashboard edits, each with the schema its content must match. */
export const EDITABLE_PAGES = ['home', 'site', 'developments'] as const;
export type EditablePage = (typeof EDITABLE_PAGES)[number];

export const pageContentSchemas = {
  home: homeContentSchema,
  site: siteInfoSchema,
  developments: developmentsContentSchema,
} as const satisfies Record<EditablePage, z.ZodType>;

/** Content type of each editable page. */
export type PageContent = {
  home: HomeContent;
  site: SiteInfo;
  developments: DevelopmentsContent;
};

/** `GET /site-pages/:slug`. `content` is null until the page is first saved. */
export const sitePageAdminSchema = z.object({
  slug: z.enum(EDITABLE_PAGES),
  content: z.record(z.string(), z.unknown()).nullable(),
  updatedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type SitePageAdmin = z.infer<typeof sitePageAdminSchema>;

/** `PUT /site-pages/:slug`: the page's whole content, checked against the slug's schema by the API. */
export const sitePageInputSchema = z.object({ content: z.record(z.string(), z.unknown()) });
export type SitePageInput = z.infer<typeof sitePageInputSchema>;
