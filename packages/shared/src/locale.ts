export const LOCALES = ['bn', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'bn';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Picks the display text for a bilingual field: English when the locale is
 * English and an English value exists, otherwise Bangla (the required field).
 */
export function pick(bn: string, en: string | null | undefined, locale: Locale): string {
  return locale === 'en' && en ? en : bn;
}
