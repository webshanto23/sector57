/**
 * Public URL for a stored file: absolute http(s) URLs pass through, storage keys
 * (`gallery/2026/x.jpg`) are joined to MEDIA_BASE_URL, and without a base URL
 * keys resolve to null so the site draws a placeholder instead of a broken image.
 */
export function mediaUrl(key: string | null | undefined, baseUrl: string | undefined): string | null {
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key;
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`;
}
