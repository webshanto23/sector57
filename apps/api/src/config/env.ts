import { z } from 'zod';

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
  // Signs the 60-minute access tokens. Long and random; changing it logs everyone out within the hour.
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
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
