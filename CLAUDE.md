# Sector 57 Community Management System

@AGENTS.md

`AGENTS.md` (imported above) holds the shared rules for every coding agent: workspace layout, commands, code style, generated files. This file adds the product context and the decisions Claude needs on top of that.

**Roles:** Claude does the code and development; Codex reviews, debugs and tests (see "Agent Roles" in `AGENTS.md`). When Codex reports a bug or review finding, Claude makes the fix. If the two files still disagree after applying the roles, ask Anis rather than picking one.

## What we are building

- A community (welfare society) management system for Uttara Sector 57, Dhaka. Owner and only developer: Anis, working with Claude and Codex.
- It will later ship as a product to other societies, so everything is multi-tenant: every business table carries `society_id`, and nothing may assume a single society.
- Milestone 1: a presentable public website plus the simpler backend modules (login, dynamic roles, content CMS, member forms, property/units/members), built as vertical slices. Billing and finance are milestone 2.
- Priorities, in order: security, then speed. Design polish comes after both.

## Product rules that shape the code

- **Bangla first.** Bangla is the default locale and English is secondary. The web app uses `next-intl` with `bn` as the default (Bangla at `/`, English at `/en/`). Message files are `bn.json` and `en.json` in `packages/shared/src/i18n` (not created yet).
- **Bilingual data.** Display text is stored as `*_bn` (required) plus `*_en` (optional, falls back to Bangla). People's, places' and vendors' names are stored as typed (`persons.full_name`, plus optional `full_name_en`). Normalise all text to Unicode NFC before saving.
- **Roles and permissions are data, not code.** Super admin and president create roles, users, permissions and area limits from the dashboard. Never hardcode a role name or check a role by name in code; check permissions (CASL abilities built from `roles`, `permissions`, `role_permissions`, `user_roles`). Seeded roles are only editable starting points.
- **Area-scoped access.** A user's role can be limited to one branch of the location tree (sector > block > road > plot > building > storey > unit). Permission checks must respect that scope.
- **Configurable hierarchy.** `location_levels` defines the levels per society; `locations` is one self-referencing tree; `units` are leaf locations with an extra row.
- **Money.** `numeric(14,2)` in BDT (Prisma `Decimal`, never JS floats). Financial rows are never hard-deleted. Collections are cash only (no online payment); a receipt is issued.
- **President toggles.** Things like sharing renter data with the thana and separate facility funds are per-society settings (`society_settings`), not code branches.
- **Out of scope for v1:** visitor/gate management, online payment, external reporting to RAJUK or City Corporation.
- **Responsive, mobile first.** Most users are on phones, owners on tablets, the office on large screens. Tables become cards on phones. Check layouts at 375, 820 and 1440 px.
- **UI style.** Modern, neutral colours, card-based. Colour and font tokens live in `apps/web/src/app/globals.css` (ported from the design tokens); use the token classes (`bg-surface`, `text-good`, `bg-warn-soft`, ...) rather than raw colours.

## Database workflow

- The schema started SQL-first: `docs/schema-phase1.sql` is the reviewed design, copied unchanged into `packages/db/prisma/migrations/0_init/migration.sql`, and `packages/db/prisma/schema.prisma` was produced from it with `prisma db pull`.
- Because of the pull, model names are the table names (snake_case plural, e.g. `persons`, `user_roles`) and relation fields are named after tables. Keep that naming for consistency unless Anis decides to rename models with `@@map`.
- Some database features cannot be expressed in Prisma and live only in SQL migrations: check constraints, trigram (`pg_trgm`) indexes, `citext`, extensions. Prisma marks affected models with a `///` comment. When changing those tables, create the migration with `prisma migrate dev --create-only`, add the SQL by hand, then apply it.
- On a database that was built directly from the SQL file, mark the baseline once with `prisma migrate resolve --applied 0_init` before running new migrations.
- The Prisma config file is `packages/db/prisma7.config.ts`, not the default `prisma.config.ts`. The `@s57/db` scripts already pass `--config prisma7.config.ts`; add it yourself when calling the Prisma CLI directly.
- After any schema change: `pnpm --filter @s57/db generate`, then `pnpm --filter @s57/db build` so the API picks up the new client from `dist`.
- Local Postgres runs through FlyEnv. Connection strings are in `apps/api/.env` and `packages/db/.env` (see `apps/api/.env.example`). Never commit `.env` files or print their values.
- Every database (dev, test, production) must be **UTF8**, or Bangla text fails with error `22P05`. Postgres on Windows defaults to WIN1252, so create databases explicitly: `CREATE DATABASE <name> TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'und' LOCALE 'C';`. Check an existing one with `select pg_encoding_to_char(encoding) from pg_database where datname = current_database();`.

## Deployment

- One DigitalOcean droplet runs everything: Next.js, NestJS and PostgreSQL, with PM2 and Nginx. No Vercel, no managed database, no Docker.
- No CI yet. Run `pnpm check` before pushing; a `deploy.sh` script is planned. Real CI comes in milestone 2.

## Current state (2026-10-08)

- API: Nest skeleton with `PrismaModule` and a `GET /health` route that queries the database. Auth, RBAC and feature modules are not built yet. Installed but not wired up: CASL, argon2, helmet, throttler, nestjs-pino, nestjs-zod, swagger, cookie-parser.
- Web: Next.js 16 with Tailwind 4 tokens and one preview page. `next-intl`, React Query, react-hook-form, TanStack Table and openapi-fetch are installed but not wired up.
- `packages/shared`: empty placeholder (has a `typecheck` script, no tests yet).
- Setup gaps fixed on 2026-10-08: `.gitignore` (one pattern per line, `.env.example` kept), `migration_lock.toml`, an idempotent `prisma/seed.ts` (society, location levels, permission catalogue, starter roles; no users), `--config prisma7.config.ts` baked into the db scripts, `typecheck` scripts in every package, Bangla site metadata. `pnpm check` passes.
- Still open: there is no git repository in this folder yet, and no first super-admin user (to be created by the auth slice, not the seed). On an existing database built from the SQL file, run `pnpm --filter @s57/db migrate:resolve-baseline` once.

## Reference material

- `docs/schema-phase1.sql`: the full phase-1 schema with design notes in its comments. Read the header before changing the data model.
- `docs/Sector 57 Production UI.html`: the UI mockup. Match its layout and components when building screens.
