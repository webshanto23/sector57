import sharp from 'sharp';
import { MediaService } from './media.service.js';
import type { FileStorage } from './storage.js';

const SOCIETY = '0b6f2c1e-1111-4222-8333-444455556666';

function setup(failOn?: (key: string) => boolean) {
  const files = new Map<string, Buffer>();
  const storage: FileStorage = {
    put: vi.fn(async (key: string, data: Buffer) => {
      if (failOn?.(key)) throw new Error('disk full');
      files.set(key, data);
    }),
    delete: vi.fn(async (key: string) => {
      files.delete(key);
    }),
    read: vi.fn(async (key: string) => files.get(key)!),
  };
  return { files, storage, media: new MediaService(storage) };
}

const photo = () =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: '#2a7' } })
    .png()
    .toBuffer();

describe('MediaService', () => {
  it('stores the photo and its thumbnail under a society key', async () => {
    const { media, files } = setup();
    const key = await media.saveImage(SOCIETY, 'gallery', await photo());
    expect(key).toMatch(new RegExp(`^${SOCIETY}/gallery/[0-9a-f-]{36}\\.webp$`));
    expect([...files.keys()].sort()).toEqual([key, key.replace(/\.webp$/, '.thumb.webp')].sort());
  });

  it('removes the thumbnail again when the photo cannot be written', async () => {
    const { media, files } = setup((key) => !key.endsWith('.thumb.webp'));
    await expect(media.saveImage(SOCIETY, 'people', await photo())).rejects.toThrow('disk full');
    expect(files.size).toBe(0);
  });

  it('deletes only keys the society owns, with their thumbnails', async () => {
    const { media, storage } = setup();
    await media.removeQuietly(SOCIETY, [
      `${SOCIETY}/gallery/a.webp`,
      'https://cdn.example/x.webp',
      'ffffffff-1111-4222-8333-444455556666/gallery/b.webp',
      null,
    ]);
    expect(vi.mocked(storage.delete).mock.calls.map(([key]) => key)).toEqual([
      `${SOCIETY}/gallery/a.webp`,
      `${SOCIETY}/gallery/a.thumb.webp`,
    ]);
  });

  it('never throws from removeQuietly', async () => {
    const { media, storage } = setup();
    vi.mocked(storage.delete).mockRejectedValue(new Error('gone'));
    await expect(media.removeQuietly(SOCIETY, [`${SOCIETY}/gallery/a.webp`])).resolves.toBeUndefined();
  });
});
