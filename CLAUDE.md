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

- One DigitalOcean droplet runs everything: Next.js, NestJS and PostgreSQL, with PM2 and Nginx. No Vercel, no managed database.
- Docker setup (Anis, 2026-10-08): `Dockerfile` (`api` and web targets), `docker-compose.yml` (Postgres 18, API on 4000, web on 3000) and `.dockerignore`. While the compose stack runs, it holds ports 3000 and 4000, so local `pnpm dev` servers fall back to other ports or fail to bind.
- CI: `.github/workflows/ci.yml` is a draft that Anis owns and is finishing; don't change it unless asked. Until it works, run `pnpm check` before pushing; a `deploy.sh` script is planned.

## Current state (2026-10-11)

- The full step list with status and open decisions is in `docs/steps.md`; keep it updated as steps move.
- Steps 0, 1 and 2 are merged into `main` (GitHub remote `origin`). Visual checks at 375/820/1440 are deferred for all of them. Headless Chrome won't go below about 500 px wide, so use CDP viewport emulation, not `--window-size`.
- Step 1 adds:
  - API: `GET /public/notices` (paged, `?category=`), `GET /public/notices/:id` and `GET /public/pages/:slug` (modules `notices`, `site-pages`; public, read-only, `@SkipThrottle` because every call comes from the Next server). Migration `1_notices_public_idx`.
  - Seed: the `home` and `site` pages are created only if missing, so later edits are never overwritten. Demo notices are seeded only outside production.
  - Web: `(site)` route group with header, nav and footer; pages are cached with `revalidate = 60`.
