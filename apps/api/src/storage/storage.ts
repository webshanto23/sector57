/** Where uploaded files live. Local disk now; a DigitalOcean Spaces driver only needs to implement this. */
export interface FileStorage {
  /** Saves `data` under `key`, replacing any file already there. */
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** Removes the file; a missing file is not an error. */
  delete(key: string): Promise<void>;
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');

// Lower-case segments of letters, digits, dot, dash and underscore; no empty, `.` or `..` segments.
const KEY = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9._-]*)*$/;

/** Throws unless `key` is a safe relative storage key (`<society>/gallery/<uuid>.webp`). */
export function assertStorageKey(key: string): void {
  if (key.length > 300 || !KEY.test(key) || key.split('/').some((segment) => segment.includes('..'))) {
    throw new Error(`Invalid storage key: ${JSON.stringify(key)}`);
  }
}
