# Sector 57 build steps

Status of every step, what it contains, and the decisions still open. Updated 2026-10-11.

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
| – | Docker, CI draft, localhost-only ports | Done | `fix/compose-local-ports` |
| 4 | Auth (phone + password) | Done | `step/04-auth` |
| 5 | Permissions engine and dashboard shell | Done | `step/05-permissions` |
| 6 | Roles and users admin | Done | `step/06-roles-users` |
| 7 | Content CMS and file storage | Done | `step/07-cms` |
| 9 | Property: location tree and units | Done | `step/09-property` |
| 10 | Members | Done | `step/10-members` |
| 3 + 8 | Public member forms and office review | Built, awaiting Codex review | `step/03-forms` |
| 11 | M2: Finance setup (funds, charge types, numbering, settings) | Built, awaiting Codex review | `step/11-finance-setup` |
| 12 | M2: Bills (invoices) and opening arrears | Later | `step/12-bills` |
| 13 | M2: Recurring charges and billing runs | Later | `step/13-recurring` |
| 14 | M2: Cash collection, receipts and handover | Later | `step/14-collect` |
| 15 | M2: Donations | Later | `step/15-donations` |
| 16 | M2: Expenses and budgets | Later | `step/16-expenses` |
| 17 | M2: Fund ledger and finance reports | Later | `step/17-reports` |
| 18 | M2: Overview dashboard | Later | `step/18-overview` |
| 19 | M2 (optional): Resident bills view | Later, needs a decision | `step/19-my-bills` |

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
- `fix/compose-local-ports`: binds the API and database ports to localhost only. Merged (PR #4).

---

## Step 4: Auth (phone + password) — Done

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

## Step 5: Permissions engine and dashboard shell — Done

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

## Step 6: Roles and users admin — Done

Branch `step/06-roles-users`, branched from `step/05-permissions`. Scope confirmed by Anis on 2026-10-10. No schema change.

**Decisions (Anis, 2026-10-10)**
- No invites yet (they need SMS or email): the office creates the user, who gets a random 10-character temporary password, shown once. The account is `active` at once and the user is not forced to change the password. `invited` stays unused.
- Resetting another user's password needs `users.edit`, not a separate permission.

**Rules (enforced by the API, mirrored in the UI)**
- No escalation: without full access, a caller puts into a role (or takes out of it) only permissions they hold for the whole society, and gives (or takes away) a role only if they hold all its permissions over at least that area. A scoped role's society-wide permissions grant nothing, so they don't count (`src/permissions/grant-limits.ts`).
- A caller changes only users whose roles they could have given (`canManage`); a holder of the system role only by another one. Only full access gives or removes the system role.
- The system role is read-only: it can't be edited or deleted.
- Nobody changes their own status or roles, or resets their own password, from the users admin; their own profile (names, email, language) is fine.
- The last active, unscoped holder of the system role can't be disabled or lose it (409 `last_admin`). Through the API this can't happen anyway (only another active full-access user can touch a system holder), so it's a second guard.
- Users are never deleted. Disabling ends their refresh sessions at once; their access token stops working on the next request because the permission check reads the status. A role change applies on the next request.
- A role is deleted only while nobody holds it (409 `role_in_use`).

**Shared**
- `contracts/roles.ts`: `roleInputSchema`, role list and detail, `canGrant` (the UI's copy of the rule).
- `contracts/users.ts`: `USER_STATUSES`, create, update, set-roles and list-query schemas, `userDetailSchema` (with `isSelf` and `canManage`), form options.
- `asciiDigits`, `optionalEmail`, a `short` date style, and the `Admin` messages (module and action labels, roles, users, errors) in `bn.json` and `en.json`.

**API (modules `roles`, `users`; the services write their own audit rows with before and after)**
- `GET /roles` and `GET /roles/:id` need `roles.view`; `POST /roles` needs `roles.create`; `PUT /roles/:id` needs `roles.edit` (the whole role: name, description, matrix; PUT rather than the PATCH in the scope note, because the form always sends everything); `DELETE /roles/:id` needs `roles.delete`.
- `GET /users` (paged; `q` matches name, English name or phone, Bangla digits allowed; `status`, `roleId`), `GET /users/:id`, `GET /users/options` (roles with `grantable`, and non-unit locations for the area picker) need `users.view`.
- `POST /users` needs `users.create`. It answers `{ id, temporaryPassword }` and reuses the `persons` row with the same phone if one exists.
- `PATCH /users/:id` (profile and status), `PUT /users/:id/roles` (keeps unchanged rows, so the grant date and granter stay), `POST /users/:id/reset-password` need `users.edit`.
- Errors: 403 `beyond_your_permissions`, 403 `system_role_protected`, 403 `cannot_change_self`, 409 `role_name_taken`, `role_in_use`, `phone_taken`, `last_admin`, 400 `invalid_assignment`.
- `@CurrentActor()` gives a handler the caller's society, user id, access and IP in one value. `IdParamDto` validates `:id`.

**Web**
- `/dashboard/roles`: the list (system badge, permission and user counts). `/dashboard/roles/new` and `/dashboard/roles/[id]`: name, description and the matrix, grouped like the sidebar, with row and column toggles and a pin on area-bound modules. Cells the caller can't grant are disabled; the system role, and a role holding permissions the caller lacks, are read-only. Delete asks once, inline.
- `/dashboard/users`: search, status and role filters (a plain GET form), a table that becomes cards on phones, paging. `/dashboard/users/new`: profile, roles with areas, then the temporary password with a copy button. `/dashboard/users/[id]`: profile, roles with areas, disable or enable, reset password.
- Pages answer 404 when the user lacks the module's permission (`requirePermission` in `lib/api/session.ts`); server data comes from `lib/api/admin.ts` and reloads with `router.refresh()` after a change.

**Tests**
- Unit: `grant-limits.spec.ts` (area coverage, scoped roles, system role, `canManage`), the shared contracts (`admin.spec.ts`).
- e2e (`test/admin.e2e-spec.ts`): role create, edit and delete with audit rows; duplicate name; no granting what you don't hold; system role protected; role in use; another society's roles and users are 404; the temporary password logs in and isn't in the audit row; duplicate phone; a block manager can give a role only inside their block; nobody touches a user holding more than they do; no self changes; disabling cuts a user off at once and ends their sessions; a role change applies on the next request; reset password ends every session.
- Fixed on the way: three e2e files built the same society slug from `Date.now()` and failed now and then when run in parallel; each file has its own prefix now.

**Checked:** `pnpm check` and the e2e suite pass; all six pages render with real data in Bangla and English (curl as the dev admin). The forms were not clicked through in a browser; that and the 375/820/1440 checks are part of the deferred visual pass.

**Not in this step:** invites, forced password change, a user's session list, the audit log viewer, bulk import of users. The area picker lists nothing until Step 9 builds the location tree.

## Step 7: Content CMS and file storage — Done

Branch `step/07-cms`, branched from `step/06-roles-users`. Scope confirmed by Anis on 2026-10-10. No schema change.

**Decisions (Anis, 2026-10-10)**
- Developments stay JSON in `site_pages` (slug `developments`). A `projects` table comes in milestone 2 if projects are tied to expenses; the JSON can be migrated then.
- One branch for the whole step.
- New dependency `sharp` (image processing, prebuilt for Windows and Linux). `docker-compose.yml` gets a `media` volume.

**File storage (API `src/storage`)**
- `FileStorage` interface (`put`, `delete`) with a local-disk driver under `MEDIA_DIR` (default `apps/api/media`, git-ignored and Docker-ignored). A Spaces driver only needs to implement the interface.
- `MediaService.saveImage`: the upload is checked from its bytes (JPEG, PNG or WebP; anything else 415 `unsupported_image`), turned upright, stripped of EXIF (no GPS position is ever published), resized to at most 1600 px and saved as WebP, plus a 480 px thumbnail `<key>.thumb.webp`. Keys are `<society id>/<gallery|people>/<uuid>.webp`, so they can't collide or be guessed, and only keys starting with the caller's society are ever deleted.
- Uploads are multipart field `file`, one per request, at most 10 MB (413), kept in memory (`IMAGE_UPLOAD` in shared). The permission guard runs before the file is read.
- Serving: the API serves `MEDIA_DIR` at `/media/` when `MEDIA_SERVE` is on (default: on outside production; on in Docker). On the droplet Nginx should serve the folder at `/media/` and `MEDIA_SERVE=false`. `MEDIA_BASE_URL` is now real: `http://localhost:3000/api/media` in dev and Docker (through the web app's `/api` proxy), `https://<domain>/media` on the droplet.
- When a photo is replaced or deleted (including a whole album), its files and thumbnail are deleted after the database change commits. A failed delete is logged, never an error.

**API (all writes record their own audit rows with before and after)**
- Notices (`notices.*`): `GET /notices` (paged; `q` title search, `category`, `status` = `published`/`scheduled`/`internal`), `GET /notices/:id`, `POST /notices`, `PUT /notices/:id` (whole notice), `DELETE /notices/:id`. The body is plain text (line breaks kept, `
` made `
`), never HTML. A future `publishAt` schedules a public notice; `is_public` false keeps it off the website.
- Site pages (`site.view`, `site.edit`): `GET /site-pages/:slug` and `PUT /site-pages/:slug` for `home`, `site` and `developments` only (`EDITABLE_PAGES`). The content is NFC-normalised and trimmed, then checked against the page's schema (400 `validation_failed` with paths like `content.bn.phone`). Saving publishes the page and creates it when missing.
- Committee (`committee.*`): `GET /committee/members` (every term), `GET`, `POST`, `PUT`, `DELETE /committee/members/:id`, `POST` / `DELETE /committee/members/:id/photo`. Adding reuses the society's person with the same phone (their stored names are kept) or creates one; editing changes the linked person's names; removing a seat keeps the person. The portrait is `persons.photo_url`.
- Gallery (`gallery.*`): `GET /gallery/albums` (drafts too), `GET`, `POST`, `PUT`, `DELETE /gallery/albums/:id`; `POST /gallery/albums/:id/photos` (needs `gallery.create`; optional `captionBn`/`captionEn` fields; 409 `album_full` past 300); `PUT /gallery/albums/:id/photo-order` (every photo once, else 400 `invalid_order`); `PATCH` / `DELETE /gallery/photos/:id`. Photos belong to a society through their album. The public album cover now uses the thumbnail.

**Web**
- `/dashboard/notices`: search, category and status filters, the table that becomes cards on phones, paging. `/dashboard/notices/new` and `/dashboard/notices/[id]`: Bangla and English cards, category, "show on the website", publish time in Dhaka time (`datetime-local`), delete.
- `/dashboard/website` with tabs (each shown only with its module's `view`; the sidebar item shows for any of `site`, `committee`, `gallery`):
  - Pages: cards for the three pages, and `/dashboard/website/pages/[slug]` editors. Home and site details have a Bangla card and an English card behind "Add an English version" (English starts as a copy of the Bangla); lists (figures, events, emergency numbers, projects) have add, remove, move up and down. Stored content that no longer matches its schema opens empty with a warning.
  - Committee: seats grouped by term (current and upcoming marked), add and edit inline, standard position or a custom title, portrait upload and removal.
  - Gallery: album cards with cover and draft/published chip, new album inline; the album page has details, delete, and the photo grid (multi-select upload sent one file at a time with progress, captions, move earlier/later, delete; the first photo is the cover).
- After every save a server action (`lib/actions/public-site.ts`) revalidates the `[locale]` layout, so the public site shows the change at once instead of within 60 seconds.
- `lib/api/upload.ts` sends multipart uploads with the CSRF header and the same refresh-and-retry as the typed client. Files are checked for type and size in the browser first.
- Dates and times: the dashboard's `stamp` date style is 24-hour, so Bangla shows `১৬:৩০` rather than "PM".

**Tests**
- Unit: storage keys and path traversal, the local driver, image processing (formats, resizing, no enlarging, EXIF and orientation, fake and truncated files), `MediaService` (thumbnail clean-up, only own keys deleted), `thumbKey`, the env settings, the shared contracts (`cms.spec.ts`).
- e2e (`test/cms.e2e-spec.ts`, uploads into a temporary folder): a scheduled notice stays off the website until its time; an internal one never shows; per-action permissions; another society's notices, seats, albums and photos answer 404 and stay untouched; page content is NFC-normalised, validated with field paths, and shown publicly; seats reuse a person by phone; portraits are stored, replaced and deleted with their files; non-images 415, missing file 400, over 10 MB 413; an upload without permission is refused; albums go from draft to published with ordered, captioned photos and are deleted with their files; audit rows for every write.

**Checked:** `pnpm check`, the e2e suite (92 tests) and `next build` pass. All new pages render with real data in Bangla and English (curl as the dev admin). An upload through the web proxy was resized to 1600 px, stored without EXIF, served at `/api/media/...` and deleted with its album. The forms were not clicked through in a browser; that and the 375/820/1440 checks are part of the deferred visual pass.

**To do on each machine:** add `MEDIA_BASE_URL=http://localhost:3000/api/media` to `apps/api/.env` (see `.env.example`), or uploaded photos show as placeholders.

**Not in this step:** SMS sending and `send_sms`, notice audience by area (after Step 9), the `documents` attachments UI, a Spaces driver, drag-and-drop ordering, rich text, page titles (fixed per page), cleaning up orphaned files left by a crash between upload and save.

## Step 9: Property — Done

Branch `step/09-property`, branched from `step/07-cms`. Scope confirmed by Anis on 2026-10-10.

**Decisions (Anis, 2026-10-10)**
- No spreadsheet import (there is no Excel data yet). Instead an "add many" generator: a name prefix, a number range and optional letters (`Road 1` to `Road 24`, `Flat 1A` to `Flat 6D`), in Bangla or ASCII digits, up to 300 at a time.
- Levels may be skipped: a location may sit at any level deeper than its parent (a plot can hold units directly, a building can hold flats without storeys).
- Migration `3_property` approved: unique `(society_id, path)`; unique top-level names per society (the old unique let null parents repeat); unique holding `code` per society when set; trigram index on `locations.name`.
- Moving a branch to another parent comes later (it changes who can see it, since scope is by path).

**Schema (migration `3_property`)**
- The four indexes above, plus an ICU collation `natural_sort` (`und-u-kn`) on `locations.name`, so `ORDER BY name` gives রোড ১, রোড ২, রোড ১০ (and Road 2 before Road 10). The collation is deterministic, so the unique indexes still work. For Anis: this changes the column's collation (not in the approved list); it needs a Postgres built with ICU (FlyEnv and the Docker image both are).
- `prisma migrate dev` cannot create a shadow database with the dev user, so the SQL was written by hand and applied with `migrate deploy`; `prisma migrate diff` against the schema shows no drift.

**Rules**
- The last level always holds the units. Locations of that level are managed only through `/units` (a `locations` row plus a `units` row, written in one transaction); `/locations` refuses them (404 on change, 400 `invalid_level` on create).
- A new location's level must be deeper than its parent's and not the unit level. Nothing goes under a unit or an inactive location (409 `parent_inactive`).
- Names are unique under one parent (409 `location_name_taken`; a bulk add names the clashes in `details.names` and adds nothing); holding codes are unique in the society (409 `location_code_taken`).
- Delete only an empty location that nothing refers to: 409 `location_has_children`, or `location_in_use` when a role scope, ownership, tenancy, bill or notice points at it. Otherwise make it inactive.
- Levels: names can change; a level in use can't be removed or moved past another level in use; the unit level stays last while it holds units (409 `level_in_use`). Unused levels can be added, removed and moved.
- Scope: a scoped caller's top of the map is their own areas. Breadcrumbs name the ancestors above their area but don't link them. Adding at the top needs `locations.create` for the whole society. Out-of-scope or other-society rows answer 404.
- Unit addresses leave out the society's top-level location when there is exactly one, since every address would start with it.

**Shared (`contracts/property.ts`)**
- `UNIT_TYPES`, `BILL_TO`, `OCCUPANCIES`; level, location node, breadcrumb, location view, create/update/bulk schemas; unit create/update/bulk/list/detail schemas with occupancy counts; `sizeSqftSchema` (decimal string, Bangla digits allowed); `nameRangeSchema` + `expandNames` (the generator); `digitVariants` (search either digit form).
- `Property` messages and the new error codes in `bn.json` / `en.json`.

**API (module `property`; services write their own audit rows with before and after; a bulk add writes one `bulk_create` row on the parent)**
- `GET /location-levels` (any logged-in user), `PUT /location-levels` (`settings.edit`, the whole list).
- `GET /locations` (the top), `GET /locations/:id` (node with counts, breadcrumb, children, what the caller may do there), `POST /locations`, `POST /locations/bulk`, `PATCH /locations/:id`, `DELETE /locations/:id` (`locations.*`).
- `GET /units` (paged; `q` on name or code in either digit form, `areaId`, `unitType`, `occupancy`; `counts` by occupancy ignoring the occupancy filter), `GET /units/:id`, `POST /units`, `POST /units/bulk` (new units start vacant), `PATCH /units/:id`, `DELETE /units/:id` (`units.*`).

**Web**
- `/dashboard/property` and `/dashboard/property/[id]`: breadcrumb, details (name, holding number, active, delete), the children as cards with counts, and the add panel (one or many; locations or units; a preview marks names that already exist and leaves them out). "See its units" links to the filtered units list.
- `/dashboard/property/levels` (`settings.edit`): rename, add, remove and reorder levels.
- `/dashboard/units`: occupancy stat cards, search and filters (a plain GET form), a table that becomes cards on phones, paging, an area filter chip. `/dashboard/units/[id]`: breadcrumb and the unit form. Units are added from the map, inside a location.

**Tests**
- Shared: the generator (prefix, letters, Bangla digits and letters, limits), size parsing, NFC names, bulk duplicates, level input rules, digit variants.
- e2e (`test/property.e2e-spec.ts`): paths and counts, natural order, bulk all-or-none with the clashing names, level depth rules and skipping, unique names and codes, delete refused with children or a role scope, inactive parent, units created and listed with counts and Bangla/ASCII search, unit edit and delete with audit rows, no unit under a unit, Block C manager vs Block D (top, single rows, create, edit, units), another society's rows and levels, permissions, and the level rules (through the service on a separate society, so the shared levels never change while other test files run).

**Checked:** `pnpm check` and the whole e2e suite pass. On the dev database through the web proxy: a sector, two blocks, three roads and three flats added in bulk, then every page loaded in Bangla and English with the data in natural order; the test rows were deleted afterwards. The forms were not clicked through in a browser; that and the 375/820/1440 checks are part of the deferred visual pass.

**Not in this step:** moving a branch, spreadsheet import, location attributes (land area, storeys; the `attributes` column stays `{}`), owners and renters (Step 10, which will also derive occupancy), notice audience by area, live counts on the public home page, the public address dropdowns (Step 3).

## Step 10: Members — Done

Branch `step/10-members`, branched from `step/09-property`. Scope confirmed by Anis on 2026-10-11.

**Decisions (Anis, 2026-10-11)**
- No bulk import (there is no member list yet).
- The move-in/move-out checklist (`moves`) and the resident directory (`directory`) are a follow-up step.
- Migration `4_members` approved (below).
- Occupancy is derived: `rented` while a tenancy is active or moving out; otherwise `owner_occupied` when the unit or a location above it has a current owner; otherwise `vacant`. A pending tenancy (not moved in) doesn't make a unit rented. Household rows don't count. Occupancy can no longer be typed in.

**Words (Anis, 2026-10-11, see `docs/glossary.md`)**
- The page and menu item are "Owners & renters / মালিক ও ভাড়াটিয়া"; people who live in a unit are "Residents / বাসিন্দা"; "Member / সদস্য" is kept for registered society members (Steps 3 + 8: the membership form and approval, and the "Society member" chip on a person's page). Code names (`members` module, route and URL) are unchanged.
- A renter who is a person is added as a resident (head of the renter's household) when the tenancy is created. An owner of the unit or a place above it becomes a resident with "Lives here" (`POST /occupants` with `personId`; any other person by id is 400 `invalid_person`). In the list, an owner or renter who heads that household is shown once.

**Schema (migration `4_members`)**
- `persons.updated_at`; trigram indexes on `persons.full_name_en` and `organisations.name`; a check constraint on `occupants.relation` (fixed keys, labels in i18n); a partial unique index `tenancies_open_unit_uq` (one open tenancy per unit), which replaces the plain `tenancies_unit_idx` on the same rows. Applied with `migrate deploy`; `prisma migrate diff` shows no drift.

**Rules**
- People are stored once per society. Adding an owner, renter or household member types the person; the API reuses the society's person with the same phone, or else the same NID, and keeps their stored details. A phone and NID of two different people is 409 `person_conflict`. Organisations are reused by trade licence, or else by exact name.
- A person has no location. A scoped caller sees a person (or organisation) while they own, rent or live somewhere inside the caller's area (current rows only), and on their page only the rows inside it. Whole-society callers see everyone, including people not linked anywhere (committee, users). `POST /persons` (someone not linked anywhere) is for whole-society roles only (403 otherwise).
- Permissions: people and households use `members`, owners `ownerships`, renters `tenancies`, each checked at the location. Verification needs `members.approve`. The NID number is only sent to callers who may edit the person; the list only says whether one is on file; audit rows record `hasNid` / `nidChanged`, never the number.
- Ownerships sit on any location. Current co-owners' shares add up to at most 100% (409 `shares_over_100`); the same owner twice is 409 `already_owner`. A transfer ends every current row on the date and starts the new owners (history kept). Changes to one location's owners or tenancy lock that location row, so they run one at a time.
- A unit has at most one open tenancy (409 `tenancy_open_exists`). Ending a tenancy ends its household rows. Tenancies and households only sit on units (400 `not_a_unit`). Deleting is for mistakes (a tenancy with household rows is 409 `tenancy_has_occupants`); otherwise end the row.

**Shared (`contracts/members.ts`)**
- `RENTER_TYPES`, `TENANCY_STATUSES`, `OCCUPANT_RELATIONS`, `GENDERS`, `MEMBER_ROLES`; person, organisation and party inputs; NID, share, rent and date parsing (Bangla digits allowed, blank is null); row, list, detail and location-people schemas. `canSocietyWide` in `permissions.ts` (`canGrant` uses it). `Members` messages and the new error codes in `bn.json` / `en.json`.

**API (module `members`; services write their own audit rows with before and after)**
- `GET /members` (paged; `q` fuzzy on names and on phone, NID or licence in either digit form; `role`, `verification`, `areaId`; counts of owners, renter households, bachelor renters and pending verification).
- `POST /persons`, `GET`, `PATCH`, `DELETE /persons/:id`, `PUT /persons/:id/verified`, `POST` / `DELETE /persons/:id/photo`.
- `GET`, `PATCH`, `DELETE /organisations/:id`.
- `POST /ownerships`, `POST /ownerships/transfer`, `PATCH /ownerships/:id`, `POST /ownerships/:id/end`, `DELETE /ownerships/:id`.
- `POST /tenancies`, `PATCH /tenancies/:id`, `POST /tenancies/:id/end`, `DELETE /tenancies/:id`.
- `POST /occupants`, `PATCH /occupants/:id`, `POST /occupants/:id/end`, `DELETE /occupants/:id`.
- `GET /locations/:id/people`: owners (with history), current owners of the places above (inside the caller's area), and a unit's tenancies and household, with what the caller may do.
- `OccupancyService` (property module) re-derives occupancy in the same transaction as every unit, ownership and tenancy change. `TreeService.addressNames` moved there from `UnitsService`.

**Web**
- `/dashboard/members`: the mockup's four stat cards, search, role and verification filters, area chip, the table that becomes cards on phones, paging. "Add member" only for whole-society roles.
- `/dashboard/members/[id]`: details form, verification, photo, delete, and their ownerships, tenancies and households. `/dashboard/members/new`. `/dashboard/members/organisations/[id]`.
- A People panel on `/dashboard/units/[id]` (owners, owners above, the tenancy with status and police form, household; add, transfer, end, delete) and an owners panel on `/dashboard/property/[id]`. The unit form shows occupancy as a chip instead of a select.

**Tests**
- Shared: NID, person cleaning, shares, transfer totals, rent, party kinds, blank dates, a resident by person or id.
- e2e (`test/members.e2e-spec.ts`): occupancy derived from a plot owner, a new unit under an owned plot, an owner marked as living in a flat (and a stranger refused by id), the renter added as a resident and moved out with the tenancy, pending vs active tenancy, ending tenancy and ownership; co-owner shares and duplicates; transfer history and owners above; reuse by phone or by NID in Bangla digits, and the conflict; list search (Bangla, English, phone in Bangla digits with a dash), filters and counts, verification; edit, unique phone, NID kept out of the audit log, delete only when unlinked; Block C manager vs Block D (list, person, location people, tenancy, ownership; no transfer without `ownerships.edit`; no unlinked add); NID only for editors; another society's person and unit; route permissions. The Step 9 tests now expect derived occupancy.

**Checked:** `pnpm check` and the whole e2e suite (121 tests) pass. On the dev servers as the admin: a plot with an owner and a flat with a renter and spouse, then the members list (Bangla and English, area filter), the person page, the unit page and the plot page all rendered with the data; the test rows were deleted afterwards. The forms were not clicked through in a browser; that and the 375/820/1440 checks are part of the deferred visual pass.

**Not in this step:** bulk import, the move-in/out checklist and resident directory (follow-up), picking an existing person from a search box (the phone or NID finds them), owner approval of renters (`owner_approved_at`) and the thana-sharing export, deed and NID document uploads, changing an organisation's contact person after creation.

## Steps 3 + 8: Public member forms and office review — Built, awaiting Codex review

Branch `step/03-forms`, branched from `step/10-members`. Scope confirmed by Anis on 2026-10-11.

**Decisions (Anis, 2026-10-11)**
- Spam protection: rate limits and a honeypot only (no captcha, no OTP; there is no SMS gateway).
- No thana export in this step; `share_renters_with_thana` stays unused.
- Migration `5_forms` approved, including the `memberships` table.
- The four other services on the mockup (vehicle sticker, facility booking, NOC, complaint) are shown as "coming soon".

**Schema (migration `5_forms`)**
- `form_submissions`: `location_id` (area scope), `reference` (unique per society, e.g. `M-7KQ3XP2A`), `phone`, `person_id` (set on approval), `review_note`, `reviewed_at`, `updated_at`; a check on `form_key` (`membership`, `renter_registration`); indexes for the queue, the phone checks and the location.
- `memberships`: `person_id`, `location_id` (the property it was granted for), `member_no` (unique per society), `status` (`active`, `lapsed`, `cancelled`), `joined_on`, `ended_on`, `submission_id`. At most one active membership per person (partial unique index). Applied with `migrate deploy`; `prisma migrate diff` shows no drift.

**Rules**
- **Private files.** Deeds and NID copies go to `PRIVATE_MEDIA_DIR` (default `private-media`, git-ignored, its own compose volume), never under `MEDIA_DIR`; the API refuses to start if one folder is inside the other. `PrivateFilesService` (`src/storage`) checks the bytes: photos are re-encoded like any image, a PDF must start with `%PDF-`, end with `%%EOF` and carry no active content (`/JavaScript`, `/Launch`, embedded files and so on; a basic filter). Files are only read back through `GET /forms/:id/files/:fileId` after a permission check: photos inline, PDFs as a download, `no-store`, and each read is audited. Each file is a `documents` row (`entity_type` `form_submission`, visibility `office`). Milestone 2 expense vouchers can reuse it.
- **Public submit.** No login and no CSRF token (`@SkipCsrf`); the Origin check still runs. The answers are a JSON `data` field checked against the shared schemas (NFC, Bangla digits). A renter must pick an active flat; a member any active place below the whole society. Limits: 5 posts per address per 10 minutes, 3 submissions per phone per day (429 `too_many_submissions`), and the same open application (form, phone, place) only once (409 `already_submitted`). A filled honeypot gets a receipt and nothing is saved. The audit row records the form, reference and place, never the applicant's details.
- **Review.** Module `forms` (location-scoped): `view` for the queue and files, `edit` to start a review (`new` → `in_review`), `approve` to approve or reject. Approving also needs `members.create` (membership) or `tenancies.create` (renter) at the place, and "also record as owner" needs `ownerships.create`. Status changes only happen if the row is still open (409 `form_closed`), so two people can't decide one application twice. The NID only reaches callers with `forms.edit` or `forms.approve`, and the "already on record" matches show NID matches only to them.
- **Approving a membership** finds or adds the person (`PartiesService.resolvePerson`, by phone then NID), refuses someone who is already a member (409 `already_member`), and gives the next member number (per-society transaction lock). With "also record as owner" it adds the ownership through `OwnershipsService.insert` in the same transaction.
- **Approving a renter registration** opens a **pending** tenancy through `TenanciesService.insert` (the renter becomes head of the household), adds the listed household members as new people and residents, and leaves occupancy alone until the office sets the tenancy to active. A flat with an open tenancy refuses it (409 `tenancy_open_exists`). Everything rolls back together on any error.
- `TenanciesService.create` and `OwnershipsService.create` now call `insert(tx, actor, place, input)`, which runs inside a caller's transaction after the place checks.

**Shared (`contracts/forms.ts`)**
- `FORM_KEYS`, `UPCOMING_FORMS`, `FORM_STATUSES`, `HOUSEHOLD_RELATIONS`, `PUBLIC_RENTER_TYPES`, `DOCUMENT_UPLOAD`, `FORM_HONEYPOT`; `membershipFormSchema`, `renterFormSchema`, the receipt, the public place list, the queue, the detail and the review inputs. `MEMBERSHIP_STATUSES` and `membershipSchema` are in `members.ts`; `personDetailSchema` has `membership`. `Forms` messages rewritten, new `FormsAdmin` namespace, `Dashboard.nav.forms`, new error codes.

**API (module `forms`)**
- Public: `GET /public/locations?parentId=` (active children: names and levels only), `POST /public/forms/:formKey` (multipart).
- Office: `GET /forms` (paged; `status`, `formKey`, `areaId`, `q` on reference, name or phone in either digit form; counts per status in the caller's area), `GET /forms/:id`, `GET /forms/:id/files/:fileId`, `POST /forms/:id/review`, `/approve`, `/reject` (a reason is required).

**Web**
- `/forms` replaces the "coming soon" page: the mockup's split view with the six services (two online, four "coming soon"), the chosen form, the receipt with its reference, and the office's contact card. Address dropdowns load level by level from the real tree (a single top place is skipped); the household list adds and removes rows; documents are checked in the browser first. react-hook-form with the shared schemas, and server errors land on their fields.
- `/dashboard/forms`: four status cards, search, status and form filters, area chip, the table that becomes cards on phones, paging. "Applications / আবেদন" sits in the People group of the nav.
- `/dashboard/forms/[id]`: the answers, attached documents (photos shown, PDFs downloaded), people already on record, and the decision panel (start review; approve with owner share and date, or tenancy start and rent; reject with a reason).
- The person page shows "Society member · no. N" when they hold a membership.

**Tests**
- Shared: the two form schemas (NFC, Bangla digits, required NID, no "head" in the household, the household limit) and the review inputs.
- Unit: `processDocument` (PDF kept, photo re-encoded, active PDFs, cut-off PDFs, HTML, SVG, zip), `PRIVATE_MEDIA_DIR` kept apart from `MEDIA_DIR`.
- e2e (`test/forms.e2e-spec.ts`, 21 tests): the dropdowns (natural order, inactive and other-society places hidden); submit with the deed in private storage only, a photo re-encoded, required fields, bad JSON, wrong place kinds, other society's place, bad files saving nothing, the honeypot, duplicate and per-phone limits, the per-address limit, a foreign Origin; the queue, search by reference and Bangla-digit phone, filters; Block C vs Block D (list, detail, file, approve), another society's row, no `forms.view`; NID hidden from viewers; file headers and 401/404; review once; membership approval with owner record and the person page; member numbers in order and a second membership refused with the application left open; renter approval as a pending tenancy with the household, and the open-tenancy conflict rolling back; approve needing the side permission, reject needing a reason, the audit row.

**Checked:** `pnpm check` and the whole e2e suite pass. On the dev servers (API build on 4000, the running web dev server on 3000): `/forms` rendered in Bangla with the six services; a renter registration with a PDF went through the `/api` proxy as multipart (Bangla-digit phone accepted) and a foreign Origin got 403; as the admin, the queue, its filters and the detail page (Bangla and English) rendered; the PDF came back as a `no-store` download (401 without a session); start review and reject worked through the proxy, and reject without the CSRF header was 403. The test rows and file were deleted afterwards. The forms were not clicked through in a browser, and the 375/820/1440 checks are part of the deferred visual pass.

**Not in this step:** SMS to applicants, an applicant status lookup, the other four services, membership fees (milestone 2), the thana export, copying an approved deed onto the person's documents (it stays on the submission, linked through `person_id`), cancelling or lapsing a membership from the dashboard, picking the person to link by hand when the phone and NID match two different people (approval answers 409 `person_conflict`).

---

## Milestone 2: finance — Later

Draft plan, 2026-10-11. Nothing here is confirmed: each step still gets its own scope note, and the decisions marked **(decide)** need Anis before that step starts. The mockup screens are `overview`, `billing`, `collect` (form plus receipt) and the resident app's bills tab; `recurring`, `donations` and `expenses` have no mockup yet, so they follow the `billing` list and `collect` form patterns.

### Goal

The office bills every unit, takes cash at the counter, hands each payer a printed receipt, and the treasurer can show where every taka came from, which fund it sits in and where it went. Built so that the numbers can't be quietly changed afterwards.

### Before milestone 2 starts

- Milestone 1 finished: Steps 3 + 8 merged (Steps 4–10 are, PR #5 and #6), and the deferred 375/820/1440 pass done.
- **Before real money is recorded:** the droplet deploy script, a nightly `pg_dump` copied off the droplet, and one restore tried on a scratch database. Finance rows are the one thing the society can't re-type.
- Steps 3 + 8 add `memberships`; the membership fee (Step 12) bills those.

### Rules for every finance step

- **Money.** `numeric(14,2)` in the database, `Prisma.Decimal` in the API, decimal strings in the shared contracts (`moneySchema`: positive, at most two decimals, Bangla digits allowed, NFC). Never a JS `number`. Totals are summed in SQL. The web formats with the existing `৳` helper.
- **Nothing is deleted.** Finance routes have no `DELETE`. A mistake is voided with a reason, who and when, and the void writes a reversing ledger row. `ledger_entries` is append-only, enforced by a trigger that rejects `UPDATE` and `DELETE` (the migration adds it; a test proves it).
- **Numbers without gaps.** Invoice, receipt and voucher numbers come from a per-society counter row locked in the same transaction as the record, so a failed save gives the number back and two collectors never get the same one.
- **Snapshots.** An invoice stores who it was billed to and the unit address as they were on the day; a receipt stores the payer and what it was for. A reprint years later matches the paper even after the owner changes.
- **Dates.** Calendar dates are Dhaka dates. Billing periods are whole months. The fiscal year starts at `societies.fiscal_year_start_month` (July) and is written `2026-27`.
- **Overdue is derived**, never stored: `unpaid` or `partial` with `due_date` before today in Dhaka.
- **Area scope.** `billing` and `payments` are already location-scoped: an invoice is in scope through its unit's path, and a payment when all the invoices it settles are. A Block C collector neither sees nor collects for Block D. `donations`, `expenses`, `budgets` and `ledger` are society-wide.
- **Two people for money going out.** Nobody approves their own expense (403 `cannot_approve_own`), and a collector's cash handover is confirmed by someone else.
- **Concurrency.** Taking a payment locks the invoices it settles (`FOR UPDATE`); the existing `paid <= total` check is the backstop. A test runs two payments on one invoice at once.
- **Funds.** With `separate_facility_funds` off, only the default fund exists and the UI hides every fund picker. One invoice belongs to one fund (a billing run makes one invoice per unit per fund), so a payment always lands in exactly one fund without splitting.
- **Audit.** Every write records its own audit row with before and after, as in Steps 6–10.
- **Permissions.** The modules already exist (`billing`, `payments`, `donations`, `expenses`, `budgets`, `ledger`, `settings`); no new module is planned. `approve` is used for handover confirmation, expense approval and voids after handover; `export` for CSV downloads.

### What the phase-1 finance schema is missing

The tables in `0_init` are a good base. Reviewing them against the screens shows these gaps; each step's migration adds only its own part, all additive.

| Gap | Proposed addition | Step |
|---|---|---|
| No safe way to number invoices, receipts, vouchers | `document_sequences (society_id, kind, period, next_no)` | 11 |
| Fund balances need an opening figure | `ledger_entries.source_type` gets `opening`; `created_by`; `reverses_id` (points at the row a void reverses) | 11 |
| No record of moving money between funds | `fund_transfers` (from, to, amount, date, memo, by); two ledger rows each | 17 |
| Invoices lose who and where they were billed to | `invoices.bill_to_snapshot jsonb`, `fund_id`, `billing_run_id`, `void_reason`, `voided_at`, `voided_by` | 12 |
| Invoice lines are Bangla-only | `invoice_lines.description_en` (`description` stays the Bangla text) | 12 |
| Billing runs can't be listed or explained | `billing_runs` (period, started by, auto or manual, counts and totals, skipped units) | 13 |
| Schedules can't set a due date or a name | `charge_schedules.name_bn`, `name_en`, `due_days` | 13 |
| Voided payments aren't traceable; payments have no unit | `payments.voided_at`, `voided_by`, `unit_id`, `payer_snapshot`, `note`, `handover_id` | 14 |
| `handed_over_at` can't hold a count, a difference or who confirmed | `cash_handovers` (collector, amount expected, amount counted, confirmed by, confirmed at, note) | 14 |
| Expenses can't be paid, voided or numbered | `expenses.voucher_no`, `created_at`, `paid_at`, `paid_by`, `reject_reason`, `voided_at`, `voided_by`, `void_reason`; status `void` | 16 |
| Donations have no receipt of their own | none: a donation creates a `payments` row (the receipt) with no allocations; the ledger row comes from the donation, not the payment, so it isn't counted twice | 15 |

`payments.method` keeps its check, but the API accepts only `cash` in milestone 2 (online payment is out of scope).

### Step 11: Finance setup — Built, awaiting Codex review

Built 2026-10-11 on `step/11-finance-setup` (branched from `step/03-forms`). Decided by Anis: the number formats below, and ledger rows record the account (`cash` or `bank`).

- **Migration `6_finance_setup`:** `document_sequences`; `funds.closed_at`, `created_at` and one default fund per society (partial unique index); `charge_types.archived_at`; `ledger_entries` gets `opening` as a source, `account` (`cash`/`bank`, default `cash`), `created_by` and `reverses_id` (a row is reversed at most once). A trigger refuses `UPDATE`, `DELETE` and `TRUNCATE` on `ledger_entries`; the only delete it lets through is the cascade from deleting a whole society.
- **Settings** (`/dashboard/settings`, `GET`/`PATCH /settings`, `settings.view`/`edit`): separate facility funds, sharing renters with the thana, fiscal year start month (the `societies` column; locked once the ledger has any entry, 409 `fiscal_year_locked`), receipt header (`receipt_header`, falls back to the society's name and phone). Keys are `SETTING_KEYS` in shared; `PATCH` takes only changed keys and refuses unknown ones. Turning separate funds off needs every other fund closed (409 `funds_open`).
- **Funds** (`/dashboard/settings/funds`, `ledger.*`): `GET /funds` (balances per account from the ledger, the live opening, `openingEditable`), `POST /funds` (only while separate funds are on), `PUT /funds/:id` (rename), `POST /funds/:id/close` (not the default fund, zero in both accounts, no active charge type), `PUT /funds/:id/opening` (date, cash, bank; zero allowed). The opening can be corrected until the fund has any other entry; a correction writes reversing rows, never edits. Not tied to a facility location yet: that comes with the facilities module.
- **Charge types** (`/dashboard/settings/charge-types`, `billing.*`): `GET /charge-types` (with the open funds to pick from), `POST`, `PUT /:id`, `POST /:id/archive` and `/restore`. Reading needs `billing.view` anywhere; changes need a society-wide billing grant (403 `beyond_your_permissions`). With separate funds off only the default fund is accepted (400 `invalid_fund`). Kinds are `due`, `fee`, `fine`.
- **Shared:** `moneySchema` / `moneyOrZeroSchema` / `optionalMoneySchema` (Bangla digits, commas and ৳ accepted, canonical `"4500.00"`), paisa arithmetic on `bigint` (`toPaisa`, `fromPaisa`, `addMoney`, `subtractMoney`, `compareMoney`), `amountInWords` (bn and en, lakh and crore, paisa), `fiscalYearOf` / `fiscalYearStarting`, `documentPeriod` / `formatDocumentNo`.
- **API:** `NumberingService.next(tx, societyId, kind, day)`: `INV-YYMM-NNNN` (restarts monthly), `RC-NNNNN` (never restarts), `EXP-YY-NNNN` (YY is the fiscal year's start year; restarts each fiscal year). `lockFinanceSetup(tx, societyId)` serialises setup changes. All writes record their own audit rows.
- **Seed:** the default fund "সাধারণ তহবিল / General fund" everywhere; service charge, generator fee and membership fee charge types outside production.
- **Nav:** the Settings item shows with `settings`, `ledger` or `billing` view, with a tab for each.
- **Tests:** shared money, words, fiscal year and number tests; `finance.e2e-spec.ts` runs in a throwaway society of its own (ledger rows can't be deleted) and covers the society boundary, area scope, exact paisa (`0.10 + 0.20`), the trigger, concurrent and rolled-back numbering, and no `DELETE` routes.
- **For later steps:** draw numbers only through `NumberingService` inside the saving transaction; write money as `Prisma.Decimal` from decimal strings and read it with `toFixed(2)`; a fund's balance per account is the sum of its `in` minus `out` rows; correct a ledger row only with a reversing row (`reverses_id`). Rows from Steps 14–17 set `account` (cash at the counter is `cash`).

### Step 12: Bills (invoices) and opening arrears

- **Bill-to rule** (shared, tested): if the unit's `bill_to` is `renter` and it has an `active` or `moving_out` tenancy, the renter (person or organisation). Otherwise the current owners of the unit, else of the nearest location above it that has owners; among co-owners the largest share, then the earliest start. Nobody found: the invoice can't be made (400 `no_bill_to`), and the billing run lists the unit as skipped.
- **Manual invoice** (`billing.create`): unit (or a person, for the membership fee), lines from charge types with amount and period, due date. Lines are fixed once issued; a wrong invoice is voided (only while nothing is paid on it, `billing.approve`) and a new one made.
- **Opening arrears:** dues from before the system, entered per unit as an invoice with one "previous dues" line, dated before go-live and marked so reports can tell them apart.
- **Membership fee:** a bill for a person with an active membership (Steps 3 + 8), no unit.
- **API:** `GET /invoices` (paged; `q` on invoice number, unit name or code, bill-to name, either digit form; `status` including derived `overdue`; `areaId`; `period`; counts and totals for the stat cards), `GET /invoices/:id`, `POST /invoices`, `POST /invoices/:id/void`. `GET /units/:id/bills` for the unit page.
- **Web:** `/dashboard/billing` exactly like the mockup: four stat cards (billed, collected, outstanding, earlier arrears), search and status filter, table that becomes cards on phones. `/dashboard/billing/new`, `/dashboard/billing/[id]` (lines, payments against it, void). A Bills panel on `/dashboard/units/[id]` and the person page.
- **Decisions:**
  - **(decide)** How opening arrears get in: typed per unit on the unit page (proposal), or a spreadsheet import if the office has a list by then.
  - **(decide)** Late fees: none automatic in milestone 2 (proposal); the office adds a `fine` line by hand.

### Step 13: Recurring charges and billing runs

- **Schedules** (`/dashboard/recurring`, `billing.*`): charge type, amount, every 1/3/6/12 months or once, area (whole society or a branch), unit types, start and end, due after N days, auto or manual, pause and end.
- **Run:** for one month, every active schedule that is due makes one invoice per unit per fund, with one line per schedule. **Preview first**: units to bill, total by charge, units skipped and why (no bill-to, inactive, already billed). Confirming creates the invoices and a `billing_runs` row. Running twice never bills twice (`invoice_lines_once_uq`, a test proves it).
- **Auto runs:** a daily job (`@nestjs/schedule`, 02:00 Dhaka) runs schedules marked auto whose `next_run_on` has come, under a Postgres advisory lock so a second API process can't run it at the same time. A failed run is logged and shown on the page; nothing half-made is kept (one transaction per run).
- **Web:** schedule list and form; run history with totals; the mockup's "Generate manually" button opens the preview.
- **Decisions:**
  - **(decide)** Amount per unit only (proposal), or also per square foot (`units.size_sqft`)?
  - **(decide)** A unit added or a tenancy started mid-month: billed from the next run (proposal), no part-month amounts.

### Step 14: Cash collection, receipts and handover

The page the office uses most; built from the mockup's `collect` view.

- **Take a payment** (`payments.create`): find the unit or payer (either digit form); their open invoices are listed oldest first and ticked; the amount received fills in and can be lowered, settling invoices in order (the last one may end `partial`). Saving makes the payment, its allocations, updates each invoice's `paid` and status, and writes ledger rows, all in one transaction. "Collected by" is the logged-in user.
- **Receipt:** the mockup's receipt card, with the amount in words, printed from the browser (print CSS; no PDF library). A reprint says "Duplicate / অনুলিপি".
- **Void** with a reason: the collector the same day before handover; after that only `payments.approve`. Voiding reverses the allocations' effect on the invoices and writes reversing ledger rows; the receipt shows "Void" on reprint.
- **Cash in hand and handover:** the mockup's stat cards (receipts today, cash in hand). "Close day and hand over" makes a `cash_handovers` row for the collector's open payments; the treasurer (`payments.approve`, not the collector) types the amount counted and confirms. A difference is recorded with a note, never hidden.
- **API:** `GET /collect/lookup?q=`, `POST /payments`, `GET /payments` (paged; date, collector, voided), `GET /payments/:id`, `POST /payments/:id/void`, `GET /handovers`, `POST /handovers`, `POST /handovers/:id/confirm`.
- **Decisions:**
  - **(decide)** Advance and over-payment. Proposal: no unallocated credit in milestone 2; the amount can't exceed what is ticked. Paying months ahead means the office bills those months first ("bill ahead" on the unit page, from the unit's schedules).
  - **(decide)** Receipt paper: A5 / half A4 with an office counterfoil (proposal), or 80 mm thermal printers.
  - **(decide)** The mockup's SMS receipt needs an SMS provider; proposal: leave it out of Step 14 and add SMS (receipts and notices) as its own step once a provider is chosen.

### Step 15: Donations

- **Record a donation** (`donations.create`): donor (person, organisation or anonymous), fund, purpose, amount. It issues a receipt (a `payments` row with no invoices, same numbering and printing as Step 14) and an `in` ledger row in that fund. Void as in Step 14.
- **List** with totals by fund and purpose, and a donor's history on their person page.
- **Decisions:**
  - **(decide)** A public donor list on the website (opt-in per donation)? Proposal: not in milestone 2.
  - **(decide)** Tie donations and expenses to the development projects? That needs the `projects` table noted in Step 7 (developments are JSON today). Proposal: decide together with Step 16; until then `purpose` is free text.

### Step 16: Expenses and budgets

- **Expense heads and vendors** (`expenses.edit`): simple lists; vendor names stored as typed.
- **Expense flow:** request (`expenses.create`: head, fund, vendor, description, amount, date, voucher photo or PDF through `PrivateFilesService` from Steps 3 + 8, stored as a `documents` row) → approve or reject with a reason (`expenses.approve`, never your own) → pay (`expenses.edit`: voucher number, paid from the fund, `out` ledger row). A paid expense is only voided, with a reversing row.
- **Fund balance check:** paying more than the fund holds is refused (409 `fund_insufficient`), so a fund never goes below zero. **(decide)** refuse (proposal) or only warn.
- **Budgets** (`budgets.*`): an amount per expense head per fiscal year; the page shows budget, approved, paid and remaining, with the overspent heads marked. Over budget warns, never blocks.
- **Web:** `/dashboard/expenses` (tabs: expenses, budget, heads and vendors); the overview's "Needs approval" card links here.
- **Decisions:**
  - **(decide)** Approval limits by amount (for example above ৳50,000 needs the president). Roles are data, so a limit would be a per-role setting; proposal: not in milestone 2, one approver is enough.

### Step 17: Fund ledger and finance reports

- **Ledger** (`ledger.view`): balances per fund (and per account if Step 11 says so), a statement for a date range (opening, in, out, closing), each row linking to its receipt, donation or expense. **Fund transfers** and bank deposits (`ledger.create`, two rows each).
- **Reports** (`/dashboard/reports`, each behind its module's `view`; CSV with `export`, UTF-8 with BOM so Excel reads Bangla):
  - Day book: every receipt and payment for a day, by collector.
  - Collection by area (the mockup's "Collection by block"): billed, collected and percentage per top-level area.
  - Arrears: units with overdue bills, aged 0–30, 31–90, 90+ days; printable as a door-to-door list for one road.
  - Income and expenditure by charge type and expense head for a fiscal year; budget against actual.
- **Decisions:**
  - **(decide)** Add the audit log viewer (`audit.view`) here? Finance is where the committee will want to see who changed what. Proposal: yes, read-only, filters by user, entity and date.

### Step 18: Overview dashboard

Replaces the placeholder `/dashboard` with the mockup's `overview`, each card shown only with its module's `view` and limited to the caller's area:
- Stat cards: collected this month (and % of billed), arrears (units overdue), occupied units of all (from Step 10's derived occupancy).
- Billed against collected, last six months (inline SVG bar chart, token colours, no chart library).
- Collection by area.
- Needs approval: pending expenses, unconfirmed handovers, forms waiting for review (Step 8).
- The mockup's helpdesk and "this week" cards stay hidden until those modules exist; "Open tickets" is replaced by "Pending forms".
- Figures come from one `GET /overview` built from SQL sums, cached briefly; the test checks them against the rows.

### Step 19 (optional): Resident bills

The resident app's bills tab: a logged-in owner or renter sees their own bills and receipts, read-only. It needs residents to have accounts (Step 6 makes users only by hand) and a self-access rule ("bills billed to me or my units") rather than a module grant.
- **(decide)** In milestone 2, or with the rest of the member app later (proposal: later, unless the office wants to stop answering "how much do I owe" calls).

### Tests every finance step adds

- The society boundary and the Block C / Block D area scope on every new route.
- Exact money: sums with paisa, Bangla digit input, no float anywhere (a test pushes `0.10 + 0.20`-style amounts through the API).
- Nothing deletable: no finance `DELETE` routes; the ledger trigger refuses updates and deletes.
- Ledger agrees with the records: after each e2e file, each fund's ledger sum equals receipts plus donations minus paid expenses plus transfers.
- Numbering: concurrent saves get distinct, gap-free numbers.

### Not in milestone 2

Online payment, bank or mobile payment entry, SMS (unless the decision above adds it), automatic late fees, part-month amounts, credit balances, approval limits, the member app beyond Step 19, accounting exports to other software.

### Open decisions, in one place

| Decision | Proposal | Needed before |
|---|---|---|
| Number formats | Decided: `INV-YYMM-NNNN`, `RC-NNNNN`, `EXP-YY-NNNN` | Step 11 |
| Track cash vs bank as well as funds | Decided: yes, `account` on ledger rows | Step 11 |
| Opening arrears entry | Typed per unit | Step 12 |
| Late fees | Manual fine lines only | Step 12 |
| Per square foot rates | No, per unit only | Step 13 |
| Mid-month units and tenancies | From the next run, no part months | Step 13 |
| Advance payments | No credit; bill ahead first | Step 14 |
| Receipt paper | A5 with counterfoil | Step 14 |
| SMS receipts | Separate SMS step once a provider is chosen | Step 14 |
| Public donor list | No | Step 15 |
| `projects` table for developments | Decide with Step 16 | Step 15 |
| Paying more than a fund holds | Refuse | Step 16 |
| Approval limits by amount | No | Step 16 |
| Audit log viewer | Yes, in Step 17 | Step 17 |
| Resident bills view | Later, with the member app | Step 19 |

## Later: beyond milestone 2

These are in the mockup's dashboard nav but not in milestones 1 or 2. Each needs its own plan.

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
- Society settings (`settings`): the finance toggles come in Step 11; module on/off switches later
- Audit log viewer (`audit`): proposed for Step 17; the log itself is written from Step 4/5

**Member app:** the mockup's member-facing view (residents see their own bills, notices and requests).

**Product:** onboarding a second society (society picked by host instead of `DEFAULT_SOCIETY_SLUG`), and the deploy script for the DigitalOcean droplet.

**Out of scope for v1:** visitor and gate management, online payment, reporting to RAJUK or City Corporation.

## Pending chores

- Visual checks at 375, 820 and 1440 px for Steps 0–2 (deferred; use CDP viewport emulation).
- Finish the CI workflow (Anis).
- Update the "Current state" section of `CLAUDE.md`: Steps 1 and 2 are merged and the GitHub remote exists.
