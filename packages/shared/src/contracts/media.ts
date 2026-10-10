/** Limits for image uploads (gallery photos, committee portraits). The API enforces them; the web checks first. */
export const IMAGE_UPLOAD = {
  maxBytes: 10 * 1024 * 1024,
  types: ['image/jpeg', 'image/png', 'image/webp'],
} as const;

/** `accept` attribute for an image file input. */
export const IMAGE_ACCEPT = IMAGE_UPLOAD.types.join(',');
