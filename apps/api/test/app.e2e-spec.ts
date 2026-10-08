import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { createTestApp } from './create-app.js';

// Runs against TEST_DATABASE_URL (sector57_test), migrated and seeded.
describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health', () => {
    return request(app.getHttpServer()).get('/health').expect(200).expect({ ok: true });
  });

  it('GET /society returns the default society', async () => {
    const res = await request(app.getHttpServer()).get('/society').expect(200);
    expect(res.body).toMatchObject({ slug: 'sector57', nameBn: 'উত্তরা সেক্টর ৫৭ কল্যাণ সমিতি' });
  });

  it('documents response schemas for the typed web client', async () => {
    const res = await request(app.getHttpServer()).get('/docs/json').expect(200);
    const schema = res.body.paths['/society'].get.responses['200'].content['application/json'].schema;
    expect(schema.$ref).toMatch(/Society/);
    const society = res.body.components.schemas[schema.$ref.split('/').pop()];
    expect(society.properties.nameEn).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] });
  });

  it('sends security headers', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('returns the standard error shape for unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/nope').expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, code: 'not_found' });
  });
});
