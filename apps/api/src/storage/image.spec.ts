import { UnsupportedMediaTypeException } from '@nestjs/common';
import sharp from 'sharp';
import { FULL_SIZE, processImage, THUMB_SIZE } from './image.js';

/** A plain test picture in the given format. */
function picture(width: number, height: number, format: 'jpeg' | 'png' | 'webp' | 'gif' | 'tiff') {
  return sharp({ create: { width, height, channels: 3, background: { r: 30, g: 120, b: 90 } } })
    .toFormat(format)
    .toBuffer();
}

describe('processImage', () => {
  it.each(['jpeg', 'png', 'webp'] as const)('re-encodes a %s as WebP with a thumbnail', async (format) => {
    const result = await processImage(await picture(800, 600, format));
    expect((await sharp(result.full).metadata()).format).toBe('webp');
    expect((await sharp(result.thumb).metadata()).format).toBe('webp');
    expect(result).toMatchObject({ width: 800, height: 600 });
    expect((await sharp(result.thumb).metadata()).width).toBe(THUMB_SIZE);
  });

  it('scales a large photo down to the full size, keeping its shape', async () => {
    const result = await processImage(await picture(4000, 3000, 'jpeg'));
    expect(result).toMatchObject({ width: FULL_SIZE, height: 1200 });
  });

  it('never enlarges a small photo', async () => {
    const result = await processImage(await picture(300, 200, 'png'));
    expect(result).toMatchObject({ width: 300, height: 200 });
    expect((await sharp(result.thumb).metadata()).width).toBe(300);
  });

  it('removes EXIF data such as the GPS position and turns the photo upright', async () => {
    const tagged = await sharp(await picture(400, 200, 'jpeg'))
      .withExif({ IFD0: { Make: 'PhoneCam' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '23/1 52/1 0/1' } })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    expect((await sharp(tagged).metadata()).exif).toBeDefined();

    const result = await processImage(tagged);
    const meta = await sharp(result.full).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    // Orientation 6 means "rotate 90°": the stored picture is upright, so taller than wide.
    expect(result).toMatchObject({ width: 200, height: 400 });
  });

  it.each([
    ['a GIF', () => picture(10, 10, 'gif')],
    ['a TIFF', () => picture(10, 10, 'tiff')],
    ['text named like a photo', async () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['random bytes', async () => Buffer.from('not an image at all')],
  ])('rejects %s with 415 unsupported_image', async (_name, make) => {
    const error = await processImage(await make()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnsupportedMediaTypeException);
    expect((error as UnsupportedMediaTypeException).getResponse()).toMatchObject({ code: 'unsupported_image' });
  });

  it('rejects a truncated file', async () => {
    const whole = await picture(600, 400, 'jpeg');
    await expect(processImage(whole.subarray(0, Math.floor(whole.length / 2)))).rejects.toBeInstanceOf(
      UnsupportedMediaTypeException,
    );
  });
});
