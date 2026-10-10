# Sector 57 build steps

Status of every step, what it contains, and the decisions still open. Updated 2026-10-10.

Status key: **Done** (merged to `main`) · **Next** · **Planned** · **Later** (after milestone 1).

## How a step runs

1. Claude posts a short scope note (screens, endpoints, files, any schema addition). Anis confirms.
2. Claude builds it on a branch `step/NN-name` as one vertical slice: API, shared contracts and web.
3. Done means `pnpm check` passes and every new endpoint has a test that proves the `society_id` boundary. From Step 4 on, a test also proves area scope (a Block C user can't read Block D). The visual checks at 375, 820 and 1440 px are deferred and will be done in one pass later.
4. Codex reviews, debugs and tests. Claude fixes what Codex finds.
5. Anis approves and merges. The next step starts only after that.

Schema changes are additive and need Anis's approval first.

## Overview

| # | Step | Status | Branch |
|---|------|--------|--------|
| 0 | Foundations | Done | `step/00-foundations` |
| 1 | Public site shell, home and notices | Done | `step/01-public-site` |
| 2 | Committee, developments and gallery | Done | `step/02-committee-gallery` |
| – | Docker, CI draft, localhost-only ports | Done (`fix/compose-local-ports` not merged yet) | `fix/compose-local-ports` |
| 4 | Auth (phone + password) | Pushed, awaiting Codex review and merge | `step/04-auth` |
| 5 | Permissions engine and dashboard shell | Built, awaiting Codex review | `step/05-permissions` |
| 6 | Roles and users admin | Planned | `step/06-roles-users` |
| 7 | Content CMS and file storage | Planned | `step/07-cms` |
| 9 | Property: location tree and units | Planned | `step/09-property` |
| 10 | Members | Planned | `step/10-members` |
| 3 + 8 | Public member forms and office review | Planned (last in milestone 1) | `step/03-forms` |
| M2 | Billing, cash collection, receipts, finance | Later | — |

The step numbers are names, not the build order. Order changed on 2026-10-08: Steps 3 and 8 moved to the end so the forms use the real location tree (Step 9) and the file storage from Step 7, and residents submit while the office reviews in the same release.

---

## Step 0: Foundations — Done

- **Monorepo:** pnpm + Turborepo; `apps/api` (NestJS 12), `apps/web` (Next.js 16), `packages/db` (Prisma 7), `packages/shared`.
- **Database:** schema from `docs/schema-phase1.sql` as migration `0_init`; databases must be UTF8. Idempotent seed: society, location levels, permission catalogue, starter roles (no users).
- **Shared:** `bn.json` / `en.json`, NFC helper, Bangla digits and `৳` formatting, `pick(bn, en)`, zod basics (phone, uuid, pagination), society contract, Vitest tests.
- **API:** helmet, nestjs-pino, nestjs-zod pipe, throttler, cookie-parser, swagger (dev only, `/docs`), env validation, global exception filter, `SocietyContext` (society from `DEFAULT_SOCIETY_SLUG`). Routes `GET /health`, `GET /society`.
- **Web:** `next-intl` (Bangla at `/`, English at `/en/`), Noto Bengali fonts, theme toggle, locale switch, mockup kit components (`src/components/kit`), dev gallery at `/dev/components`, typed `openapi-fetch` client.

## Step 1: Public site shell, home and notices — Done

- **API:** `GET /public/notices` (paged, `?category=`), `GET /public/notices/:id`, `GET /public/pages/:slug`. Public, read-only, `@SkipThrottle`. Migration `1_notices_public_idx`.
- **Web:** `(site)` route group with header, nav, mobile nav and footer; home and notices pages; `revalidate = 60`.
- **Content:** home and footer content is JSON in `site_pages` (`homeContentSchema`, `siteInfoSchema`). Notice categories are fixed keys (`NOTICE_CATEGORIES`).
- **Seed:** `home` and `site` pages only if missing; demo notices only outside production.

## Step 2: Committee, developments and gallery — Done

- **API:** `GET /public/committee` (today's members in Dhaka time; only name, position, photo), `GET /public/gallery`, `GET /public/gallery/:id`.
- **Developments:** JSON in `site_pages` slug `developments` (`developmentsContentSchema`); the home page reads ongoing projects from it.
- **Media:** optional `MEDIA_BASE_URL`; without it the site draws `art()` placeholders.
- **Build safety:** prerendered pages fall back during `next build` when the API is down, and throw at runtime so ISR keeps the last good page.
- **Extra:** `/forms` shows "coming soon" with the office contact details.

## Infrastructure — Done

- `Dockerfile` (`api` and web targets), `docker-compose.yml` (Postgres 18, API 4000, web 3000), `.dockerignore`.
- `.github/workflows/ci.yml` is a draft Anis owns.
- `fix/compose-local-ports`: binds the API and database ports to localhost only. Pushed, not merged.

---

## Step 4: Auth (phone + password) — Built, awaiting Codex review

Branch `step/04-auth`. Scope confirmed by Anis on 2026-10-10 and built the same day. Two changes from the scope note:
- The secret is `JWT_SECRET` (the name `.env.example` already used), not `AUTH_JWT_SECRET`.
- Passwords use Node's built-in argon2id (`crypto.argon2`, Node 24.19) instead of the `argon2` package, whose Windows build fails. Hashes use the standard `$argon2id$…` format, so any argon2 library can read them.

**Decisions (Anis, 2026-10-10)**
- Access token lasts 60 minutes. The refresh token lasts 7 days and is replaced on every use, so 7 days without opening the site means logging in again.
- Lock the account for 60 minutes after 4 wrong passwords in a row; the login form shows how many attempts are left. After the lock ends the user gets 4 attempts again.
- Password reset: only the super admin resets a password, to a random one. The user is **not** forced to change it. SMS OTP comes later.

**Schema (migration `2_auth`, additive, needs approval)**
- New table `user_sessions`: `id`, `society_id`, `user_id`, `token_hash` (SHA-256 of the refresh token, unique), `family_id`, `expires_at`, `created_at`, `last_used_at`, `ip_address`, `user_agent`, `revoked_at`.
- New columns on `users`: `failed_login_count smallint not null default 0`, `locked_until timestamptz`.

**API: new `auth` module**
- `POST /auth/login` `{ phone, password }`:
  - Only `active` users can log in. The user must belong to the request's society.
  - Wrong password: `401` with `attemptsLeft`. Fourth wrong password: `423` with `lockedUntil`. A correct password resets the counter.
  - Unknown phones get the same responses as known ones, and the password check takes the same time (a dummy argon2 check runs), so nobody can probe which phones have accounts.
  - Throttled per IP as well, against one IP trying many phones.
- `POST /auth/refresh`: swaps the refresh token for a new one. If an old, already-used refresh token comes back (a sign it was stolen), every session in that login chain is revoked.
- `POST /auth/logout`: revokes the session and clears the cookies.
- `GET /me`: id, phone, name, language. Roles and permissions are added in Step 5.
- `POST /me/password` `{ currentPassword, newPassword }`: users change their own password (the way to replace a random one). Other sessions are logged out.
- **Tokens:** the access token is a JWT (HS256, `jose`) carrying user, society and session id; secret in `JWT_SECRET` (at least 32 characters, required; the API refuses to start without it). Disabling a user or resetting a password revokes their refresh sessions at once; an access token already issued still works until it expires (up to 60 minutes).
- **Cookies:** `httpOnly`, `SameSite=Lax`, `Secure` in production. The browser reaches the API through the same-origin `/api` rewrite, so the cookies are first-party.
- **CSRF:** on POST/PUT/PATCH/DELETE, the `Origin` header must be in `WEB_ORIGIN`, plus a double-submit token (readable `csrf` cookie echoed in an `X-CSRF-Token` header).
- **Default deny:** a global auth guard; routes open to everyone are marked `@Public()` (the existing `/public/*`, `/health`, `/society`, login and refresh).
- **Passwords:** argon2id (19 MiB memory, 2 passes), 8–128 characters, NFC-normalised.
- **Audit:** `audit_logs` rows for `login`, `login_failed`, `locked`, `logout`, `password_change`, `password_reset`, with IP. Passwords and tokens are never logged.

**CLI (no secrets in the repo; the password is typed at a hidden prompt)**
- `pnpm --filter @s57/api create-admin`: asks for name, phone and password, creates the `persons` row, an `active` user and the grant of the protected system role (found by `is_system`, not by name).
- `pnpm --filter @s57/api reset-password`: asks for a phone, sets a random 10-character password (no look-alike characters), prints it once and logs the user out everywhere. Step 6 puts the same function behind a "Reset password" button on the user details page.

**Shared**
- zod contracts: `loginSchema`, `changePasswordSchema`, `meSchema`, the login error shapes.
- Login and account strings in `bn.json` / `en.json`.

**Web**
- `/login` (and `/en/login`), styled with the mockup's cards and tokens: phone and password fields, attempts left and lock time shown in Bangla digits, `noindex`. Uses react-hook-form with the shared schema.
- The site nav's "Log in" button (from the mockup) links to `/login`.
- `src/proxy.ts` protects `/dashboard`: no valid access token but a refresh cookie → it refreshes and continues; otherwise it redirects to `/login?next=…`.
- A placeholder `/dashboard` page ("Logged in as …", change password, log out). The real dashboard shell is Step 5.

**Tests**
- Unit: password hashing, lockout counting and expiry, refresh rotation and reuse detection, CSRF guard, cookie options.
- e2e:
  - Login sets cookies; wrong passwords count down; the fourth locks with `423`; the lock lifts after 60 minutes.
  - Unknown phones get the same responses as known ones.
  - A disabled user can't log in.
  - Refresh rotates the token, and reusing an old one revokes the chain.
  - Logout ends the session.
  - `/me` without a token gets `401`.
  - A token for another society is rejected.
  - Public routes still work without logging in.

**Not in this step:** SMS OTP, forced password change, "remember me", permissions and the sidebar (Step 5), user admin screens and the reset button (Step 6).

**Known limits (for later steps)**
- The unknown-phone counter lives in the memory of one API process. Running PM2 in cluster mode would need it moved to the database.
- In Docker, the API sees the web container's address instead of the visitor's, so the per-IP login limit is shared by everyone. On the droplet (Nginx → Next → API on loopback) it sees the real visitor.
- The web proxy helpers (`src/lib/session-proxy.ts`, `src/lib/safe-next.ts`) have no unit tests because the web app has no test runner yet; the flow was checked end to end with curl.

## Step 5: Permissions engine and dashboard shell — Built, awaiting Codex review

Branch `step/05-permissions`, branched from `step/04-auth`. Scope confirmed by Anis on 2026-10-10. No schema change.

**Decisions (Anis, 2026-10-10)**
- The protected system role (`is_system`, unscoped) has full access through the flag, so modules added later need no re-grant.
- A role limited to an area grants nothing on society-wide modules (`settings`, `users`, `roles`, `committee`, `notices`, `documents`, `site`, `gallery`, `donations`, `expenses`, `budgets`, `ledger`, `audit`). Area-bound modules: `locations`, `units`, `members`, `ownerships`, `tenancies`, `forms`, `billing`, `payments` (`LOCATION_SCOPED_MODULES` in shared).
- Mockup nav items with no permission module yet (staff, facilities, work orders, helpdesk, vehicles, events, voting, board, certificates, reports) are hidden. Overview is shown to every logged-in user.

**Shared**
- `PERMISSION_MODULES`, `PERMISSION_ACTIONS`, `LOCATION_SCOPED_MODULES`, `accessSchema`, `meWithAccessSchema`, `canAnywhere`.
- `locations.path` format, fixed here for Step 9: the ids from the root down to the location itself, each followed by `/` (`locationPath(parentPath, id)`), so a row is inside a scope when its path starts with the scope's path.

**API (`src/permissions`, `src/audit`)**
- `AbilityService.load` reads the caller's grants in one query; a disabled user (or a role or scope from another society) gets nothing at once, even with a valid access token. `CallerAccess` wraps a CASL ability and is built once per request.
- Global `PermissionsGuard` after the CSRF guard: a logged-in route needs `@Can(module, action)` or `@Authenticated()`; with neither it is refused (403 `forbidden`). `/me` is `@Authenticated()`.
- Handlers narrow queries with `scopeWhere(access, action, module, prefix => where)` (`{}` for the whole society, an OR of path prefixes otherwise, an empty OR when nothing is allowed) and check single rows with `access.can(action, module, { path })`. Out-of-scope rows should answer 404, like missing ones.
- `GET /me` adds `access: { fullAccess, grants[] }` (scoped grants on society-wide modules are left out). The login response is unchanged.
- Global `AuditInterceptor`: every successful POST/PUT/PATCH/DELETE by a logged-in user writes an `audit_logs` row (action from the method or `@AuditEntity(type, action)`, id from the response or `:id`). `@SkipAudit()` for handlers that record their own row; the auth routes do.

**Web**
- `/dashboard` layout: the mockup's `.dash` frame (1440 px) with the `DNAV` sidebar: 248 px with groups above 1180 px, icons only from 861 to 1180 px, a sideways strip at 860 px and below. Only items the user may `view` appear (`components/dashboard/nav.ts`).
- `/dashboard` (overview placeholder), `/dashboard/[section]` (the mockup placeholder card; 404 when the user may not open it), `/dashboard/account` (who is logged in, change password). The header shows the user (links to the account page) and log out.
- `getMe()` is cached per request and returns `MeWithAccess`.

**Tests**
- Unit: `CallerAccess` (system role, scoped and unscoped grants, adding up roles, unresolved scopes, unknown catalogue rows, regex-safe paths), `scopeWhere`, the guard's default deny and per-request caching, the audit interceptor.
- e2e (`test/permissions.e2e-spec.ts`, with a test-only controller): a Block C user sees Block C and below but not Block D (list and single row); an unscoped user and the system role see all; a scope or role from another society grants nothing; a disabled user is cut off; a route without `@Can` is refused even for full access; `/me` lists the grants; writes leave audit rows and refused writes don't; the seeded catalogue equals the shared constants.

**Not in this step:** role and user admin screens (Step 6), real dashboard pages, overview figures (milestone 2), a mobile drawer (the phone layout is the mockup's scrolling strip).

## Step 6: Roles and users admin — Planned

- **Roles:** list, create, edit, with a permission matrix (module × action). The system role stays protected.
- **Users:** create or invite, assign roles with an optional area scope, disable.

**Open decision:** "invite" needs SMS or email delivery. Until then, should the office create the user with a temporary password?

## Step 7: Content CMS and file storage — Planned

- Storage interface: local disk now, DigitalOcean Spaces later. Sets `MEDIA_BASE_URL` for real.
- Notices CRUD with publish date and public flag.
- Site page editor (home, site info, developments), Bangla and English.
- Committee terms and members.
- Gallery albums and photo upload (resizing, file type and size limits).

**Open decision:** keep developments as JSON, or give them a `projects` table now? A table is needed if projects will ever be tied to expenses in milestone 2.

## Step 9: Property — Planned

- Location levels config per society (`location_levels`).
- Location tree browser and editor (the mockup's `property` view): sector > block > road > plot > building > storey > unit.
- Units list and editor (`units`, the mockup's `units` view).

**Open decision:** bulk import of the existing blocks, roads and plots (CSV or spreadsheet), or enter them by hand?

## Step 10: Members — Planned

- Persons, ownerships (with history), tenancies and occupants.
- The mockup's `members` view: stats, trigram search, filters, and a table that becomes cards on phones.
- If time allows: the `moves` (move-in and move-out) and `directory` (resident directory) views.

**Open decision:** bulk import of the current member list?

## Steps 3 + 8: Public member forms and office review — Planned (last)

- **Step 3, public submit:** membership and renter registration (the mockup's `forms` view). Block > road > plot > flat dropdowns from `locations`. Saved to `form_submissions`, validated with a shared zod schema, rate-limited, NFC-normalised. Uploads use the Step 7 storage. Replaces the "coming soon" page.
- **Step 8, office review:** a queue of `new`, `in_review`, `approved`, `rejected` in the mockup's "Needs approval" style. Approving a membership request creates or links the person.

**Open decisions:**
- Spam protection on the public form (captcha, phone OTP, or rate limit only).
- Does the president's "share renter data with thana" setting (`society_settings`) need an export in this step?

---

## Later: milestone 2 and beyond

These are in the mockup's dashboard nav but not in milestone 1. Each needs its own plan.

**Milestone 2: finance** (cash only, receipts issued, money as `numeric(14,2)`, no hard deletes)
- Overview dashboard (`overview`)
- Bills and invoices (`billing`)
- Cash collection and receipts (`collect`)
- Recurring charges (`recurring`)
- Donations (`donations`)
- Expenses and budget (`expenses`), including separate facility funds if the president turns that on

**Operations**
- Staff and HRM (`hrm`)
- Facilities and assets (`facilities`)
- Work orders (`work`)
- Helpdesk (`helpdesk`)
- Vehicles and stickers (`vehicles`)

**Community**
- Notices and SMS (`noticesd`), adding SMS sending to the Step 7 notices
- Events and AGM (`events`)
- Elections and voting (`voting`)
- Community board (`board`)

**Records and administration**
- Documents (`documents`)
- Certificates and NOC (`certs`)
- Reports (`reports`)
- Society settings (`settings`), the per-society president toggles
- Audit log viewer (`audit`); the log itself is written from Step 4/5

**Member app:** the mockup's member-facing view (residents see their own bills, notices and requests).

**Product:** onboarding a second society (society picked by host instead of `DEFAULT_SOCIETY_SLUG`), and the deploy script for the DigitalOcean droplet.

**Out of scope for v1:** visitor and gate management, online payment, reporting to RAJUK or City Corporation.

## Pending chores

- Visual checks at 375, 820 and 1440 px for Steps 0–2 (deferred; use CDP viewport emulation).
- Merge `fix/compose-local-ports`.
- Finish the CI workflow (Anis).
- Update the "Current state" section of `CLAUDE.md`: Steps 1 and 2 are merged and the GitHub remote exists.
