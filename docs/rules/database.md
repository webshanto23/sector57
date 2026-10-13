# Database workflow

- The schema started SQL-first: `docs/schema-phase1.sql` is the reviewed design, copied unchanged into `packages/db/prisma/migrations/0_init/migration.sql`, and `packages/db/prisma/schema.prisma` was produced from it with `prisma db pull`.
- Because of the pull, model names are the table names (snake_case plural, e.g. `persons`, `user_roles`) and relation fields are named after tables. Keep that naming for consistency unless Anis decides to rename models with `@@map`.
- Some database features cannot be expressed in Prisma and live only in SQL migrations: check constraints, trigram (`pg_trgm`) indexes, `citext`, extensions. Prisma marks affected models with a `///` comment. When changing those tables, create the migration with `prisma migrate dev --create-only`, add the SQL by hand, then apply it.
- On a database that was built directly from the SQL file, mark the baseline once with `prisma migrate resolve --applied 0_init` (`pnpm --filter @s57/db migrate:resolve-baseline`) before running new migrations.
- The Prisma config file is `packages/db/prisma7.config.ts`, not the default `prisma.config.ts`. The `@s57/db` scripts already pass `--config prisma7.config.ts`; add it yourself when calling the Prisma CLI directly.
- After any schema change: `pnpm --filter @s57/db generate`, then `pnpm --filter @s57/db build` so the API picks up the new client from `dist`.
- `packages/db/generated` is git-ignored, so a fresh clone must run `pnpm --filter @s57/db generate` before building.
- `@s57/db` also exports the `Prisma` namespace, for `satisfies Prisma.xSelect`.
- Local Postgres runs through FlyEnv. Connection strings are in `apps/api/.env` and `packages/db/.env` (see `apps/api/.env.example`). Never commit `.env` files or print their values.
- Every database (dev, test, production) must be **UTF8**, or Bangla text fails with error `22P05`. Postgres on Windows defaults to WIN1252, so create databases explicitly: `CREATE DATABASE <name> TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'und' LOCALE 'C';`. Check an existing one with `select pg_encoding_to_char(encoding) from pg_database where datname = current_database();`.
- Seed (`prisma/seed.ts`) is idempotent: society, location levels, permission catalogue, starter roles; no users. The `home` and `site` pages are created only if missing, so later edits are never overwritten. Demo notices are seeded only outside production.

# Deployment

- One DigitalOcean droplet runs everything: Next.js, NestJS and PostgreSQL, with PM2 and Nginx. No Vercel, no managed database.
- Docker setup (Anis, 2026-10-08): `Dockerfile` (`api` and web targets), `docker-compose.yml` (Postgres 18, API on 4000, web on 3000) and `.dockerignore`. While the compose stack runs, it holds ports 3000 and 4000, so local `pnpm dev` servers fall back to other ports or fail to bind.
- CI: `.github/workflows/ci.yml` is a draft that Anis owns and is finishing; don't change it unless asked. Until it works, run `pnpm check` before pushing; a `deploy.sh` script is planned.
