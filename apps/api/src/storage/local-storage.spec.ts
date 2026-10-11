import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFileStorage } from './local-storage.js';
import { assertStorageKey, type FileStorage } from './storage.js';

describe('assertStorageKey', () => {
  it('accepts society keys', () => {
    expect(() => assertStorageKey('0b6f2c1e-1111-4222-8333-444455556666/gallery/abc.thumb.webp')).not.toThrow();
  });

  it.each([
    '../secret',
    'a/../../etc/passwd',
    'a/..',
    '/abs/path.webp',
    'C:/windows/x.webp',
    'a\\b.webp',
    'a//b.webp',
    'a/.hidden',
    'UPPER/x.webp',
    '',
    'a/b c.webp',
  ])('rejects %j', (key) => {
    expect(() => assertStorageKey(key)).toThrow(/Invalid storage key/);
  });
});

describe('LocalFileStorage', () => {
  let root: string;
  let storage: FileStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 's57-media-'));
    storage = new LocalFileStorage(root);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('writes a file under its key, creating folders, and replaces it', async () => {
    await storage.put('soc/gallery/a.webp', Buffer.from('one'), 'image/webp');
    await storage.put('soc/gallery/a.webp', Buffer.from('two'), 'image/webp');
    expect(await readFile(join(root, 'soc', 'gallery', 'a.webp'), 'utf8')).toBe('two');
  });

  it('deletes a file, and a missing file is not an error', async () => {
    await storage.put('soc/x.webp', Buffer.from('x'), 'image/webp');
    await storage.delete('soc/x.webp');
    await expect(stat(join(root, 'soc', 'x.webp'))).rejects.toThrow();
    await expect(storage.delete('soc/x.webp')).resolves.toBeUndefined();
  });

  it('refuses keys that would leave the root', async () => {
    await expect(storage.put('../escape.webp', Buffer.from('x'), 'image/webp')).rejects.toThrow(/Invalid storage key/);
    await expect(storage.delete('a/../../escape.webp')).rejects.toThrow(/Invalid storage key/);
  });
});
