import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { ENV, type Env } from './config/env.js';

/** Everything main.ts applies to the app, shared with the e2e tests. */
export function configureApp(app: INestApplication): Env {
  const env = app.get<Env>(ENV);
  const express = app as NestExpressApplication;

  // Behind Nginx on the droplet: trust the local proxy so req.ip is the client (rate limits, audit).
  express.set('trust proxy', 'loopback');
  express.disable('x-powered-by');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  app.enableShutdownHooks();

  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Sector 57 API')
      .setVersion('1')
      // 3.1 so nullable fields come out as `type: [x, 'null']` for the generated client.
      .setOpenAPIVersion('3.1.0')
      .build();
    const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config), { version: '3.1' });
    SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs/json' });
  }

  return env;
}
