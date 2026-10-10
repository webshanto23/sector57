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
| 6 | Roles and users admin | Built, awaiting Codex review | `step/06-roles-users` |
| 7 | Content CMS and file storage | Built, awaiting Codex review | `step/07-cms` |
| 9 | Property: location tree and units | Built, awaiting Codex review | `step/09-property` |
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

## Step 6: Roles and users admin — Built, awaiting Codex review

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

## Step 7: Content CMS and file storage — Built, awaiting Codex review

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

## Step 9: Property — Built, awaiting Codex review

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
