import { mediaUrl, thumbKey } from './media.js';

describe('mediaUrl', () => {
  it('joins a storage key to the base URL', () => {
    expect(mediaUrl('/gallery/a.jpg', 'https://cdn.example.com/s57/')).toBe('https://cdn.example.com/s57/gallery/a.jpg');
  });

  it('passes absolute URLs through', () => {
    expect(mediaUrl('https://example.com/a.jpg', undefined)).toBe('https://example.com/a.jpg');
  });

  it('returns null for empty keys or when no base URL is configured', () => {
    expect(mediaUrl(null, 'https://cdn.example.com')).toBeNull();
    expect(mediaUrl('gallery/a.jpg', undefined)).toBeNull();
  });
});

describe('thumbKey', () => {
  it('names the thumbnail of a stored WebP photo', () => {
    expect(thumbKey('soc/gallery/a.webp')).toBe('soc/gallery/a.thumb.webp');
  });

  it('leaves URLs, other files, thumbnails and empty keys alone', () => {
    expect(thumbKey('https://cdn.example/a.webp')).toBe('https://cdn.example/a.webp');
    expect(thumbKey('gallery/a.jpg')).toBe('gallery/a.jpg');
    expect(thumbKey('soc/a.thumb.webp')).toBe('soc/a.thumb.webp');
    expect(thumbKey(null)).toBeNull();
  });
});
