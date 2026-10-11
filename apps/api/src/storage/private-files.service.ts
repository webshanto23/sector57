import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { processDocument } from './document.js';
import { PRIVATE_FILE_STORAGE, type FileStorage } from './storage.js';

/** What a private file belongs to; the second segment of its key. */
export type PrivateArea = 'forms';

const fileMissing = () => new NotFoundException({ code: 'file_not_found', message: 'File not found' });

/**
 * Documents people send with the public forms (deeds, NID copies). They are stored apart from
 * the public media (`PRIVATE_MEDIA_DIR`), under keys that start with the society id, and are
 * only ever read back through the API after a permission check.
 */
@Injectable()
export class PrivateFilesService {
  private readonly logger = new Logger(PrivateFilesService.name);

  constructor(@Inject(PRIVATE_FILE_STORAGE) private readonly storage: FileStorage) {}

  /** Checks and stores an upload; returns its key. Throws 415 `unsupported_document` for anything but a photo or a clean PDF. */
  async saveDocument(societyId: string, area: PrivateArea, upload: Buffer): Promise<{ key: string; isImage: boolean }> {
    const document = await processDocument(upload);
    const key = `${societyId}/${area}/${randomUUID()}.${document.extension}`;
    await this.storage.put(key, document.data, document.extension === 'pdf' ? 'application/pdf' : 'image/webp');
    return { key, isImage: document.extension === 'webp' };
  }

  /** The bytes of a file the society owns; 404 `file_not_found` when it is gone or not the society's. */
  async read(societyId: string, key: string): Promise<Buffer> {
    if (!key.startsWith(`${societyId}/`)) throw fileMissing();
    try {
      return await this.storage.read(key);
    } catch (error) {
      if ((error as { code?: unknown }).code === 'ENOENT') throw fileMissing();
      throw error;
    }
  }

  /** Deletes files once the rows pointing at them are gone (or never committed). Never throws. */
  async removeQuietly(societyId: string, keys: string[]): Promise<void> {
    for (const key of keys) {
      if (!key.startsWith(`${societyId}/`)) continue;
      try {
        await this.storage.delete(key);
      } catch (error) {
        this.logger.warn({ err: error, key }, 'Could not delete a private file');
      }
    }
  }
}
