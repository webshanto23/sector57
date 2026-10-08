import { mediaUrl } from './media.js';

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