- Step order changed: after Step 2 comes Step 4 (auth), then 5, 6, 7, 9, 10. Public forms (Step 3) and form review (Step 8) ship together last, once the real location tree exists. Until then `/forms` is a "coming soon" page showing the office contact details from the `site` page.
- Step 2 (committee, developments, gallery) adds:
  - API: `GET /public/committee` (today's members in Dhaka time; only name, position and photo leave the API), `GET /public/gallery` and `GET /public/gallery/:id`.
  - `MEDIA_BASE_URL` (optional) turns stored file keys into URLs. When it's unset they resolve to null, and the site draws `art()` placeholders (`components/site/art.tsx`, all mockup scenes).
  - `@s57/db` now also exports the `Prisma` namespace, for `satisfies Prisma.xSelect`.
- Committee positions are fixed keys (`COMMITTEE_POSITIONS`, labels in i18n). Any other stored text is shown as typed.
- Developments are JSON in `site_pages` slug `developments` (`developmentsContentSchema`), bilingual per field, with money as decimal strings. The home page reads ongoing projects from it. They need a real `projects` table if they are ever tied to expenses.
- Pages prerendered at build time must not fail when the API is down (`next build` in Docker has no API): fall back while `NEXT_PHASE === "phase-production-build"`, and throw at runtime so ISR keeps the last good page.
- Notice categories are fixed keys (`NOTICE_CATEGORIES` in shared); labels live in i18n, and colour and icon in `components/site/notice-category.ts`. Home and footer content is JSON in `site_pages` (`homeContentSchema` and `siteInfoSchema` in shared), stored as `{bn, en?}`.
- API: helmet, nestjs-pino, nestjs-zod global pipe, throttler, cookie-parser and swagger (dev only, `/docs`, JSON at `/docs/json`) are wired up. The env is validated at startup (`src/config/env.ts`), there is a global exception filter, and a `SocietyContext` guard and decorator resolve the society from `DEFAULT_SOCIETY_SLUG`. Routes: `GET /health`, `GET /society`. CASL is installed but unused until Step 5.
- Web: `next-intl` routing (`bn` at `/`, `en` at `/en/`, via `src/proxy.ts`), local Noto Bengali fonts, a theme toggle (saved in `localStorage` key `s57-theme`, otherwise follows the system), a locale switch, mockup components in `src/components/kit`, a dev-only gallery at `/dev/components`, and a typed `openapi-fetch` client (`src/lib/api`). Regenerate its types with `pnpm --filter @s57/web api:types` while the API runs. react-hook-form (with `@hookform/resolvers/zod` and the shared schemas) is used by the auth forms; React Query and TanStack Table are not used yet.
- `packages/shared`: `bn.json`/`en.json` messages, NFC helper, Bangla digits and `৳` formatting, `pick(bn, en)`, zod basics (phone, uuid, pagination) and the society contract, all with Vitest tests.
- Setup gaps fixed on 2026-10-08: `.gitignore` (one pattern per line, `.env.example` kept), `migration_lock.toml`, an idempotent `prisma/seed.ts` (society, location levels, permission catalogue, starter roles; no users), `--config prisma7.config.ts` baked into the db scripts, `typecheck` scripts in every package, Bangla site metadata. `pnpm check` passes.
- Git initialised 2026-10-08. `packages/db/generated` is git-ignored, so a fresh clone must run `pnpm --filter @s57/db generate` before building.
- Step 4 (auth) is built on `step/04-auth`, awaiting Codex review. It adds:
  - Migration `2_auth`: `user_sessions` (refresh tokens stored as SHA-256 hashes) and `users.failed_login_count` / `locked_until`.
  - API `auth` module: `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `GET /me`, `POST /me/password`. Access JWT 60 min (`jose`, HS256, `JWT_SECRET` ≥ 32 chars, required), refresh token 7 days and rotated on every use (an old token coming back revokes the whole family). 4 wrong passwords lock the account for 60 min; unknown phones get identical answers.
  - Every route needs a login unless marked `@Public()` (global `AuthGuard`). The global `CsrfGuard` checks `Origin` against `WEB_ORIGIN` and a double-submit token (`s57_csrf` cookie echoed in `X-CSRF-Token`) on every unsafe method; `@SkipCsrf()` is for pre-login forms only. Cookie and header names are in `AUTH_COOKIES` / `CSRF_HEADER` in shared.
  - Passwords: Node's built-in `crypto.argon2` (argon2id, PHC string format); the `argon2` npm package was removed because it doesn't build on Windows with Node 24.
  - `AuditService` (`src/audit`) writes `audit_logs`. Login events are logged; Step 5 adds the interceptor for all writes.
  - CLI (after `pnpm --filter @s57/api build`): `create-admin` (first super admin, granted the role with `is_system`) and `reset-password` (random 10-character password, logs the user out everywhere). Both prompt, so no secrets end up in the repo.
  - Web: `/login` page, placeholder `/dashboard` (change password, log out). `src/proxy.ts` refreshes an expired session for `/dashboard` before rendering, or redirects to `/login?next=`. The browser API client adds the CSRF header and retries once after a refresh.
- Step 4 is pushed (`step/04-auth`, awaiting Codex review and merge). Step 5 (permissions engine and dashboard shell) is built on `step/05-permissions`, branched from it, awaiting Codex review. Its rules for later steps:
  - Every logged-in route declares `@Can(module, action)` or `@Authenticated()`; anything else is refused. Narrow queries with `scopeWhere(...)`, check single rows with `access.can(action, module, { path })`, and answer 404 for rows out of scope.
  - `locations.path` is `/<root id>/.../<own id>/` (`locationPath` in shared); a scope covers rows whose path starts with its path. Only `LOCATION_SCOPED_MODULES` respect a scope; a scoped role grants nothing on other modules.
  - Writes are audited by the global `AuditInterceptor`; name the entity with `@AuditEntity(...)`, or `@SkipAudit()` when the handler records its own row.
  - New permission modules go in both `PERMISSION_MODULES` (shared) and the seed; the e2e test checks they match.
- Step 6 (roles and users admin) is built on `step/06-roles-users`, branched from `step/05-permissions`, awaiting Codex review. Rules for later steps:
  - Grant limits live in `apps/api/src/permissions/grant-limits.ts`: a caller grants only what they hold society-wide, assigns a role only over an area where they hold all its permissions, and changes only users they could have given every role to. Only full access touches the system role, which is read-only.
  - Services that check grant limits or write their own audit rows take an `Actor` (`@CurrentActor()`: society, user id, access, IP). Validate `:id` with `IdParamDto` (`src/common`).
  - Dashboard pages call `requirePermission(module, action)` (404 otherwise) and load data through `src/lib/api/admin.ts`; module labels for any UI are in `Admin.modules` and the matrix order in `components/admin/modules.ts` (a new module fails to compile until it is placed there).
- Step 7 (content CMS and file storage) is built on `step/07-cms`, branched from `step/06-roles-users`, awaiting Codex review. Rules for later steps:
  - Store uploads only through `MediaService` (`src/storage`): `saveImage(societyId, area, buffer)` checks, re-encodes (WebP, max 1600 px, no EXIF) and keys files `<society>/<area>/<uuid>.webp` with a `.thumb.webp`; `removeQuietly` deletes after the DB change commits. Routes take files with `@ImageUpload()` + `requireUpload(file)`. Non-image documents (Step 3/8) will need their own check next to `processImage`.
  - `MEDIA_DIR`, `MEDIA_SERVE` and `MEDIA_BASE_URL` configure storage; dev needs `MEDIA_BASE_URL=http://localhost:3000/api/media`. On the droplet Nginx serves `MEDIA_DIR` at `/media/`.
  - Dashboard saves that change public content call `refreshPublicSite()` (via `components/cms/use-save.ts`), so the site updates at once.
  - Editable site pages are listed in `EDITABLE_PAGES` / `pageContentSchemas` (shared); a new page needs an entry there and an editor under `components/cms/pages`.
- Step 9 (property: location tree and units) is built on `step/09-property`, branched from `step/07-cms`, awaiting Codex review. Rules for later steps:
  - Module `src/property`: `TreeService` reads the tree (`visible`, `parentFor`, `nodes` with counts, `breadcrumb`). Call `parentFor(access, societyId, parentId, module)` before adding anything under a location.
  - The deepest level holds units: a `locations` row plus a `units` row, written together only through `UnitsService`. A location may sit at any level deeper than its parent (levels can be skipped).
  - `locations.name` uses the ICU collation `natural_sort` (migration `3_property`), so ordering by name is natural for Bangla and ASCII digits. Holding codes and top-level names are unique per society.
  - Searches over names should try both digit forms (`digitVariants` in shared).
- Step 10 (members) is built on `step/10-members`, branched from `step/09-property`, awaiting Codex review. Rules for later steps:
  - `units.occupancy` is derived, never typed: call `OccupancyService.refresh(societyId, path, tx)` (property module) in the same transaction as any change to units, ownerships or tenancies.
  - Add people through `PartiesService.resolve` / `resolvePerson` (reuse by phone, then NID), not `persons.create`. A person's area is where they own, rent or live now (`PartiesService.currentPaths`); check it with `canOnParty`.
  - Never send an NID to a caller who can't edit the person, and never put one in an audit row (`hasNid` only).
  - A renter who is a person is added as a resident (`occupants`, head) when the tenancy is created; owners become residents through "Lives here" (`POST /occupants` with `personId`, allowed only for a current owner at or above the unit, or the tenancy's renter).
- Steps 3 + 8 (public forms and office review) are merged into `main` (PR #7). Rules for later steps:
  - Documents that must not be public (deeds, NID copies, later expense vouchers) go through `PrivateFilesService` (`src/storage`) into `PRIVATE_MEDIA_DIR`, which must stay outside `MEDIA_DIR`, with a `documents` row; serve them only from a permission-checked route, never statically.
  - Approvals that create members data run in one transaction through `TenanciesService.insert` / `OwnershipsService.insert` and `PartiesService.resolvePerson`; change a submission's status only with a conditional update on the open statuses (`form_closed` otherwise).
  - A registered member is a `memberships` row (numbered per society, one active per person); owners, renters and residents are not members.
- Step 11 (finance setup, first milestone 2 step) is merged into `main` (PR #8). Rules for later steps:
  - `ledger_entries` is append-only (trigger, migration `6_finance_setup`): correct with a reversing row (`reverses_id`), never update or delete. Each row records its `account` (`cash` or `bank`). E2e tests that write ledger rows use a throwaway society (`createTestApp([], { DEFAULT_SOCIETY_SLUG })`), since only a society delete can remove them.
  - Draw invoice, receipt and voucher numbers only with `NumberingService.next(tx, ...)` inside the transaction that saves the record.
  - Money crosses the API as decimal strings (`moneySchema` in shared), is written as `Prisma.Decimal` and read with `toFixed(2)`; add it with the paisa helpers (`addMoney`), never JS numbers.
  - Society settings are typed keys (`SETTING_KEYS`); read separate funds with `SettingsService.separateFunds`. Charge type changes need a society-wide billing grant.
- Step 12 (bills and opening arrears) is merged into `main` (PR #9). Rules for later steps:
  - Make bills only through `InvoicesService` (`src/billing`); who a unit's bill goes to is `BillToService.choose` (rule `pickBillTo` in shared). A bill keeps `bill_to_snapshot`, `fund_id` (one fund per bill) and `kind` (`regular`, `opening`, `membership`); lines carry `position`.
  - Bills are area-scoped through their unit's path; a membership bill has no unit and needs a society-wide billing grant. `overdue` is derived, never stored.
  - Lines never change after issue. A bill is voided (reason, who, when) only while nothing is paid; anything that changes `paid` locks the bill row `FOR UPDATE` first.
- Step 13 (recurring charges and billing runs) is built on `step/13-recurring`, branched from `main`, awaiting Codex review. Rules for later steps:
  - Schedules (`SchedulesService`) and runs (`BillingRunsService`) live in `src/billing`; both take `lockBillingRun(tx, societyId)` first. Period maths and area rates are the pure helpers in shared `contracts/schedules.ts` (`duePeriods`, `nextRunAfter`, `resumeFrom`, `rateFor`).
  - A run writes everything in one transaction (bills via `createMany`, numbers via `NumberingService.reserve`); inside a transaction, run queries one after another and avoid nested relation selects (they load in parallel on the one connection and trip pg's deprecation warning).
  - The nightly job (`BillingRunsJob`, 02:00 Dhaka) bills `auto` schedules for every society and is off when `NODE_ENV=test`.
- Step 14 (cash collection, receipts, handover) is built on `step/14-collection`, branched from `step/13-recurring`, awaiting Codex review. Rules for later steps:
  - Take money only through `PaymentsService` (`src/payments`): it locks the bills `FOR UPDATE`, settles them oldest first (`allocate` in shared), writes one `in` ledger row per fund and the payer snapshot. A payment is area-scoped through `payments.unit_id`; one with no unit needs a society-wide grant.
  - A void reverses the bills' `paid` and the ledger rows, never deletes; after the day or once handed over it needs `payments.approve`. Handovers are confirmed by someone other than the collector.
  - Printable documents go in `PrintSheet` (`components/print`); the print CSS in `globals.css` shows only that, on A5, in light colours.
- Still open: on an existing database built from the SQL file, run `pnpm --filter @s57/db migrate:resolve-baseline` once.

## Reference material

- `docs/glossary.md`: what Person, Owner, Renter, Resident and Member mean, in Bangla and English. User-facing text must follow it ("Member" is reserved for registered society members).

- `docs/schema-phase1.sql`: the full phase-1 schema with design notes in its comments. Read the header before changing the data model.
- `docs/Sector 57 Production UI.html`: the UI mockup. Match its layout and components when building screens.
