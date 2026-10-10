import 'dotenv/config';

import { INestApplication, type DynamicModule, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { ENV, loadEnv } from './../src/config/env.js';
import { configureApp } from './../src/setup.js';

/**
 * The full app as main.ts builds it, against TEST_DATABASE_URL (migrated and seeded).
 * `extraModules` adds test-only routes; the global guards and interceptors apply to them too.
 */
export async function createTestApp(extraModules: (Type | DynamicModule)[] = []): Promise<INestApplication<App>> {
  if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule, ...extraModules] })
    .overrideProvider(ENV)
    // No media storage in tests: stored keys resolve to null, absolute URLs pass through.
    .useValue(
      loadEnv({
        ...process.env,
        NODE_ENV: 'test',
        LOG_LEVEL: 'warn',
        MEDIA_BASE_URL: '',
        // Uploads land in a fresh temporary folder per app; nothing is served from it.
        MEDIA_DIR: mkdtempSync(join(tmpdir(), 's57-e2e-media-')),
        MEDIA_SERVE: 'false',
        WEB_ORIGIN: 'http://localhost:3000',
        // Tests sign and check their own tokens; they never need the real secret (CI has none).
        JWT_SECRET: 'e2e-test-secret-that-is-long-enough-123',
      }),
    )
    .compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return app;
}
