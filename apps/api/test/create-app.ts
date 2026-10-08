import 'dotenv/config';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { ENV, loadEnv } from './../src/config/env.js';
import { configureApp } from './../src/setup.js';

/** The full app as main.ts builds it, against TEST_DATABASE_URL (migrated and seeded). */
export async function createTestApp(): Promise<INestApplication<App>> {
  if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(loadEnv({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'warn' }))
    .compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return app;
}
