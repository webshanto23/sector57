import { loadEnv } from './env.js';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

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

  it('rejects a non-postgres database url', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(/DATABASE_URL/);
  });
});
