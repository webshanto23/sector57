import { UnsupportedMediaTypeException } from '@nestjs/common';
import sharp from 'sharp';

/** Longest side of a stored photo (mockup design guide: max 1600 px wide). */
export const FULL_SIZE = 1600;
/** Longest side of the thumbnail used in grids and album covers. */
export const THUMB_SIZE = 480;

const ACCEPTED = new Set(['jpeg', 'png', 'webp']);
// About 50 megapixels: larger than any phone photo, small enough to keep a decompression bomb out.
const MAX_PIXELS = 50_000_000;

export type ProcessedImage = { full: Buffer; thumb: Buffer; width: number; height: number };

const unsupported = () =>
  new UnsupportedMediaTypeException({ code: 'unsupported_image', message: 'Upload a JPEG, PNG or WebP photo' });

/**
 * Checks an upload from its bytes (not its name or declared type), then re-encodes it
 * as WebP: turned upright, no larger than FULL_SIZE, and without metadata, so a phone
 * photo's GPS position and camera details are never published. Animated files keep
 * their first frame only.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  let format: string | undefined;
  try {
    ({ format } = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata());
  } catch {
    throw unsupported();
  }
  if (!format || !ACCEPTED.has(format)) throw unsupported();

  try {
    // `failOn: 'error'` rejects truncated or corrupt files instead of saving a broken picture.
    const source = sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).rotate();
    const [full, thumb] = await Promise.all([
      source
        .clone()
        .resize({ width: FULL_SIZE, height: FULL_SIZE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer({ resolveWithObject: true }),
      source
        .clone()
        .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer(),
    ]);
    return { full: full.data, thumb, width: full.info.width, height: full.info.height };
  } catch {
    throw unsupported();
  }
}
