import { UnsupportedMediaTypeException } from '@nestjs/common';
import sharp from 'sharp';
import { documentContentType, processDocument } from './document.js';

const pdf = (body = '1 0 obj << /Type /Catalog >> endobj\n') => Buffer.from(`%PDF-1.7\n${body}trailer\n%%EOF\n`, 'latin1');

const rejected = async (input: Buffer) => {
  const error = await processDocument(input).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(UnsupportedMediaTypeException);
  expect((error as UnsupportedMediaTypeException).getResponse()).toMatchObject({ code: 'unsupported_document' });
};

describe('processDocument', () => {
  it('keeps a plain PDF as it is', async () => {
    const input = pdf();
    const result = await processDocument(input);
    expect(result.extension).toBe('pdf');
    expect(result.data.equals(input)).toBe(true);
  });

  it('re-encodes a photo as WebP', async () => {
    const photo = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#555' } })
      .jpeg()
      .toBuffer();
    const result = await processDocument(photo);
    expect(result.extension).toBe('webp');
    expect((await sharp(result.data).metadata()).format).toBe('webp');
  });

  it.each(['/JavaScript (app.alert(1))', '/JS (x)', '/Launch << /F (cmd.exe) >>', '/EmbeddedFile', '/XFA [ ]'])(
    'rejects a PDF with active content %s',
    async (part) => {
      await rejected(pdf(`1 0 obj << /OpenAction << ${part} >> >> endobj\n`));
    },
  );

  it('rejects a cut-off PDF', async () => {
    await rejected(Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n', 'latin1'));
  });

  it.each([
    ['HTML', Buffer.from('<html><script>alert(1)</script></html>')],
    ['an SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['a zip', Buffer.from('PK\u0003\u0004rest')],
    ['nothing', Buffer.alloc(0)],
  ])('rejects %s', async (_name, input) => {
    await rejected(input);
  });

  it('names the content type from the key', () => {
    expect(documentContentType('s/forms/a.pdf')).toBe('application/pdf');
    expect(documentContentType('s/forms/a.webp')).toBe('image/webp');
  });
});
