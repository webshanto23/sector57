import { loadEnv } from './env.js';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db', JWT_SECRET: 'x'.repeat(32) };

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv(base);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      DEFAULT_SOCIETY_SLUG: 'sector57',
      WEB_ORIGIN: ['http://localhost:3000'],
    });
  });

  it('splits several web origins', () => {
    expect(loadEnv({ ...base, WEB_ORIGIN: 'https://a.example, https://b.example' }).WEB_ORIGIN).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });

  it('fails fast and names every bad variable', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(/PORT[\s\S]*DATABASE_URL/);
  });

  it('requires a JWT_SECRET of at least 32 characters', () => {
    expect(() => loadEnv({ ...base, JWT_SECRET: undefined })).toThrow(/JWT_SECRET/);
    expect(() => loadEnv({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('treats an empty MEDIA_BASE_URL as unset and rejects a non-http one', () => {
    expect(loadEnv({ ...base, MEDIA_BASE_URL: '' }).MEDIA_BASE_URL).toBeUndefined();
    expect(() => loadEnv({ ...base, MEDIA_BASE_URL: 'ftp://files.example' })).toThrow(/MEDIA_BASE_URL/);
  });

  it('rejects a non-postgres database url', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(/DATABASE_URL/);
  });

  it('reads the media settings', () => {
    expect(loadEnv(base).MEDIA_DIR).toBe('media');
    expect(loadEnv(base).MEDIA_SERVE).toBeUndefined();
    expect(loadEnv({ ...base, MEDIA_SERVE: 'false' }).MEDIA_SERVE).toBe(false);
    expect(loadEnv({ ...base, MEDIA_SERVE: 'true', MEDIA_DIR: '/srv/media' })).toMatchObject({ MEDIA_SERVE: true, MEDIA_DIR: '/srv/media' });
    expect(() => loadEnv({ ...base, MEDIA_SERVE: 'maybe' })).toThrow(/MEDIA_SERVE/);
  });
});
