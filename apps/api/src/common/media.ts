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

/**
 * Storage key of a photo's thumbnail: `x.webp` → `x.thumb.webp`. Absolute URLs and
 * other keys (seeded or imported files) have no thumbnail and are returned unchanged.
 */
export function thumbKey<T extends string | null | undefined>(key: T): T {
  if (!key || /^https?:\/\//i.test(key) || !key.endsWith('.webp') || key.endsWith('.thumb.webp')) return key;
  return `${key.slice(0, -'.webp'.length)}.thumb.webp` as T;
}
