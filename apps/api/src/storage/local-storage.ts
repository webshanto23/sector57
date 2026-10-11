import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { assertStorageKey, type FileStorage } from './storage.js';

/** Files on the API server's disk, under one root folder (`MEDIA_DIR`). */
export class LocalFileStorage implements FileStorage {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  /** Absolute path of a key; refuses anything that would land outside the root. */
  pathOf(key: string): string {
    assertStorageKey(key);
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new Error(`Invalid storage key: ${JSON.stringify(key)}`);
    return path;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    // Write beside the target and rename, so a reader never sees half a file.
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, data);
      await rename(temp, path);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  read(key: string): Promise<Buffer> {
    return readFile(this.pathOf(key));
  }
}
