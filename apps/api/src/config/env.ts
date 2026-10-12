import { isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';

/** True when folder `inner` is `outer` or somewhere below it. */
const isWithin = (inner: string, outer: string) => {
  const rel = relative(resolve(outer), resolve(inner));
  // Another drive (Windows) gives an absolute path: not inside.
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // Society served when the request does not name one (single-society deploys).
  DEFAULT_SOCIETY_SLUG: z.string().regex(/^[a-z0-9-]+$/).default('sector57'),
  // Origin of the Next.js app, allowed by CORS. Comma-separate several.
  WEB_ORIGIN: z
    .string()
    .default('http://localhost:3000')
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    .pipe(z.array(z.url())),
  // Public base URL of uploaded files (DigitalOcean Spaces CDN). Unset: stored files are not linked.
  MEDIA_BASE_URL: z.preprocess((value) => (value === '' ? undefined : value), z.url({ protocol: /^https?$/ }).optional()),
  // Folder that holds uploaded files (local-disk storage), relative to the API's working directory.
  MEDIA_DIR: z.string().min(1).default('media'),
  // Folder for private uploads (deeds, NID copies from the public forms). Never served by Nginx or
  // the static handler; the API sends a file only to a logged-in user allowed to see it.
  PRIVATE_MEDIA_DIR: z.string().min(1).default('private-media'),
  // Serve MEDIA_DIR at /media from the API. Defaults to on outside production; on the droplet Nginx serves it.
  MEDIA_SERVE: z.preprocess((value) => (value === '' ? undefined : value), z.stringbool().optional()),
  // Signs the 60-minute access tokens. Long and random; changing it logs everyone out within the hour.
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  // Seconds the dashboard overview keeps a caller's figures (0: always live).
  OVERVIEW_CACHE_SECONDS: z.coerce.number().int().min(0).max(300).default(30),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
}).refine((env) => !isWithin(env.PRIVATE_MEDIA_DIR, env.MEDIA_DIR) && !isWithin(env.MEDIA_DIR, env.PRIVATE_MEDIA_DIR), {
  // Anything under MEDIA_DIR is public; private files must live apart from it.
  message: 'must not be inside MEDIA_DIR or contain it',
  path: ['PRIVATE_MEDIA_DIR'],
});

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol('ENV');

/** Parses the environment once at startup; throws with every problem listed. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment:\n${problems.join('\n')}`);
  }
  return result.data;
}
