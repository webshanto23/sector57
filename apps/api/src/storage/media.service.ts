import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { thumbKey } from '../common/media.js';
import { processImage } from './image.js';
import { FILE_STORAGE, type FileStorage } from './storage.js';

/** What a stored image belongs to; the second segment of its key. */
export type MediaArea = 'gallery' | 'people' | 'assets' | 'tickets';

/**
 * Uploaded images: checked, re-encoded and saved with a thumbnail, under keys that
 * start with the society id (`<society>/<area>/<uuid>.webp`), so one society's files
 * can never be addressed through another's records.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(@Inject(FILE_STORAGE) private readonly storage: FileStorage) {}

  /** Processes and stores an uploaded image; returns its key. Throws 415 `unsupported_image` for anything else. */
  async saveImage(societyId: string, area: MediaArea, upload: Buffer): Promise<string> {
    const image = await processImage(upload);
    const key = `${societyId}/${area}/${randomUUID()}.webp`;
    await this.storage.put(thumbKey(key), image.thumb, 'image/webp');
    try {
      await this.storage.put(key, image.full, 'image/webp');
    } catch (error) {
      await this.storage.delete(thumbKey(key)).catch(() => undefined);
      throw error;
    }
    return key;
  }

  /** True for a key this service stored for the society (not a seeded URL or another society's file). */
  ownsKey(societyId: string, key: string | null | undefined): key is string {
    return !!key && key.startsWith(`${societyId}/`) && !/^https?:\/\//i.test(key);
  }

  /**
   * Deletes stored images and their thumbnails once the rows pointing at them are gone.
   * Keys the society doesn't own are skipped; failures are logged, never thrown, because
   * the database change has already been committed.
   */
  async removeQuietly(societyId: string, keys: (string | null | undefined)[]): Promise<void> {
    for (const key of keys) {
      if (!this.ownsKey(societyId, key)) continue;
      for (const file of [key, thumbKey(key)]) {
        try {
          await this.storage.delete(file);
        } catch (error) {
          this.logger.warn({ err: error, key: file }, 'Could not delete a stored file');
        }
      }
    }
  }
}
