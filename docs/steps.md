# Sector 15 build steps

Status of every step, what it contains, and the decisions still open. Updated 2026-10-24. Steps through 27 are merged into `main`; Steps 28 and 29 await Codex review.

Status key: **Done** (merged to `main`) · **Built, awaiting review** (on its branch, waiting for Codex and Anis) · **Next** · **Planned** · **Later** (not yet in a milestone) · **Deferred** (moved to a later list on purpose).

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
| 3 + 8 | Public member forms and office review | Done | `step/03-forms` |
| 11 | M2: Finance setup (funds, charge types, numbering, settings) | Done | `step/11-finance-setup` |
| 12 | M2: Bills (invoices) and opening arrears | Done | `step/12-bills` |
| 13 | M2: Recurring charges and billing runs | Done | `step/13-recurring` |
| 14 | M2: Cash collection, receipts and handover | Done | `step/14-collection` |
| 15 | M2: Donations | Done | `step/15-donations` |
| 16 | M2: Expenses and budgets | Done | `step/16-expenses` |
| 17 | M2: Fund ledger and finance reports | Done | `step/17-reports` |
| 18 | M2: Overview dashboard | Done | `step/18-overview` |
| 19 | M2 (optional): Resident bills view | Later, needs a decision | `step/19-my-bills` |
| 20 | Move-in/out checklists and resident directory | Done | `step/20-moves-directory` |
| 21 | Documents library | Done | `step/21-documents` |
| 22 | M3: Staff and attendance | Done | `step/22-staff` |
| 23 | M3: Facilities and assets | Done | `step/23-facilities` |
| 24 | M3: Helpdesk and work orders | Done | `step/24-helpdesk` |
| 25 | M3: Vehicles, stickers and parking | Done | `step/25-vehicles` |
| 26 | M3: Payroll | Done | `step/26-payroll` |
| 27 | M3: Bills for several units, printing bills together | Done | `step/27-bulk-bills` |
| 28 | Records: Certificates and NOCs | Built, awaiting review | `step/28-certificates` |
| 29 | Records: Occupancy, members and renter-list reports | Built, awaiting review | `step/29-records-reports` |
| 30 | A4 bill print to the mock (`docs/mocks/sector57-bill-a4-8rows.png`) | Planned, decisions open | `step/30-bill-a4` |
| 31 | Payment methods on every money entry (cash, bank, cheque, mobile) | Built, awaiting review | `step/31-payment-methods` |

The step numbers are names, not the build order. Order changed on 2026-10-08: Steps 3 and 8 moved to the end so the forms use the real location tree (Step 9) and the file storage from Step 7, and residents submit while the office reviews in the same release.

---

## Step 0: Foundations — Done

- **Monorepo:** pnpm + Turborepo; `apps/api` (NestJS 12), `apps/web` (Next.js 16), `packages/db` (Prisma 7), `packages/shared`.
- **Database:** schema from `docs/schema-phase1.sql` as migration `00_init`; databases must be UTF8. Idempotent seed: society, location levels, permission catalogue, starter roles (no users).
- **Shared:** `bn.json` / `en.json`, NFC helper, Bangla digits and `৳` formatting, `pick(bn, en)`, zod basics (phone, uuid, pagination), society contract, Vitest tests.
- **API:** helmet, nestjs-pino, nestjs-zod pipe, throttler, cookie-parser, swagger (dev only, `/docs`), env validation, global exception filter, `SocietyContext` (society from `DEFAULT_SOCIETY_SLUG`). Routes `GET /health`, `GET /society`.
- **Web:** `next-intl` (Bangla at `/`, English at `/en/`), Noto Bengali fonts, theme toggle, locale switch, mockup kit components (`src/components/kit`), dev gallery at `/dev/components`, typed `openapi-fetch` client.

## Step 1: Public site shell, home and notices — Done

- **API:** `GET /public/notices` (paged, `?category=`), `GET /public/notices/:id`, `GET /public/pages/:slug`. Public, read-only, `@SkipThrottle`. Migration `01_notices_public_idx`.
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

**Schema (migration `02_auth`, additive, needs approval)**
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
- Migration `03_property` approved: unique `(society_id, path)`; unique top-level names per society (the old unique let null parents repeat); unique holding `code` per society when set; trigram index on `locations.name`.
- Moving a branch to another parent comes later (it changes who can see it, since scope is by path).

**Schema (migration `03_property`)**
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
- Migration `04_members` approved (below).
- Occupancy is derived: `rented` while a tenancy is active or moving out; otherwise `owner_occupied` when the unit or a location above it has a current owner; otherwise `vacant`. A pending tenancy (not moved in) doesn't make a unit rented. Household rows don't count. Occupancy can no longer be typed in.

**Words (Anis, 2026-10-11, see `docs/glossary.md`)**
- The page and menu item are "Owners & renters / মালিক ও ভাড়াটিয়া"; people who live in a unit are "Residents / বাসিন্দা"; "Member / সদস্য" is kept for registered society members (Steps 3 + 8: the membership form and approval, and the "Society member" chip on a person's page). Code names (`members` module, route and URL) are unchanged.
- A renter who is a person is added as a resident (head of the renter's household) when the tenancy is created. An owner of the unit or a place above it becomes a resident with "Lives here" (`POST /occupants` with `personId`; any other person by id is 400 `invalid_person`). In the list, an owner or renter who heads that household is shown once.

**Schema (migration `04_members`)**
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

## Steps 3 + 8: Public member forms and office review — Done

Branch `step/03-forms`, branched from `step/10-members`. Scope confirmed by Anis on 2026-10-11.

**Decisions (Anis, 2026-10-11)**
- Spam protection: rate limits and a honeypot only (no captcha, no OTP; there is no SMS gateway).
- No thana export in this step; `share_renters_with_thana` stays unused.
- Migration `05_forms` approved, including the `memberships` table.
- The four other services on the mockup (vehicle sticker, facility booking, NOC, complaint) are shown as "coming soon".

**Schema (migration `05_forms`)**
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

## Milestone 2: finance — Done

Steps 11–18 are done and merged; Step 19 (resident bills) waits for the member app. Below is the plan as drafted on 2026-10-11, kept for its decisions; each step's own section says what was built. The mockup screens are `overview`, `billing`, `collect` (form plus receipt) and the resident app's bills tab; `recurring`, `donations` and `expenses` have no mockup yet, so they follow the `billing` list and `collect` form patterns.

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

The tables in `00_init` are a good base. Reviewing them against the screens shows these gaps; each step's migration adds only its own part, all additive.

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

`payments.method` keeps its check, but the API accepts only `cash` in milestone 2 (online payment is out of scope). Step 31 opened it up: every money entry records its method (still no gateway).

### Step 11: Finance setup — Done

Built 2026-10-11 on `step/11-finance-setup` (branched from `step/03-forms`). Decided by Anis: the number formats below, and ledger rows record the account (`cash` or `bank`).

- **Migration `06_finance_setup`:** `document_sequences`; `funds.closed_at`, `created_at` and one default fund per society (partial unique index); `charge_types.archived_at`; `ledger_entries` gets `opening` as a source, `account` (`cash`/`bank`, default `cash`), `created_by` and `reverses_id` (a row is reversed at most once). A trigger refuses `UPDATE`, `DELETE` and `TRUNCATE` on `ledger_entries`; the only delete it lets through is the cascade from deleting a whole society.
- **Settings** (`/dashboard/settings`, `GET`/`PATCH /settings`, `settings.view`/`edit`): separate facility funds, sharing renters with the thana, fiscal year start month (the `societies` column; locked once the ledger has any entry, 409 `fiscal_year_locked`), receipt header (`receipt_header`, falls back to the society's name and phone). Keys are `SETTING_KEYS` in shared; `PATCH` takes only changed keys and refuses unknown ones. Turning separate funds off needs every other fund closed (409 `funds_open`).
- **Funds** (`/dashboard/settings/funds`, `ledger.*`): `GET /funds` (balances per account from the ledger, the live opening, `openingEditable`), `POST /funds` (only while separate funds are on), `PUT /funds/:id` (rename), `POST /funds/:id/close` (not the default fund, zero in both accounts, no active charge type), `PUT /funds/:id/opening` (date, cash, bank; zero allowed). The opening can be corrected until the fund has any other entry; a correction writes reversing rows, never edits. Not tied to a facility location yet: that comes with the facilities module.
- **Charge types** (`/dashboard/settings/charge-types`, `billing.*`): `GET /charge-types` (with the open funds to pick from), `POST`, `PUT /:id`, `POST /:id/archive` and `/restore`. Reading needs `billing.view` anywhere; changes need a society-wide billing grant (403 `beyond_your_permissions`). With separate funds off only the default fund is accepted (400 `invalid_fund`). Kinds are `due`, `fee`, `fine`.
- **Shared:** `moneySchema` / `moneyOrZeroSchema` / `optionalMoneySchema` (Bangla digits, commas and ৳ accepted, canonical `"4500.00"`), paisa arithmetic on `bigint` (`toPaisa`, `fromPaisa`, `addMoney`, `subtractMoney`, `compareMoney`), `amountInWords` (bn and en, lakh and crore, paisa), `fiscalYearOf` / `fiscalYearStarting`, `documentPeriod` / `formatDocumentNo`.
- **API:** `NumberingService.next(tx, societyId, kind, day)`: `INV-YYMM-NNNN` (restarts monthly), `RC-NNNNN` (never restarts), `EXP-YY-NNNN` (YY is the fiscal year's start year; restarts each fiscal year). `lockFinanceSetup(tx, societyId)` serialises setup changes. All writes record their own audit rows.
- **Seed:** the default fund "সাধারণ তহবিল / General fund" everywhere; service charge, generator fee and membership fee charge types outside production.
- **Nav:** the Settings item shows with `settings`, `ledger` or `billing` view, with a tab for each.
- **Tests:** shared money, words, fiscal year and number tests; `finance.e2e-spec.ts` runs in a throwaway society of its own (ledger rows can't be deleted) and covers the society boundary, area scope, exact paisa (`0.10 + 0.20`), the trigger, concurrent and rolled-back numbering, and no `DELETE` routes.
- **For later steps:** draw numbers only through `NumberingService` inside the saving transaction; write money as `Prisma.Decimal` from decimal strings and read it with `toFixed(2)`; a fund's balance per account is the sum of its `in` minus `out` rows; correct a ledger row only with a reversing row (`reverses_id`). Rows from Steps 14–17 set `account` (cash at the counter is `cash`).

### Step 12: Bills (invoices) and opening arrears — Done

Built 2026-10-11 on `step/12-bills` (branched from `main` after PR #8). Decided by Anis: earlier arrears are typed per unit; late fees are manual `fine` lines only.

- **Migration `07_bills`:** `invoices` gets `kind` (`regular`, `opening`, `membership`), `fund_id` (required; earlier rows get the default fund), `membership_id`, `bill_to_snapshot jsonb`, `void_reason`, `voided_at`, `voided_by`. Checks: exactly one payer (person or organisation); a membership bill has a membership and no unit, every other bill a unit; a void bill has its reason, time and user, and nothing else does. At most one non-void opening bill per unit (partial unique index). `invoice_lines` gets `description_en` and `position` (line order on the bill). `billing_run_id` waits for Step 13.
- **Bill-to rule** (`pickBillTo` in shared, unit-tested): the renter when the unit bills its renter and the tenancy is `active` or `moving_out`; otherwise the current owners of the unit, else of the nearest location above that has any; among co-owners the largest share, then the earliest start. Nobody: 400 `no_bill_to`. The API side is `BillToService` (`src/billing`), batched for lists.
- **API** (`billing.*`, area-scoped through the unit's path; membership bills have no unit, so only a society-wide billing role sees or makes them):
  - `GET /invoices`: paged, newest first. `q` matches the bill number, unit name or code, or bill-to name (snapshot), in either digit form. Filters: `status` (stored statuses or derived `overdue`), `kind`, `areaId`, `month` (issue month), `unitId`, `personId`, `organisationId`. `totals` for the stat cards (billed and count, collected, outstanding, overdue count, earlier arrears and units), summed in SQL within the caller's area and the area, month, unit and payer filters; earlier arrears ignore the month.
  - `GET /invoices/:id` (lines, fund, who made it, the void, `can.void`).
  - `POST /invoices`: `unitId` or `personId` (membership fee, needs an active membership: 400 `no_membership`), due date, optional months covered (`periodFrom`, `periodTo`), 1 to 20 lines. Dated today (Dhaka). All lines must pay into one fund (400 `mixed_funds`); archived charge types are refused (400 `charge_type_archived`); a blank line description takes the charge type's name. Inactive units are refused (400 `unit_inactive`).
  - `POST /invoices/opening`: unit, `asOf` (today or earlier), charge type, amount, optional note. One line "আগের বকেয়া / Earlier arrears", dated and due on `asOf`, so it is overdue at once. 409 `opening_exists` while a non-void one exists.
  - `POST /invoices/:id/void` (`billing.approve` on the unit, a reason): only while `unpaid` with nothing paid (409 `invoice_has_payments`, `already_void`). The row is locked first, so a Step 14 payment can't slip in between.
  - `GET /billing/lookup?q=|unitId=` (`billing.create`): units in the caller's create area with who the bill would go to and whether earlier arrears exist, plus active members for society-wide callers.
  - The planned `GET /units/:id/bills` became the `unitId` / `personId` / `organisationId` filters on `GET /invoices`, so the scope rules live in one query.
  - Numbers come from `NumberingService` (`INV-YYMM-NNNN`, by the bill's date). Every write records its own audit row. No `DELETE` routes.
- **Web:** `/dashboard/billing` as in the mockup (four stat cards, search, status, kind and month filters, table that becomes cards on phones); `/dashboard/billing/new` (find a unit or member, see who the bill goes to, lines with the charge types' usual amounts, months, due date; `?unitId=` starts with that unit); `/dashboard/billing/[id]` (bill-to and unit as billed, lines, totals, void with a reason). A Bills panel on the unit, person and organisation pages; on a unit page it also offers "Bill this unit" and the earlier-arrears form.
- **Tests:** shared bill-to, overdue, period and input tests; `billing.e2e-spec.ts` runs in a throwaway society and covers the society boundary, Block C / Block D scope (list, read, create, void, lookup), co-owner choice, renter billing, the owner above, `no_bill_to`, exact paisa and Bangla digits, the snapshot surviving a name change, funds, membership bills, concurrent numbering, opening arrears once per unit, totals against the rows, voiding rules and the database void check.
- **For later steps:** a payment (Step 14) locks the bills it settles (`FOR UPDATE`), raises `paid` and moves the status to `partial` or `paid`; it never touches lines. Bills are never deleted; a billing run (Step 13) sets `kind = 'regular'` and fills `schedule_id` on lines.

### Step 13: Recurring charges and billing runs — Done

Built 2026-10-11 on `step/13-recurring` (branched from `main` after PR #9 and #10). Decided by Anis: fixed amounts with **rates by area** (the society's charges differ by building; rent itself stays between owner and renter and is not billed), no per-square-foot rates, units and tenancies that start mid-month are billed from the next run (no part months).

- **Migration `08_billing_runs`:** `charge_schedules` gets `name_bn` (required; earlier rows take the charge type's name), `name_en`, `due_days` (0 to 365, default 15) and `updated_at`, plus an index on due active schedules. New `charge_schedule_rates` (schedule, location, amount above zero; one per schedule and location). New `billing_runs` (month as its first day, `manual` or `auto`, `done` or `failed` with the error, who started it, start and finish, bill count, total, skipped units as JSON). `invoices.billing_run_id`.
- **Rules** (pure helpers in shared, unit-tested): periods are whole months; `next_run_on` is the first day of the next period to bill. A run for a month bills every period from `next_run_on` up to that month, oldest first (missed months are caught up), one line per period, then moves the schedule on; a one-off bills once and ends; nothing after the end month. A unit pays the rate of the nearest location on its path that has one (the unit itself first), else the schedule's amount. Resuming a paused schedule skips the paused months, keeping its rhythm.
- **Schedules** (`/dashboard/recurring`; reading needs `billing.view`, changes a society-wide billing grant, 403 `beyond_your_permissions`): `GET /schedules`, `POST`, `PUT /:id`, `POST /:id/pause`, `/resume`, `/end`. A new schedule starts this month or later (400 `start_in_past`; dues from before are earlier arrears). The area and each rate's location must be the society's (400 `location_not_found`) and rates must sit inside the area (400 `rate_outside_scope`). Once it has made bills, its charge type, frequency and first month are fixed (409 `schedule_in_use`). Ended schedules can't change (409 `schedule_ended`). Never deleted.
- **Runs** (society-wide billing roles): `GET /billing-runs/preview?month=` (writes nothing: bills, lines, total, per schedule its months and whether it is blocked by an archived charge type or closed fund, the first 500 lines with the bill-to and where the rate came from, and the units left out with the reason: `no_bill_to`, `inactive`, `already_billed`), `POST /billing-runs` (`month` this month or earlier, 400 `future_month`), `GET /billing-runs` (history). A run is one transaction under the society's run lock (`lockBillingRun`, also taken by schedule changes): one bill per unit and fund, one line per schedule and period (text "name (month)" in both languages), dated today and due after the smallest `due_days` among its lines, bill-to as on the day, numbers reserved as a block (`NumberingService.reserve`). A second run at the same time waits and then finds nothing due; `invoice_lines_once_uq` is the backstop. An unexpected error rolls everything back and is recorded as a failed run.
- **Automatic runs:** `@nestjs/schedule`, every night at 02:00 Dhaka (`BillingRunsJob`), every society, only `auto` schedules, missed months included; a society with nothing due gets no run row; off in tests.
- **Web:** `/dashboard/recurring` (schedule cards with charge, rate, area rates, frequency, area, unit types, months, next bill; add and edit form with the area picker and a rates-by-area editor; pause, resume, end; run history with failures explained) and `/dashboard/recurring/run` (month, summary, per-unit lines with their rate, units left out, confirm). The billing page's "Generate manually" opens the run page.
- **Tests:** shared month, catch-up, resume, rate and input tests; `billing-runs.e2e-spec.ts` in a throwaway society covers permissions (scoped roles can't manage or run, but see the bills a run made in their area), rates by building and block, unit types and areas, skip reasons, one bill per unit and fund with exact paisa, running twice, two runs at once, catch-up on an automatic run, already-billed periods, a failed run leaving nothing behind, pause and resume, and the edit rules.
- **Not done:** a voided bill keeps its schedule line, so a run won't bill that unit and period again; the office makes a manual bill instead.

### Step 14: Cash collection, receipts and handover — Done

Built 2026-10-11 on `step/14-collection` (branched from `step/13-recurring`). Decided by Anis: no credit or over-payment (paying ahead means billing those months first, "Bill ahead"); receipts on A5 with an office counterfoil; no SMS (its own step once a provider is chosen).

- **Migration `09_payments`:** `payments` gets `unit_id` (null only for a membership fee), `payer_snapshot`, `note`, `voided_at`, `voided_by`, `handover_id`, `print_count`. Checks: at most one payer (Step 15 donations may be anonymous); a void has its reason, time and user, and nothing else does. New `cash_handovers` (collector, payment count, expected (frozen when confirmed), counted, note, confirmed by and at); checks that nobody confirms their own and that the confirm fields come together. Indexes for cash in hand, by date, unit, payer, handover, and `payment_allocations` by bill.
- **Rules** (pure helpers in shared `contracts/payments.ts`, unit-tested): `allocate` settles the ticked bills oldest first (due date, bill date, number), so only the last can end `partial`; more than they owe is refused (`amount_exceeds_due`, no credit), and so is an amount that doesn't reach every ticked bill (`bill_not_reached`). `statusAfterPayment`, `collectorMayVoid`.
- **API** (module `src/payments`; `payments.*`, area-scoped through the payment's unit; a membership fee has no unit, so only a society-wide collector takes or sees it):
  - `GET /collect/lookup?q=|unitId=|personId=` (`payments.create`): units in the caller's area by name, code, or who their open bills went to (name or phone, either digit form), and members (society-wide only, by name, phone or number), each with open bills oldest first, what is due and the possible payers (the bills' bill-tos).
  - `GET /collect/summary`: the caller's receipts today, cash in hand, pending handovers, and the receipt header for the live preview.
  - `POST /payments`: one unit's or one member's ticked bills, the amount (Bangla digits fine), the payer (one of the bills' bill-tos, 400 `invalid_payer`), a note. One transaction: bills locked `FOR UPDATE` in id order and checked again (409 `invoice_changed` if one was paid or voided meanwhile), allocations, `paid` and status, `RC-NNNNN`, payer snapshot, one `in` ledger row per fund (`cash`), audit. Only `cash`.
  - `GET /payments` (paged; `from`/`to` Dhaka days, `collectorId` or `me`, `status`, `unitId`, `personId`, `invoiceId`, `inHand`, `q`; totals in SQL), `GET /payments/:id` (allocations with the bills' lines, header, `can.void`).
  - `POST /payments/:id/print`: counts the print; the first is the original, every later one a duplicate.
  - `POST /payments/:id/void` (reason): the collector on the same Dhaka day while the cash is still with them; otherwise `payments.approve` there (403 `void_needs_approval`). Lowers `paid` and resets each bill's status, keeps the allocations, writes reversing ledger rows on the void day.
  - `GET /handovers`, `GET /handovers/:id`, `POST /handovers` (all the caller's cash in hand; 400 `nothing_to_hand_over`), `POST /handovers/:id/confirm` (`payments.approve` over every payment in it; never the collector, 403 `cannot_confirm_own`; a count that differs needs a note, 400 `note_required`; freezes the expected amount and stamps `handed_over_at`). A collector sees their own handovers; an approver those whose payments all lie in their area. A void while a handover waits lowers its expected amount (the void locks the handover row).
  - **Bill ahead** (`src/billing`, `billing.create` on the unit): `GET /units/:id/bill-ahead?month=` (preview) and `POST` (this month up to 12 ahead, 400 `bill_ahead_range`; 400 `nothing_to_bill`). Bills the unit's active schedules (manual and auto) from their `next_run_on` up to that month, one bill per fund, lines with `schedule_id`, under `lockBillingRun`. Schedules don't move on: a later run skips those months for this unit as `already_billed`. Shares the run's planning and invoice writing (`BillingRunsService.plan` with a unit, `writeInvoices`).
  - `GET /invoices/:id` now lists its receipts and carries the receipt header for printing.
- **Web:** `/dashboard/collect` (the mockup's split: find a unit or member, open bills ticked oldest first, amount fills in and can be lowered with the effect on each bill shown, payer, note, the live receipt; stat cards for receipts today and cash in hand; "Close day and hand over"; today's receipts; `?unitId=` / `?personId=` start there). "Save and print receipt" opens `/dashboard/collect/receipts/[id]?print=1`, which prints once. `/dashboard/collect/receipts` (filters, totals, cards on phones) and `/[id]` (receipt, settled bills, print and reprint, void). `/dashboard/collect/handovers` (waiting first; the confirm form shows the difference as it is typed). Bill pages get "Print bill", their receipts and "Take payment"; the unit's Bills panel gets "Take payment" and "Bill ahead".
- **Printing:** `PrintSheet` portals the document under `<body>`; `@media print` in `globals.css` hides everything else, sets A5 and forces the light colours. The receipt prints the payer's copy, a cut line and the office counterfoil with signature lines, "Duplicate / অনুলিপি" from the second print and "Void / বাতিল" when void. The bill prints in the same layout with "pay in cash at the office" and a "Void" mark for void bills. Both follow the page language.
- **Tests:** shared allocation, status, void-rule and input tests; `payments.e2e-spec.ts` in a throwaway society covers lookup scope and search, oldest-first allocation with partial, ledger rows per fund, the payer snapshot surviving a name change, exact paisa, every refusal, membership fees (society-wide only), two payments on one bill at once, gap-free concurrent receipt numbers, list scope and totals, original then duplicate prints, no delete routes, void by the collector and by an approver, handover (not your own, a difference needs a note, a void inside a pending one), the ledger matching the receipts, and bill ahead followed by a run that skips those months.
- **For later steps:** a donation (Step 15) makes a `payments` row with no allocations and no unit, through the same numbering and receipt; its ledger row comes from the donation. Every ledger write sets `account`. Change a bill's `paid` only with the bill locked `FOR UPDATE`.
- **Not checked yet:** the A5 print preview in a real browser, and the save, print, void and handover flow clicked through by hand; the 375/820/1440 pass stays deferred.
- **Also on this branch (2026-10-11, Anis):**
  - **Society profile.** The society is Sector 15. Its name, logo badge and place line now come only from the database: `societies.name_bn/en` plus the `branding` setting (`brandingSchema`; the badge defaults to the number in the name). `GET /society` returns them, `PATCH /settings` takes `profile` (`settings.edit`; drops the society cache), and receipts and bills carry `header.mark`. Settings has a "Society profile" card with a preview. The web reads them with `getBrand(locale)` for the header, footer, tab title and home page; i18n keeps only a neutral `fallbackName` for when the API is down. The seed adds the place line "উত্তরা, ঢাকা" if missing.
  - **Login loop.** A token that is unexpired but refused by the API (session revoked, another `JWT_SECRET`) used to bounce between `/login` and `/dashboard`. The dashboard now redirects to `/login?ended=1`, where the proxy clears the auth cookies.
  - **Docker web build.** Turborepo's strict env mode hid the `API_URL` build arg from `next build`, so the web image proxied `/api` to itself. `turbo.json` now declares `API_URL` on `build`.

### Step 15: Donations — Done

Built 2026-10-12 on `step/15-donations` (branched from `step/14-collection`). Decided by Anis: no public donor list in milestone 2; `purpose` stays free text until the `projects` decision in Step 16; a walk-in donor with a name is added as a person (reused by phone).

- **Migration `10_donations`:** `donations.payment_id` required and unique (every donation has its receipt); at most one donor (person or organisation; neither is anonymous); indexes by date, donor and fund. Nothing else is added: who took the cash, the donor as on the day (`payer_snapshot`), the note and the void live on the receipt.
- **How it books:** a donation writes one `donations` row, one `payments` row as its receipt (`RC-NNNNN` from the same series, no unit, no allocations, `payer_snapshot` null when anonymous) and one `in` ledger row (`source_type = 'donation'`, `cash`). The receipt writes no ledger row, so nothing counts twice. The cash is in the collector's cash in hand and goes into their normal handover.
- **API** (`src/donations`, `donations.*`, society-wide):
  - `GET /donations/options` (`create`): open funds (only the default while separate funds are off), the 20 most used earlier purposes, the receipt header.
  - `GET /donations/donors?q=` (`create`, at least 2 characters): persons by name (either digit form) or phone, organisations by name. Name and phone only.
  - `POST /donations` (`create`): donor `person` / `organisation` (this society's, else 400 `donor_not_found`), `new` (name, optional English name and phone, through `PartiesService.resolvePerson`, so a known phone reuses that person) or `anonymous`; `fundId` (omitted: the default fund; 400 `invalid_fund`, 409 `fund_closed`); purpose (inner spaces collapsed so the same words group); amount; note.
  - `GET /donations` (`view`): paged; `q` (receipt no., donor name or phone, purpose), `from`/`to`, `fundId`, `purpose` (exact), `personId`, `organisationId`, `status`. Totals in SQL: count, amount, void count, named donors, by fund, by purpose. `summary`: this month and this fiscal year (amount, count, donors). `cash`: the caller's own cash in hand and pending handovers.
  - `GET /donations/:id` (`view`) with its receipt (`PaymentDetail`); `POST /donations/:id/print` counts prints like Step 14.
  - `POST /donations/:id/void` (reason): the collector on the same Dhaka day while the cash is still with them, otherwise `donations.approve` (403 `void_needs_approval`). Voids the receipt, reverses the ledger row, lowers a pending handover's expected amount.
- **Changes to Step 14:** receipts carry `kind` (`bills` or `donation`), a nullable `payer` (anonymous) and `donation` (id, purpose, fund). `POST /payments/:id/void` refuses a donation's receipt (409 `use_donation_void`). Handovers are open to whoever takes donations: listing and reading need `payments.view` or `donations.create`, handing over `payments.create` or `donations.create`. Confirming still needs `payments.approve`, society-wide for a handover holding donations (they have no unit). `PaymentsService.receipt` / `countPrint` serve a receipt to a page that has already checked its own permission.
- **Web:** `/dashboard/donations` (stat cards for this month, the fiscal year and donors; the clerk's cash in hand with "Close day and hand over"; search, dates, fund and status filters; the list as cards on phones; totals by fund and by purpose that filter the list), `/dashboard/donations/new` (donor on record, new person or anonymous; fund only with separate funds; purpose with suggestions; live receipt; "Save and print receipt"; `?personId=` / `?organisationId=` start with that donor), `/dashboard/donations/[id]` (receipt, print and reprint, fund and purpose, void). A Donations panel on person and organisation pages. Receipts print "দানের রসিদ / Donation receipt" with the purpose and fund in place of bills; the receipts list tags them "Donation"; the handovers page is reachable from Donations.
- **Tests:** shared input tests; `donations.e2e-spec.ts` in a throwaway society covers one ledger row per donation and none from the receipt, exact paisa and Bangla digits, anonymous, organisation and new donors (reused by phone), the snapshot surviving a name change, the fund rules, refusals, gap-free concurrent numbers shared with bill receipts, donor lookup (no NID, either digit form), list totals against the rows, the society boundary, receipts visible only society-wide, no void through `/payments`, prints, no delete route, void by the collector and after the day by an approver, a handover with donations (void inside it, confirm), the ledger matching the donations and the database checks.
- **Not checked yet:** the pages clicked through in a browser and the A5 print preview; the 375/820/1440 pass stays deferred.
- **For later steps:** the ledger agrees with receipts for bills (`source_type = 'payment'`) plus donations (`'donation'`); a donation receipt has no allocations, so anything that sums `payments` for billing must exclude `kind = donation` (join `donations`).

### Step 16: Expenses and budgets — Done

Built 2026-10-12 on `step/16-expenses` (branched from `step/15-donations`). Decided by Anis: paying more than a fund holds is refused; no approval limits by amount; no `projects` table yet (expenses group by head, donations keep a free-text purpose); voucher numbers are drawn at payment; voucher files are optional, with a "No voucher" mark.

- **Migration `11_expenses`:** heads and vendors get `archived_at` and `created_at`; `expenses` gets `created_at`, `updated_at`, `rejected_by`/`_at`/`reject_reason`, `voucher_no` (unique per society), `paid_at`, `paid_by`, `paid_account` (`cash`/`bank`), `voided_at`/`_by`/`void_reason`, and status `void`. Checks keep each status's fields together, refuse approving or rejecting your own request and payment details without a payment. `budgets` gets `updated_at`, `updated_by`.
- **Flow** (rule `expenseActions` in shared, unit-tested): `pending` → `approved` or `rejected` (`expenses.approve`, never your own: 403 `cannot_approve_own`; a reason to reject) → `paid` (`expenses.edit`). The requester or an `edit` holder changes a pending request. Paying runs under `lockFinanceSetup` with the expense row locked: refuses a closed fund (409 `fund_closed`) or more than the fund holds in the chosen account (409 `fund_insufficient`), draws `EXP-YY-NNNN`, writes one `out` ledger row (`source_type = 'expense'`). Voiding (`expenses.approve`) takes an approved or paid expense (409 `expense_not_voidable`); a paid one gets a reversing `in` row. No `DELETE` routes.
- **Vouchers:** photos or PDFs through `PrivateFilesService` (area `expenses`), checked by `processDocument`, stored as `documents` rows (`entity_type = 'expense'`, `doc_type = 'voucher'`), at most 10 per expense, served only from `GET /expenses/:id/vouchers/:documentId` (`expenses.view`, `private, no-store`). Added until rejected or void (a bill may arrive after payment); removed only before payment (409 `expense_voucher_locked`).
- **API** (`src/expenses`, society-wide): `GET /expenses/options` (heads, vendors, funds; `view` or `create`), `GET /expenses` (status, head, fund, vendor, dates, `requestedBy=me`, `q` over description, vendor and voucher no.; totals without rejected and void; stat cards for pending, approved, paid this month and fiscal year), `GET /expenses/:id` (every step, vouchers, the fund's balance for whoever may pay, the head's budget line, the voucher header, `can`), `POST /expenses`, `PATCH /:id`, `POST /:id/approve`, `/reject`, `/pay`, `/void`, voucher upload and remove. Heads (`/expense-heads`) and vendors (`/vendors`): add, rename, archive, restore (`expenses.edit`; 409 `expense_head_name_taken`). Budgets: `GET /budgets?year=` and `PUT /budgets` (`budgets.*`; zero clears a head; 400 `invalid_year`).
- **Budgets:** an expense counts in the fiscal year of the day it was spent; per head the budget, approved but unpaid, paid, what is left and the percent used (`budgetFigures` in shared). Archived heads show only with a budget or spending that year. Over budget only warns (also on the approve panel).
- **Web:** `/dashboard/expenses` with tabs Expenses, Budget, Heads and vendors (each shown only with its permission; the nav item also shows with `budgets.view`). The list has stat cards that filter, filters, and cards on phones. `/dashboard/expenses/new` (request form), `/dashboard/expenses/[id]` (amount, head, fund, vendor, budget line, history, vouchers, edit, approve or reject, pay with each account's balance, void, and an A5 payment voucher with "Prepared by", "Approved by" and the receiver's signature). `/dashboard/expenses/budget` (year picker, totals, a bar per head, edit amounts) and `/dashboard/expenses/setup`.
- **Seed:** demo heads (staff salaries, repairs, electricity, cleaning) outside production.
- **Tests:** shared flow-rule, budget and input tests; `expenses.e2e-spec.ts` in a throwaway society covers heads and vendors, request → approve → pay with the ledger row and balance, approving your own, the requester's edits, rejection, an empty account, a closed fund, other societies' heads and funds, two payments racing for one fund's money, gap-free voucher numbers, voids with and without a reversal, bad input, vouchers (PDF stored and served only to viewers, other files refused, removal rules, a late bill), list totals against the rows, the society boundary, no delete routes, budgets against the rows, the ledger matching paid expenses and the database checks.
- **Not checked yet:** the pages clicked through in a browser and the A5 voucher print preview; the 375/820/1440 pass stays deferred.
- **Known gap:** voiding a receipt or donation (Steps 14–15) after its cash was spent can leave a fund below zero; those voids don't check the balance. Step 17's ledger shows such a fund in red.

### Step 17: Fund ledger and finance reports — Done

Built 2026-10-12 on `step/17-reports` (branched from `step/16-expenses`). Decided by Anis (the scope note's proposals): income is on a cash basis with a "billed" column beside it; a part-paid bill's payment settles its lines in their order (`position`); the door-to-door arrears list prints on A4; voiding a transfer needs `ledger.approve`, with no time limit; the audit log viewer ships here, in one branch.

- **Migration `12_fund_transfers`:** `fund_transfers` (from fund and account, to fund and account, amount > 0, date, memo, who, void fields). Checks refuse a transfer that moves nothing and keep the void fields together; a trigger refuses deletes (except when the society goes) and any change but the one void. Two indexes on `audit_logs` (by user, by entity type, newest first) for the viewer.
- **Transfers** (`src/ledger`, society-wide): `POST /ledger/transfers` (`ledger.create`) moves money between funds or between a fund's cash and bank (a deposit is cash → bank in one fund, a withdrawal bank → cash). It runs under `lockFinanceSetup`, refuses a closed or unknown fund (409 `fund_closed`, 400 `invalid_fund`) and more than the source holds (409 `fund_insufficient`, balance in `details.balance`), and writes an `out` and an `in` ledger row (`source_type = 'transfer'`) dated today. `POST /ledger/transfers/:id/void` (`ledger.approve`, reason) writes the two reversing rows; it is refused once void (409 `transfer_already_void`) and when the destination no longer holds the money (409 `fund_insufficient`). `GET /ledger/transfers`, `GET /ledger/transfers/:id`. No delete routes.
- **Statement:** `GET /ledger?fundId=&account=&from=&to=` (`ledger.view`; defaults to this month): the balance before `from`, money in and out, the closing balance, and each row with its running balance (kept across pages), source, reference (the receipt, voucher or slip number), who, whether it reverses or was reversed, and a link to its receipt, donation, expense, transfer or the fund. 400 `invalid_range`.
- **Reports** (`src/reports`, read-only; CSV at `/<report>/csv?lang=bn|en`, UTF-8 with a BOM, CRLF, formula-like text defused, behind the module's `export`):
  - Day book `GET /reports/day-book?date=` (Dhaka day): bill receipts in the caller's `payments` area, donations, paid expenses, transfers, cash per collector, and each fund and account through the day (start, in, out, end). Each section needs its own module's `view` (null otherwise); 403 when none. The CSV holds the sections the caller may also export.
  - Collection by area `GET /reports/collection?from=&to=&parentId=` (`billing.view`, area-scoped): regular bills of units issued in the range, billed against paid so far, per place directly under the parent (the society's one top-level place by default), with drill-down and breadcrumbs. Earlier arrears and membership fees are left out.
  - Arrears `GET /reports/arrears?locationId=` (`billing.view`, area-scoped): units with overdue bills, aged 1–30, 31–90 and over 90 days after the due date (`arrearsBucket` in shared), who the latest overdue bill went to, in address order, at most 2,000 units (`truncated`); the places below to narrow to. Membership bills (no unit) are not listed.
  - Income and expenditure `GET /reports/income?year=&fundId=` (`ledger.view`): built from the ledger rows dated in the fiscal year, so it agrees with the statements. Bill receipts split by charge type in line order (a voided receipt's reversal takes back the same split), donations, expenses by head; budgets per head with `budgets.view`, and only for all funds (budgets are society-wide). Transfers and opening balances are neither income nor expenditure.
- **Audit log viewer** `GET /audit` and `GET /audit/options` (`audit.view`): newest first, filters by user, record type, record id, action and Dhaka dates; before and after data as recorded. No write routes.
- **Web:** nav items "Fund ledger" (finance) and "Reports" (records; shown with any of billing, payments, donations, expenses or ledger `view`). `/dashboard/ledger` (fund balance cards, red below zero, statement filters, opening/in/out/closing, rows linked to their records when the user may open them), `/dashboard/ledger/transfers` (list, new transfer form with deposit / withdrawal / between-funds presets and the source's balance, detail with void). `/dashboard/reports` (cards for the reports the user may open) and one page each: day book (day picker, previous/next day), collection (date range, drill-down, progress bars), arrears (breadcrumbs, narrow-to chips, totals, A4 door-to-door print), income (year and fund, budget bars). `/dashboard/audit` replaces the placeholder. CSV buttons show only with `export`. A4 prints use the named page `a4` in `globals.css`; receipts and vouchers stay A5.
- **Also fixed:** Step 16's 409 `fund_insufficient` on paying an expense now carries the balance in `details.balance` (it was dropped by the exception filter).
- **Tests:** shared tests for transfers, the ledger query, `percentOf`, `daysBetween`, `addDays`, `arrearsBucket` and the audit filters; `csv.spec.ts`; `reports.e2e-spec.ts` in a throwaway society covers deposits, refusals, two transfers racing for the same cash, voids (permission, once, destination short), the trigger, the society boundary, the statement's running balance across pages, collection by area and arrears with Block C / Block D scopes, income split by line order against the ledger, the day book per section and scope, CSV files and their permissions, the audit viewer, and each fund's ledger agreeing with receipts, donations, expenses and transfers.
- **Checked:** every new page renders (Bangla and English) against the dev API with an admin session, and the CSV downloads work through the `/api` proxy. **Not checked yet:** clicking through in a browser, the A4 print preview, and the 375/820/1440 pass (still deferred).

### Step 18: Overview dashboard — Done

Built 2026-10-12 on `step/18-overview` (branched from `step/17-reports`). Decided by Anis: "collected" counts bill receipts only (never donations); figures may be up to 30 seconds old.

- **API `GET /overview`** (`src/overview`, `@Authenticated()`, read-only, no migration): one block per card, each null without its grant and limited to the caller's area for it.
  - Collected this month (`payments.view`): bill receipts, not voided, by Dhaka month; "% of billed" also needs `billing.view` (bills issued this month, not void, no opening arrears; a membership bill counts only society-wide).
  - Arrears (`billing.view`): the arrears report's totals (units' bills past due). Occupied units (`units.view`): active units by derived occupancy. Pending forms (`forms.view`): open applications.
  - Billed against collected for six months, each series with its grant.
  - Collection by area (`billing.view`): the collection report for this month, opened down while the caller reaches only one place (a block's coordinator sees its roads); areas with no bills are left out.
  - Needs approval: pending expenses by others (`expenses.approve`), unconfirmed handovers by others in the caller's `payments.approve` area, open applications in their `forms.approve` area; a count and the latest three of each.
  - Kept in memory for `OVERVIEW_CACHE_SECONDS` (default 30, 0 = live) per caller and their current grants, so a role change is never served stale.
- **Web `/dashboard`:** greeting by Dhaka time with the user's name, the society's name and date; stat cards; an inline SVG chart (`components/overview/billed-chart.tsx`, token colours, axis in taka, thousand or lakh by `chartScale`); collection by area (red below 80%); "Needs approval" with a link to each item. "New notice" shows with `notices.create`; the mockup's Export button, helpdesk and "this week" cards are left out.
- **Tests:** e2e (`overview.e2e-spec.ts`) checks every figure against the rows with paisa amounts, the Block C / Block D scopes, cards hidden without grants, donations and voids left out, the society boundary, and the cache (stale for 30 s, fresh after a role change). Unit tests for `lastMonths`, `chartScale` and the cache.
- Not checked at 375/820/1440 yet (deferred, as for earlier steps).

#### The original plan

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
| Opening arrears entry | Decided: typed per unit | Step 12 |
| Late fees | Decided: manual fine lines only | Step 12 |
| Per square foot rates | Decided: no; fixed amounts with rates by area | Step 13 |
| Mid-month units and tenancies | Decided: from the next run, no part months | Step 13 |
| Advance payments | Decided: no credit; bill ahead first | Step 14 |
| Receipt paper | Decided: A5 with counterfoil | Step 14 |
| SMS receipts | Decided: separate SMS step once a provider is chosen | Step 14 |
| Public donor list | Decided: no | Step 15 |
| `projects` table for developments | Decided: not in milestone 2 | Step 16 |
| Paying more than a fund holds | Decided: refuse | Step 16 |
| Approval limits by amount | Decided: no | Step 16 |
| Audit log viewer | Decided: yes, in Step 17, read-only | Step 17 |
| Income basis | Decided: cash basis, with billed beside it; part payments settle lines in order | Step 17 |
| Door-to-door arrears paper | Decided: A4 | Step 17 |
| Who voids a transfer | Decided: `ledger.approve`, no time limit | Step 17 |
| Resident bills view | Later, with the member app | Step 19 |

## Step 20: Move-in/out checklists and resident directory — Done

Built 2026-10-12 on `step/20-moves-directory` (branched from `step/18-overview`). These were the two "Move in-out" and "Residents" nav pages Step 10 deferred; Anis chose to build them, with Documents as Step 21. Plan approved by Anis, including migration `13_moves`.

- **Migration `13_moves`** (additive): `move_events.status` (`open | done | cancelled`), `note`, `created_at`, `completed_by`, `cancelled_at`, `cancelled_by`; a check keeps status, completion and cancel fields together; one open move per tenancy (partial unique index). The columns use `ADD COLUMN IF NOT EXISTS` so a half-applied run can be resolved and re-run.
- **Moves** (`src/members/moves.service.ts`, `tenancies` permission at the unit):
  - `POST /moves` starts a move-in for a `pending` tenancy, or a move-out for an `active` one (which becomes `moving_out`). 409 `move_wrong_status`, `move_open_exists`.
  - `PATCH /moves/:id`: planned date, note, checklist ticks (fixed keys `MOVE_CHECKLIST` in shared; the other kind's keys are 400 `invalid_check`). Ticking `police_form` on a move-in also sets the tenancy's police form.
  - `POST /moves/:id/complete` (`date`): a move-in makes the tenancy `active` from that day (household rows that started with it move too); a move-out ends the tenancy and its household through `TenanciesService.endIn`. Unpaid bills on the unit need `tenancies.approve` (409 `dues_outstanding` with `details.owed`); `dues_cleared` records which it was.
  - `POST /moves/:id/cancel`: a cancelled move-out puts the tenancy back to `active`.
  - `GET /moves` (open first, filters, search in either digit form, open counts) and `GET /moves/:id` (dues shown with `billing.view`).
  - Ending a tenancy directly cancels its open move; deleting a mistaken tenancy removes its moves; `PATCH /tenancies/:id` refuses a status change while a move is open (409 `move_open`). Tenancy rows carry `openMove`.
- **Resident directory** (`src/members/directory.service.ts`, `members.view`, area-scoped): current household rows (owners' and renters'), in natural address order, with relation, household, owner flag and member number; never the NID. `GET /directory` (search, area, paging, counts), `GET /directory/print` (everyone under a place, at most 3,000) and `GET /directory/csv` (`members.export`).
- **Web:** `/dashboard/moves` (list) and `/dashboard/moves/[id]` (checklist, dues, complete, cancel); "Start move-in / move-out" and the open move's link on the unit's tenancy row; `/dashboard/directory` (cards on phones, CSV) and `/dashboard/directory/print` (A4 door-to-door sheet).
- **Tests:** `test/moves.e2e-spec.ts` (11): move-in and move-out with occupancy, the dues hold and override, cancel and the direct-end cancel, one open move, Block C / Block D scope, other societies, directory order, search with Bangla digits, paging, print, CSV and no NID anywhere.
- **Checked:** `pnpm check` and the whole e2e suite (19 files, 282 tests). The pages rendered in Bangla and English against the dev servers; not clicked through in a browser, and the 375/820/1440 checks stay in the deferred pass.

## Step 21: Documents library — Done

Built 2026-10-12 on `step/21-documents` (branched from `step/20-moves-directory` after Anis pushed it). The last placeholder nav page; plan approved by Anis with migration `14_documents`.

- **Migration `14_documents`** (additive): `documents.title`, `archived_at`, `archived_by` (kept together by a check) and an index on `(society_id, entity_type, uploaded_at desc)`.
- **API** (`src/documents`, `documents` permission, society-wide):
  - A library document belongs to the society (minutes, AGM papers, circulars, licences, agreements), a person (deed, NID copy, agreement) or a place (deed, plan, agreement): `DOCUMENT_TYPES` in shared; a type that doesn't fit is 400 `invalid_doc_type`.
  - A person's documents also need the members grant where they live (to see; edit to add or change), a place's the units or locations grant there. An NID copy shows only to those who may edit the person (hidden from lists, 404 by id).
  - `GET /documents` (society papers by default, or `entityType` + `entityId`; search, kind, archived), `GET /documents/:id`, `GET /documents/:id/file` (photos inline, PDFs download, `private, no-store`, each read audited), `POST /documents` (multipart, checked by `processDocument`, stored by `PrivateFilesService` in area `documents`; at most 50 per person or place, 409 `too_many_documents`), `PATCH /documents/:id` (title, kind), `POST /documents/:id/archive` and `/restore`. No delete.
  - Form uploads and expense vouchers are never listed or served here (404); they keep their own pages and rules.
- **Web:** `/dashboard/documents` (current and archived tabs, search, kind filter, upload, rename, archive), and a Documents panel on person, unit and location pages.
- **Tests:** `test/documents.e2e-spec.ts` (7): upload, list, file download and its audit row; bad files, wrong kinds, missing title or file; person documents by area with the NID hidden from viewers; the per-record limit; place documents by area; rename, archive and restore; form files, vouchers and other societies kept out.
- **Checked:** `pnpm check` and the whole e2e suite (20 files, 289 tests). The library and the panels rendered in Bangla and English against the dev servers; uploading was not clicked through in a browser, and the 375/820/1440 checks stay in the deferred pass.

## Milestone 3: Operations — Done

Draft plan, 2026-10-12. It covers the mockup's **Operations** nav group: Staff and HRM (`hrm`), Facilities and assets (`facilities`), Work orders (`work`), Helpdesk (`helpdesk`), Vehicles and stickers (`vehicles`). Nothing here is confirmed: each step still gets its own scope note, and the items marked **(decide)** need Anis before that step starts.

### What there is to build on

- **Schema:** no Operations tables yet. The phase-2 list at the end of `docs/schema-phase1.sql` names `staff, attendance, payroll, facilities, assets, work_orders, tickets, vehicles, stickers, parking_slots`. `funds.location_id` is waiting for the facility a fund belongs to (Step 11).
- **Mockup:** no Operations screens, only the nav entries. Hints elsewhere:
  - The overview's Helpdesk card shows a title and a due chip ("Due today", "Overdue 1 day", "In progress").
  - Its "This week" card shows "Salary disbursement, 42 staff".
  - The resident app shows ticket `T-2290` with a timeline (Submitted → Assigned → Work started), "Assigned to Kalam Mia, electrician" and "Add photo or comment".
  - The resident app also has a "Bookings" tile and a car sticker `S57-C-0912` valid until "Dec 2026".
  - Screens follow the existing list, detail and form patterns, as Steps 15–16 did.
- **Reused, not rebuilt:**
  - `PartiesService.resolvePerson` (staff and vehicle owners are persons).
  - `NumberingService` (ticket and work order numbers).
  - `ExpensesService` (repair costs and salaries become expenses, so money keeps going through approve → pay → ledger).
  - `InvoicesService` (sticker and booking fees).
  - `MediaService` / `PrivateFilesService` and the Step 21 documents panel.
  - `TreeService.parentFor` and `scopeWhere`, `PrintSheet`, and the overview.
- **Permissions:** new modules go into `PERMISSION_MODULES`, the seed and `components/admin/modules.ts`, and into `LOCATION_SCOPED_MODULES` when their rows sit on the tree.

### Order

| # | Step | Depends on | Why here |
|---|---|---|---|
| 22 | Staff and attendance | – | Tickets, work orders and assets name a staff member |
| 23 | Facilities and assets | 22 (custodian) | Work orders and maintenance point at assets |
| 24 | Helpdesk and work orders | 22, 23 | The most visible value (overview card); a ticket leads to a work order |
| 25 | Vehicles, stickers and parking | – | Small and independent; can move earlier if the office needs it |
| 26 | Payroll | 22, Step 16 | Money, so last; salaries are already paid as expenses under "Staff salaries" until then |

### Step 22: Staff and attendance — Done

Built 2026-10-12 on `step/22-staff` (branched from `step/21-documents`). Anis said "continue" to the scope note, so the proposals stand: staff are area-scoped by their post; two permission modules, `staff` (profiles) and `attendance` (the roster); pay only for society-wide `staff.edit`; today and yesterday with `attendance.edit`, older days with `attendance.approve`; Staff is কর্মী everywhere; order 22 → 23 → 24 → 25 → 26.

- **Migration `15_staff`** (additive):
  - `staff`: one row per stint of work. Person, `staff_no` (per society, never reused), `designation_bn/en`, `kind` (`permanent | contract | daily`), `posted_location_id`, `joined_on`, `left_on` + `left_reason` (together, never before joining), `monthly_salary` or `daily_rate` by kind (checks), `created_by`. One current stint per person (partial unique index). No `user_id`: a staff member's login is the `users` row of the same person.
  - `attendance`: staff, Dhaka date, `status` (`present | half_day | leave | absent | off`), in and out times (only for present and half days, check), note, `marked_by`, `marked_at`. One row per staff member and day.
- **Permissions:** `staff` and `attendance` join `PERMISSION_MODULES`, the seed and `LOCATION_SCOPED_MODULES` (scoped through the post). The matrix and the sidebar get an **Operations** group.
- **API** (`src/staff`):
  - `GET /staff` (current, left or all; search by name, phone, designation or number in either digit form; designation, kind and area filters; the designations in use), `GET /staff/:id`, `POST /staff` (the person through `resolvePerson`; 409 `staff_current_exists`), `PATCH /staff/:id` (current stints only, 409 `staff_left`; moving needs `staff.edit` at the new post), `POST /staff/:id/leave` (not in the future, not before marked days: 409 `attendance_after_leave`), `POST /staff/:id/rejoin` (a new stint and number after the last one ended). No delete.
  - The person's own details change from the staff page only when the caller may edit them as a member, or they are on file only as staff (no ownership, tenancy or household). NIDs follow the same rule, and never go into audit rows.
  - `GET /attendance?date=` (everyone working that day in the caller's area, with what each may change), `PUT /attendance` (the day's marks in one transaction; only changes are written and audited, one audit row per save), `GET /attendance/month?month=&staffId=` (calendar, counts, days worked with half days at a half), `GET /attendance/csv?month=` and `GET /staff/csv` (behind `export`; no NIDs, pay only for society-wide editors).
  - Documents library: a staff member's papers (`entityType=staff`, kinds `contract`, `nid`, `other`) follow `staff` at their post; NID copies only for those who may edit the person.
- **Web:**
  - `/dashboard/hrm`: Staff and Attendance tabs (each shown with its grant). The staff list (cards on phones; search, designation, kind and current/left filters; CSV).
  - `/dashboard/hrm/new`: person, job and post (the place picker; the top means the whole society).
  - `/dashboard/hrm/[id]`: job, pay, post and person editors as allowed, leaving and rejoining, other stints, the month calendar (Saturday first) and the Documents panel.
  - `/dashboard/hrm/attendance`: the day's roster with one tap per status, optional times and note, "mark the rest present", and a sticky Save that sends only changes.
- **Seed:** the demo expense head "কর্মচারী বেতন" becomes "কর্মী বেতন" while it is still exactly as seeded.
- **Tests:** `test/staff.e2e-spec.ts` (11): adding with numbers in order and a person reused by phone; the Block C / Block D scope, pay and NID hiding; editing the person only when allowed; saving the roster and auditing only changes; the edit window and approvers; month counts; CSV; leaving and rejoining; staff papers; other societies kept out. Shared helpers in `contracts/staff.spec.ts` (7).
- **Checked:** `pnpm check` and the whole e2e suite (21 files, 300 tests). The pages rendered (200) in Bangla and English against the dev servers, with a demo staff member and a marked day that were removed afterwards; the forms were not clicked through in a browser, and the 375/820/1440 checks stay in the deferred pass.

### Step 23: Facilities and assets — Done

Built 2026-10-13 on `step/23-facilities` (branched from `step/22-staff`). Anis said "continue" to the scope note, so the proposals stand: bookings later (only a `bookable` flag now), asset numbers `AST-NNNN`, a purchase expense is linked optionally by voucher number (adding an asset never makes an expense), and an asset may sit straight on a location without a facility.

- **Migration `16_facilities`** (additive):
  - `document_sequences.kind` also takes `asset` (one counter per society, never restarts).
  - `facilities`: location, `name_bn/en`, `kind` (`hall | mosque | playground | generator | water_pump | office | other`), `bookable`, `fund_id`, note, `archived_at`. Names unique among facilities in use (partial unique index).
  - `assets`: `asset_no` (unique per society), name, free-text category, `facility_id` or just a place (`location_id` is always set; for a facility's asset it is the facility's place), `custodian_staff_id`, purchase date and cost, vendor, `expense_id`, warranty end (not before the purchase, check), `status` (`in_use | repair | retired | lost`), retired day and reason (together, only for retired or lost, check), photo, note.
  - `asset_maintenance_plans`: asset, task (bn/en), `every_months` (1–120), `next_due_on`, `last_done_on`, `archived_at` (stopped).
  - `asset_events`: the asset's history (`created | updated | moved | custodian | status | maintenance | photo`, a JSON detail with names as they were then, a note, who and when). Only ever added to; Step 24 adds work orders here.
- **Permissions:** one module `facilities`, in `PERMISSION_MODULES`, the seed, `LOCATION_SCOPED_MODULES` and the Operations group of the matrix; scoped through where the facility or asset is. Sidebar: Operations > Facilities and assets.
- **API** (`src/facilities`):
  - `GET/POST /facilities`, `GET/PATCH /facilities/:id` (moving a facility moves its assets, each with a "moved" event), `POST /facilities/:id/archive` (409 `facility_has_assets` while anything there is in use or under repair) and `/restore`, `GET /facilities/funds`. A fund only while separate funds are on (409 `separate_funds_off`), never the default or a closed one.
  - `GET /assets` (search by name, category or number in either digit form, `AST-0012` or `12`; status, category, facility and area filters; counts in use, under repair and upkeep due in 30 days), `GET /assets/csv` (behind `export`), `GET /assets/options` (facilities, categories, vendors), `GET /assets/custodians` (current staff posted inside the caller's create/edit area or above it; names and designations only), `POST /assets`, `GET/PATCH /assets/:id` (409 `asset_gone` once retired or lost), `POST /assets/:id/status`, `POST/DELETE /assets/:id/photo` (`MediaService`, area `assets`).
  - Status: in use ⇄ repair with `facilities.edit`; retire, lose, or put a retired or lost asset back with `facilities.approve` (`assetStatusMoves` in shared). Retiring or losing needs a day (not in the future) and a reason. The change is a conditional update on the old status (409 `asset_status_changed`).
  - Upkeep: `POST /assets/:id/plans` (at most 20 open), `PATCH/DELETE /assets/plans/:id` (a plan never done is deleted, one done is stopped), `POST /assets/plans/:id/done` (not in the future, not before the last time; the next due day is `monthsAfter(doneOn, everyMonths)`, keeping the day of the month), `GET /assets/maintenance-due?within=` (overdue and due within the window, for assets in use or under repair, soonest first).
  - Documents library: an asset's papers (`entityType=asset`, kinds `invoice`, `warranty`, `other`) follow `facilities` where it is kept.
  - Every change writes an audit row and, for assets, a history event in the same transaction.
- **Web:** `/dashboard/facilities` with tabs Facilities, Assets and Upkeep due.
  - Facilities: list, new, and a detail page (details, move, archive or bring back, its assets).
  - Assets: list (cards on phones; search, facility, category and status filters; CSV), new asset (details, at a facility or on a place, custodian search), and the asset page (details, move, custodian, status, photo, upkeep plans with "done", history, the Documents panel, a link to the purchase expense).
  - Upkeep due: the list with "done" in place.
- **Not built:** editing an upkeep plan in the web (the API has `PATCH`; remove it and add it again for now); bookings.
- **Tests:** `test/facilities.e2e-spec.ts` (10): facilities and the fund rule; area scope (404 outside the area, 403 without the grant); numbering; custodians in or above the area; linking a paid expense by voucher; status changes and the approver; moving a facility moves its assets, and archiving; upkeep due and done; asset papers; CSV; other societies kept out. Shared helpers in `contracts/facilities.spec.ts` (6) and the `AST` number format.
- **Checked:** `pnpm check` and the whole e2e suite (22 files, 310 tests). All eight new pages rendered (200) in Bangla and English against the dev servers, with a demo facility and asset that were removed afterwards; the forms were not clicked through in a browser, and the 375/820/1440 checks stay in the deferred pass.

### Step 24: Helpdesk and work orders — Done

On `step/24-helpdesk` (branched from `chore/web-auth-headers`). Anis said "start" to the scope note (2026-10-13), so the proposals stand: the office alone opens tickets; resolving needs `helpdesk.edit` and a note, closing, cancelling and reopening need `helpdesk.approve`; a cost when finishing a work order also needs `expenses.create` (without it, finish with no cost), the expense is dated the finishing day; words: Ticket অভিযোগ, Work order কাজের আদেশ, Helpdesk হেল্পডেস্ক. Built in four parts: (1) schema and shared, (2) tickets API, (3) work orders API, (4) web.

- **Part 1 done:** migration `17_helpdesk` (`tickets`, `ticket_events`, `work_orders`; numbering kinds `ticket` and `work_order`; `asset_events.kind` takes `work_order`), modules `helpdesk` and `work_orders` (catalogue, seed, area-scoped, Operations group of the matrix), `contracts/helpdesk.ts` and `contracts/work-orders.ts` (inputs, status moves, SLA setting `helpdesk_sla_hours` with defaults, number search) with unit tests. Response schemas come with the API parts.
- **Part 2 done (tickets API, `src/helpdesk`):**
  - `GET/POST /tickets`, `GET/PATCH /tickets/:id`, `POST /tickets/:id/assign`, `/status`, `/comments`, `/photos` (at most 5, `MediaService` area `tickets`), `GET /tickets/staff` (current staff posted inside the caller's create or edit area or above it), `GET /helpdesk/sla` (`helpdesk.view`) and `PUT /helpdesk/sla` (`settings.edit`).
  - List views active (default, soonest due first), overdue, resolved, finished, all; search by title, reporter's name, phone (4+ digits) or number in either digit form; filters category, priority, place (and below) and staff; counts active, overdue, due later today, resolved in the last 7 days.
  - A place outside the caller's area is 404 `location_not_found`, as for facilities. A changed category moves the due time from when the ticket was opened; tickets already open keep theirs when the SLA changes. Photos and comments stay on the timeline (no removal).
  - Response schemas in `contracts/helpdesk.ts`; `endOfToday` in `src/common/dates.ts`.
  - Tests: `test/helpdesk.e2e-spec.ts` (7): SLA setting; numbering and due time; area and staff scope; editing; assign, resolve, close, reopen and cancel with who may; comments and the photo limit; views, counts and search.
- **Part 3 done (work orders API, `src/work-orders`):**
  - `GET/POST /work-orders`, `GET/PATCH /work-orders/:id`, `POST /work-orders/:id/start`, `/done`, `/cancel`, `GET /work-orders/options` (vendors), `GET /work-orders/staff` (as for tickets, under `work_orders`).
  - The source (ticket, asset, or upkeep plan, which brings its asset) must be in the caller's sight (`helpdesk.view` / `facilities.view`), not closed or cancelled, not retired or lost; the place is the ticket's, else the asset's, else `locationId`. Raising one writes a `work_order` event on the ticket and the asset; finishing or cancelling writes one on the ticket (the ticket's own status is left to the office).
  - Giving the job to staff clears the vendor and the other way round. Finishing with a cost needs `expenses.create` and makes a pending expense (`ExpensesService.createIn`, same transaction) dated the finishing day, with the job's vendor, from the asset's facility fund while separate funds are on, else the default fund. A plan's job moves the plan on (`monthsAfter`) with a maintenance event, unless the plan was stopped or done later.
  - The ticket detail lists its work orders (with `work_orders.view`) and `can.workOrder`; asset history shows `work_order` events.
  - Tests (Part 3): `test/work-orders.e2e-spec.ts` (7): raising on a ticket and scope; from a plan; editing the assignee; finishing without a cost and the ticket's timeline; finishing with a cost (pending expense, facility fund, no ledger row, plan moved on); cancelling needs the approver; views, source, number search and area.
- **Part 4 done (web):**
  - Sidebar: Operations > Work orders (`/dashboard/work`, `work_orders`) and Helpdesk (`/dashboard/helpdesk`, `helpdesk`).
  - `/dashboard/helpdesk`: stat cards (open, overdue, due later today, resolved this week), search, view, category and priority filters, cards on phones. `/helpdesk/new` (place, category, priority, title, description, reporter: nobody or a typed name and phone, staff). `/helpdesk/[id]`: summary, edit, the timeline with photos, status (resolving and cancelling ask for a note), assign, comment and photo, its work orders and "Create work order". `/helpdesk/hours`: hours per category (saving needs `settings.edit`).
  - `/dashboard/work`: counts, search, view and source filters. `/work/new` from a ticket (`?ticketId=`), an asset (`?assetId=`, with its upkeep plans to choose from) or a place. `/work/[id]`: summary, edit (details, estimate, staff or vendor), start, finish (cost and expense head only with `expenses.create`), cancel, links to the ticket, asset and expense.
  - The overview gets an "Open tickets" stat and the mockup's Helpdesk card (the three due soonest) with `helpdesk.view` (`GET /overview` gained `helpdesk`). The asset page links to "Raise a work order".
  - Not built: choosing a person on record as the reporter in the web (the API takes `reporter.kind = person`); removing a photo or comment.
  - Checked: `pnpm check`, the helpdesk, work orders, overview, expenses and facilities e2e files. All nine new pages and the overview rendered (200) in Bangla and English against the dev servers, with a demo ticket and work order that were removed afterwards; the forms were not clicked through in a browser, and the 375/820/1440 checks stay in the deferred pass.

The plan:


- **Migration `17_helpdesk`:**
  - `tickets`:
    - `ticket_no` (`T-NNNN`, a new `NumberingService` kind, never restarts) and `location_id` (where the problem is).
    - `category`: fixed keys in shared (`street_light | garbage | water | drainage | electricity | security | noise | repair | other`).
    - Title, description and `priority` (`low | normal | high | urgent`).
    - `status`: `open | assigned | in_progress | resolved | closed | cancelled`.
    - Reporter: a person, or a typed name and phone for phone-in complaints, plus `reported_by_user`.
    - Assigned staff, `due_at`, resolved and closed times.
  - `ticket_events`: append-only timeline of status changes, comments and photos, with who and when (the mockup's timeline).
  - `work_orders`:
    - `wo_no` (`WO-YY-NNNN`, by fiscal year).
    - Source: a ticket, an asset or a maintenance plan, and its location.
    - Assignee: staff or a vendor.
    - Estimated cost, `status` (`open | in_progress | done | cancelled`), completion note, `expense_id`.
- **Rules:**
  - The due time comes from an SLA per category (new setting `helpdesk_sla_hours`). Overdue is derived, as for bills.
  - Resolving needs a note; the office closes a ticket after confirming.
  - Finishing a work order with a cost makes a **pending expense request** through `ExpensesService` (head chosen then). Approve and pay work as usual; work orders never touch the ledger.
  - A finished maintenance work order moves its plan's `next_due_on` on.
- **Modules `helpdesk` and `work_orders`**, both location-scoped (a Block C coordinator sees only Block C).
- **Who opens tickets (decide):** proposal is the office only, typing in phone and walk-in complaints, since residents have no logins yet (Step 19). The member app adds self-reporting later; a public "report a problem" form like Step 3 is the alternative.
- **Web:**
  - `/dashboard/helpdesk`: stat cards (open, overdue, due today, resolved this week), filters, cards on phones.
  - `/dashboard/helpdesk/[id]`: timeline, assign, status, photos, "Create work order".
  - `/dashboard/work`: list and detail; finishing one asks for the cost, which becomes the expense.
  - The overview gets the mockup's Helpdesk card (the three most urgent) with `helpdesk.view`.

### Step 25: Vehicles, stickers and parking — Done

On `step/25-vehicles` (branched from `step/24-helpdesk`). Anis decided (2026-10-13): stickers free by default and valid to 31 December by default, both changeable in one setting `vehicle_stickers` (prefix, `calendar | fiscal`, optional fee billed to the unit); no guard lookup screen on the web for now. Built in four parts; rules in `docs/rules/vehicles.md`.

- **Part 1 done:** migration `18_vehicles` (`vehicles`, `stickers`, `parking_slots`; numbering kind `sticker`), module `vehicles`, document kind `sticker`, `contracts/vehicles.ts` with unit tests.
- **Part 2 done (vehicles API):** list, get, add, edit, remove, `lookup`, `unit-people`; e2e `test/vehicles.e2e-spec.ts`.
- **Part 3 done (stickers and parking API):** issue, bulk renew, replace, revoke, CSV, A4 sheet, `/vehicles/settings`, the fee through `InvoicesService.issueUnitBillIn`; parking slots add, edit, assign, remove; e2e `test/stickers.e2e-spec.ts`.
- **Part 4 done (web):** `/dashboard/vehicles` with tabs Vehicles, Stickers and Parking; vehicle pages with the sticker actions; bulk renew, A4 print and CSV on the Stickers tab with the settings card; parking slot pages; a Vehicles panel on unit and person pages; `schema.d.ts` regenerated.

**Plan as written:**


- **Migration `18_vehicles`:**
  - `vehicles`: `reg_no` (normalised: either digit form, spaces and dashes removed; unique per society while active), `kind` (`car | motorcycle | microbus | cng | bicycle | other`), make, colour, unit, person, `removed_at`.
  - `stickers`: `sticker_no`, vehicle, `valid_until`, `status` (`active | revoked | replaced`; expired is derived), `replaces_id`, `invoice_id`. The number prefix comes from a new `sticker_prefix` setting, never from code.
  - `parking_slots`: location, code, assigned unit or vehicle.
- **Rules:**
  - A sticker goes only to a vehicle of a current owner, renter or resident of the unit.
  - A lost sticker is replaced: the old one is marked `replaced` and the new one gets a new number.
  - **(decide)** Is the sticker free or billed? If billed, it is a charge type billed through `InvoicesService` on the unit.
  - **(decide)** Is it valid to the end of the calendar year or the fiscal year?
- **Module `vehicles`**, location-scoped through the unit.
- **API:**
  - Vehicles: add, edit, remove.
  - Stickers: issue, renew (in bulk for a year), revoke, replace.
  - `GET /vehicles/lookup?plate=` gives a guard only the unit, sticker and validity. This is not gate management, which stays out of scope.
  - Parking slots: add, edit, assign.
  - An A4 sticker sheet to print, and CSV.
- **Web:** `/dashboard/vehicles` with tabs Vehicles, Stickers and Parking, and a Vehicles panel on unit and person pages.

### Step 26: Payroll — Done

On `step/26-payroll` (branched from `step/25-vehicles`). Anis confirmed the scope on 2026-10-13: each payslip is charged to a fund (the default unless separate funds is on), paying books one expense per fund; absent days are deducted at salary ÷ days in the month, half days at half that, leave and off days are paid; a run can be voided before or after paying, and the month prepared again. No salary advances. Rules in `docs/rules/payroll.md`.

- **Part 1 done:** migration `19_payroll` (`payroll_runs`, `payslips`, `payslip_lines`, `payroll_run_expenses`; checks for the net and the stages, triggers for draft-only payslips, forward-only runs and no deletes except a cascade; plain foreign keys checked at commit), module `payroll`, `contracts/payroll.ts` with unit tests.
- **Part 2 done (draft API):** `GET /payroll?month=`, `GET /payroll/:id`, `POST /payroll`, `POST /payroll/:id/refresh`, `PATCH /payroll/:id/payslips/:payslipId`, `POST /payroll/:id/approve`, `GET /payroll/:id/payslips/:payslipId/sheet`.
- **Part 3 done (pay and void):** `POST /payroll/:id/pay` and `/void` through `ExpensesService.bookPaidIn` / `voidBookedIn`. `expenses.service.ts` (584 lines) was split on the way into `ExpenseListService`, `ExpenseVouchersService`, `expense-money.ts` and `expense-rows.ts`; its public methods are unchanged. The overview's approvals card gained payroll. E2e `test/payroll.e2e-spec.ts` (6).
- **Part 4 done (web):** a Payroll tab under HRM (month picker, totals, the run's steps, net by fund, the expenses booked, payslips as a table or cards, prepare / recalculate / approve / pay / void), the payslip page with the line editor and the A5 print, the payroll item on the overview, `schema.d.ts` regenerated.

**Plan as written:**

- **Migration `19_payroll`:**
  - `payroll_runs`: month, `status` (`draft | approved | paid | void`), who prepared, approved and paid it, and when.
  - `payslips`: staff, base, attendance deduction, allowance and deduction lines, net; all `numeric(14,2)`.
  - `salary_advances` **(decide)**.
- **Rules:**
  - Every milestone 2 finance rule applies.
  - Nobody approves their own run (403 `cannot_approve_own`).
  - Paying goes through `ExpensesService` under the "Staff salaries" head, so the ledger, budgets and reports stay right with no new ledger source. **(decide)** One expense per fund for the run, or one per staff member?
  - Payslips never change after approval; a void reverses through the expense void.
  - Daily workers are paid by their days present.
- **Module `payroll`**, society-wide.
- **Web:**
  - `/dashboard/hrm/payroll`: the month's run, editable while a draft; approve; pay.
  - An A5 payslip through `PrintSheet`.
  - The overview's "This week" card shows an approved run not yet paid.

### Step 27: Bills for several units, printing bills together — Done

On `step/27-bulk-bills` (branched from `step/26-payroll`). Anis asked for it on 2026-10-15 because owners and renters change, so recurring schedules can't cover every charge. Decided: different charges per unit, amounts typed by hand (no part-month maths), earlier bills for the same charge and months only warn, a unit whose lines pay into two funds gets one bill per fund, and the bills of a batch, or any ticked bills, print together. No migration. Rules in `docs/rules/billing.md`.

- **Shared:** `contracts/billing-batch.ts` (`invoiceBatchSchema`, check and result contracts, `invoicePrintQuery`, and the pure rules `splitByFund`, `billSpan`, `duplicateBills`) with unit tests.
- **API:** `InvoiceBatchService`; `POST /invoices/batch/check` (writes nothing), `POST /invoices/batch` (all or none, each bill through `InvoicesService.issueRegularIn`; an error names its unit in `details.unitId`), `GET /invoices/print?ids=` (at most 50, in the order asked, 404 if any is out of reach), `GET /billing/units` (every unit the caller may bill, with who pays, for the picker). `InvoicesService.details` builds full bills for several rows at once. E2e `test/invoice-batch.e2e-spec.ts` (7).
- **Web:** `/dashboard/billing/batch` ("Several units" on the bills page): find units, or tick them in a side panel listing every billable unit as a folding tree of places (block › road › building…, each with a select-all box and counts) ("Choose from list"), lines per unit with "same lines as above", check, then make them all and go to the print page. `/dashboard/billing/print?ids=` or `?id=&id=`: every bill on a page of its own (`BillSheet`, split out of `BillPrint`), or "Print as a list": one A4 table (bill no., unit, bill to, charge, period, amount, total). The bills list has tick boxes and "Print selected". `schema.d.ts` regenerated.

### Every Operations step

- Same workflow as before: scope note, Anis confirms, `step/NN-name` branch, `pnpm check` and e2e, Codex review. Migrations are additive and approved first.
- E2e tests prove the society boundary and the Block C / Block D scope. Steps with money (25 if stickers are billed, 26) also add the exact-paisa, no-delete and ledger-agrees tests.
- Bilingual `*_bn` / `*_en` text, NFC, searches in either digit form, cards on phones; the 375/820/1440 pass stays deferred.
- New words (Staff, Attendance, Ticket, Work order, Facility, Asset, Sticker) go into `docs/glossary.md` once Anis agrees them.

### Open decisions

| Decision | Proposal | Needed before |
|---|---|---|
| Staff area-scoped by posting | Yes (decided 2026-10-12) | Step 22 |
| Facility bookings | Later, with the member app | Step 23 |
| Who opens tickets | The office only for now | Step 24 |
| Sticker fee | Free by default; an optional fee in the `vehicle_stickers` setting | Step 25 |
| Sticker validity | Calendar year by default; fiscal year through the setting | Step 25 |
| Salary advances | Not at first (confirmed 2026-10-13) | Step 26 |
| Salary expenses | One per fund per run (confirmed 2026-10-13) | Step 26 |
| Order | 22 → 23 → 24 → 25 → 26 (decided 2026-10-12; 25 can still move first) | Step 23 |

## Records and administration (Steps 28–29) — Built, awaiting review

Planned 2026-10-24 from the mockup's Records group. Documents (Step 21), the finance reports and the audit log viewer (Step 17) already existed, so the group added certificates and NOCs (Step 28) and the non-finance reports (Step 29). Module on/off switches with one settings screen (first planned as Step 30) were dropped from the group the same day: for one society, roles already hide modules nobody uses, so it moved to the Product list for onboarding a second society.

- Step 29 is branched from Step 28: merge 28 first, then 29.

### Open decisions

| Decision | Current choice | Needed before |
|---|---|---|
| Glossary words: Certificate = সনদ, NOC = অনাপত্তিপত্র | Proposed in `docs/glossary.md` ("To agree") | Merging Step 28 |
| Certificate fee | None for now; later a charge type that bills the unit | A society asks for one |
| Public NOC request form | Later; the office enters requests (`noc` stays in `UPCOMING_FORMS`) | With the member app |
| QR code or verification page on certificates | No for v1 | – |
| Reports beyond the three in Step 29 (monthly attendance summary, open tickets by area) | Not now; Claude used the proposal because Anis said proceed without choosing | Anis asks |
| NID on the renter list for the thana | Left out; if wanted, only for those who may edit the person | Anis asks |

## Step 28: Certificates and NOCs — Built, awaiting review

Built 2026-10-24 on `step/28-certificates` (from `main` after PR #28). The first item of the "Records and administration" group; plan approved by Anis, who took the proposals: no fee, no public request form yet, no QR or verification page, the signer typed at issue above a line for a wet signature.

- **Migration `20_certificates`** (additive): `certificates` (type, letter language, person, unit, addressee, purpose; status `draft | issued | void`; frozen at issue: `cert_no`, `body`, signer name and title, `dues_owed`, who and when; void fields). Checks keep the issue and void fields together; trigger `certificates_guard` lets a draft change or be deleted, makes issuing the only way out of a draft, then allows only the one void (and the society cascade). Numbering kind `certificate`: `CRT-YY-NNNN`, restarting each fiscal year.
- **Module `certificates`** (area-scoped through the certificate's unit), in the catalogue, seed and role matrix (Records).
- **Shared** (`contracts/certificates.ts`): eight types (`noc_sale`, `noc_rent`, `noc_utility`, `noc_renovation`, `noc_loan`, `residence`, `membership`, `no_dues`); `CERTIFICATE_TIES` (sale, letting, renovation and loan NOCs for owners only; utility and no-dues for owners and renters; residence and membership for anyone at the unit); templates with placeholders (`{name}`, `{unit}`, `{society}`, `{date}`, `{certNo}`, `{memberNo}`, `{purpose}`, `{addressee}`), `renderCertificate`, `certificateTemplatesOf` (setting `certificate_templates` over the defaults), `duesDecision`, `unitText`.
- **API** (`src/certificates`): list (search by number, name or phone; type, status, place, unit, person), detail (a draft's letter as it would issue today; the unit's dues with `billing.view`), `unit-people`, create, edit and delete drafts, `issue` (`certificates.approve`: person checked again, then dues: 409 `certificate_dues_outstanding` for a no-dues certificate, `certificate_dues_unpaid` for others without `allowDues`; numbered and frozen in one transaction), `void` (once, with a reason), `print` (issued or void), `templates` (read with `certificates.view`, changed with `settings.edit`). Each change writes its own audit row.
- **Refactor:** the current-ties query moved from `VehiclesService` to `members/unit-ties.ts`, and the unit's unpaid bills from `MovesService` to `billing/unit-dues.ts`; vehicles, moves and certificates share them.
- **Web:** nav item Records > Certificates; `/dashboard/certificates` (counts, search, filters, cards on phones), `/new` (type with who may get it, unit and person picker that greys out people who don't fit), `/[id]` (draft editor and discard, issue with signer and "issue anyway", void, letter text), `/[id]/print` (A4 letter in the letter's own language, "Void" stamp), `/templates` (per-type Bangla and English text, placeholder list, back to default). A Certificates panel on unit and person pages.
- **Tests:** shared unit tests (numbering, rendering, templates, dues, ties, `unitText`); `test/certificates.e2e-spec.ts` (11): unit people by area, ties and membership on create, Block C / Block D scope and other societies, search, draft edits, dues hold, "issue anyway" and the no-dues block, frozen issued rows (API and trigger), the person checked again at issue, two issued at once without a gap, print, void once, discarding a draft, templates.
- **Checked:** `pnpm check`, the whole e2e suite (29 files, 362 tests), and `next build` (all five pages compile). The pages were not opened in a browser (no admin session in this run); the 375/820/1440 checks stay in the deferred pass.

## Step 29: Occupancy, members and renter-list reports — Built, awaiting review

Built 2026-10-24 on `step/29-records-reports` (branched from `step/28-certificates`). Anis said to proceed without answering the two open questions, so Claude used the proposals: these three reports only (no Operations reports yet), and no NID on the renter list. No migration.

- **Shared** (`contracts/records-reports.ts`): `occupancyQuery` / `occupancyReportSchema` (`occupancyFiguresOf`, `sharePercent`), `membersReportQuery` / `membersReportSchema` (`MEMBERS_REPORT_LIMIT` 2,000), `rentersReportQuery` / `rentersReportSchema` (`RENTERS_REPORT_LIMIT` 3,000); `REPORT_KEYS` gains `occupancy`, `members`, `renters`.
- **API** (`src/reports`, read-only, CSV at `/<report>/csv?lang=` behind the module's `export`):
  - Occupancy by area `GET /reports/occupancy?parentId=` (`units.view`, area-scoped): active units per place under the parent by `units.occupancy` (owner lives there, rented, vacant) and the occupied percent; drill-down and breadcrumbs as for collection; a unit row shows its own occupancy.
  - Members `GET /reports/members?from=&to=&locationId=` (`members.view`): memberships by status, and who joined in the range (this month by default, 400 `invalid_range`), with member number, phone and the membership's place. A scoped caller sees memberships recorded at a place in their area.
  - Renters `GET /reports/renters?locationId=` (`members.export`, scoped on it): tenancies active or moving out, in address order, with the renter (person or organisation, the contact's phone), kind, start, household size (current occupants of the tenancy) and police form; totals. 403 `thana_sharing_off` while `share_renters_with_thana` is off. Never the NID.
  - `reports/area-tree.ts` (`AreaTree`, `inScope`, `reaches`) now holds the place, children and breadcrumbs walk for every area report; collection and arrears use it with `billing`.
- **Web:** three cards on `/dashboard/reports` (the nav item also shows with `units` or `members`); `/dashboard/reports/occupancy` (stat cards, drill-down table with bars, a unit's own occupancy chip), `/dashboard/reports/members` (status cards, date range, joiners), `/dashboard/reports/renters` (totals, "never the NID" note, A4 print for the police station, CSV; a note instead while sharing is off).
- **Tests:** `records-reports.spec.ts` (shared); `test/records-reports.e2e-spec.ts` (9): occupancy figures, drill-down and natural order, Block C / Block D scope, CSV and its grant; members counts, joiners, range and place filter, scope, CSV; renters refused while sharing is off, scope on `members.export`, person and organisation renters, household and police-form totals, no NID in JSON or CSV.
- **Checked:** `pnpm check` and the whole e2e suite (30 files, 371 tests; one run had a single failure in `forms.e2e-spec.ts` that passed alone and on the next full run). `next build` was not run because the dev web server was using `.next`; typecheck and lint cover the pages. Not opened in a browser; the 375/820/1440 checks stay deferred.

## Step 30: Print formats and the A4 bill — Built, awaiting review

Added 2026-10-26. The bill prints to the mock `docs/mocks/sector57-bill-a4-8rows.png` on a full A4 page (`BillSheet` in `components/billing/bill-print.tsx`, used by the single and the "Print all" bill prints). Nothing is built yet.

**Print formats (decided by Anis, 2026-10-26):** A4 does not replace A5; the paper is chosen at print time.
- Formats `a4`, `a5`, `thermal80`. Only 80 mm thermal for now; the format list is data so `thermal58` or others can be added later without reshaping anything.
- Three layers: a society setting `print_formats` (per document type: the default format and which formats are offered, so a society without a thermal printer hides it), then the device's own choice remembered in the browser, then a one-off picker on the print page. The device choice is ignored if the society no longer offers it.
- Each format is its own layout over one shared print model (header, billed-to, lines, totals, amount in words, status), so a new format or document type does not touch the data side.
- Thermal prints through the browser and the printer's driver (Bangla is rasterised; no ESC/POS). Black only, two-line rows, no counterfoil. Not offered for "Print all".
- **Split:** Step 30 = the format mechanism, the shared bill print model, the new A4 bill and the current A5 bill moved onto the model. Step 30b (later, with a printer to test on) = thermal, receipts first, then bills. Vouchers, payslips and donation receipts join the picker one at a time after that.

**Built 2026-10-26** on `step/30-bill-a4` (from `step/32-expense-lines`; merge 31, 32, then 30). No migration.
- **Shared:** `contracts/print.ts` (`PRINT_FORMATS`, `PRINT_SUPPORT`, `print_formats` setting and input schema with `print_format_unsupported`, `print_format_twice`, `print_default_not_offered`; `printFormatsOf`, `pickFormat`, `billDensity`, `notePoints`). `receipt_header` gains `email`, `regNo`, `officeHoursBn/En` (older saved headers read them as null).
- **API:** `GET/PATCH /settings` carry `printFormats`; the bill detail (and `GET /invoices/print`) adds `otherDue` (`billing/unit-dues.ts` `unitsDues`, one grouped query) and `print`.
- **Web:** `bill-print.tsx` is now the paper picker plus `BillSheet(format)`; the old layout moved unchanged to `bill-a5.tsx`; the new `bill-a4.tsx` follows the mock without the period column, previous due or adjustments. Picker on the bill page and "Print all" (`components/print/print-format.tsx`, remembered per device). `Logo` takes `size="lg"`. Settings: four new header fields and a "Bill paper" card (`finance/bill-paper-card.tsx`).
- **Tests:** `print.spec.ts` (10); e2e in `finance.e2e-spec.ts` (settings round trip and refusals) and `billing.e2e-spec.ts` (`otherDue` leaves out the bill itself and void bills; default formats).
- **Checked:** the affected e2e files and `pnpm check`. **Not checked:** the A4 print against the mock in a browser (no admin login in this session).
- `invoices.service.ts` is about 610 lines and was not split.

**Gap found (2026-10-26):**
- **Page.** Print CSS defaults to `@page` A5 with an 8 mm margin; `.print-a4` has a 12 mm margin for long lists. The mock is A4 with no page margin (the green header band bleeds to the edges, about 36 mm tall) and about 13 mm padding inside, filling the page with the counterfoil and footer at the bottom. Needs a new named A4 page with margin 0 and a sheet of 210 × just under 297 mm; the A5 default stays for receipts, vouchers and payslips unless decided otherwise. With margin 0 there are no CSS page-number margin boxes, so "Page 1 of 1" holds only if a bill always fits one page.
- **Components.** A4 header variant (badge about 15 mm, name, address, contact line on the left; "BILL", number and a status chip on the right; `Kantha` below); `DocumentHead` stays as is for the A5 papers. `Logo` needs a size. Billed-to and bill-details cards (adds `billTo.phone`), a numbered line table with a header row, totals with a solid "Total payable" box and the amount in words, payment and notes cards, three signature lines (prepared by, treasurer, authorised signatory), an office counterfoil with a "received stamp" box, and a footer (computer-generated, printed at, page). Sizes in pt for A4. The "Void" stamp stays. The A4 bills list (`bills-list-sheet.tsx`) is unchanged.
- **Data the mock shows that bills don't have:** society email and registration number (not in the `receipt_header` setting); a period per line (only the bill has one); previous due and adjustments (a bill stands alone: total, paid, due); office hours and notes text (society-specific, so a setting, not code or i18n; "late fee" promises something the system doesn't do); a member ID like `MEM-00142` (we have a member number).

### Open decisions

| Decision | Proposal | Needed before |
|---|---|---|
| A4 for bills only, or also receipts, donation receipts, vouchers and payslips | Bills only in Step 30; the others join the format picker later | Decided |
| Thermal width | 80 mm only for now; more widths can be added as formats | Decided |
| Per-line period column | Drop it (no migration) | Decided |
| Previous due and adjustments | Payable = this bill's due (subtotal, less paid); at most an "other unpaid bills ৳X" note | Decided |
| Email and registration number | Add to the `receipt_header` setting and its form (JSON, no migration) | Decided |
| Office hours and notes | A setting; generic wording if empty | Decided |
| Bills longer than the page (up to 20 lines; about 8 fill it at the mock's spacing) | Compact rows and merged payment/notes above about 10 lines, always one page | Decided |

## Step 31: Payment methods — Built, awaiting review

Asked for by Anis on 2026-10-26: record how every amount was paid, without any gateway (SSLCommerz, Stripe and the like stay out). Built on `step/31-payment-methods` (from `main` after PR #30) in three parts in one session. Decided by Anis: mobile-wallet money lands in the **bank** account (no third ledger account); a cheque counts on the day it is taken (a bounced one is voided); the reference is required for cheque and mobile, optional for a bank deposit, never kept for cash.

- **Migration `21_payment_methods`:** `payments.method` takes `cash`, `bank`, `cheque`, `mobile`, plus `method_ref` (cash has none, cheque and mobile must). `expenses` and `payroll_runs` get `paid_method` and `paid_method_ref`, back-filled from `paid_account`; a check keeps method and account in step (cash ↔ cash, the rest ↔ bank). Hand-entered rows that said cheque or mobile got `-` as their reference. Prisma does not wrap a migration in a transaction, so the old check is dropped with `IF EXISTS` (the first try on the dev database had half-applied).
- **Shared (`contracts/finance.ts`):** `PAYMENT_METHODS`, `accountOfMethod`, `methodNeedsRef`, `refineMethodRef` (`method_ref_required` on `methodRef`), `storedMethod` (drops a reference typed for cash). `POST /payments` and `/donations` take `method` (default `cash`) and `methodRef`; `POST /expenses/:id/pay` and `/payroll/:id/pay` take `method` + `methodRef` **instead of** `account`. Receipts, donation rows, expense details and payroll runs return the method and reference. Labels in `Finance.method`.
- **API:** the ledger row goes to the method's account; the audit rows record method and reference. The cash handover, the collector's "in hand" figure and `inHand=true` count cash only; "today" counts every method.
- **Web:** `PaymentMethodField` (`components/finance/payment-method-field.tsx`: picker, reference box, "goes to: Cash/Bank") on the collect, donation, expense-pay and payroll-pay forms; the receipt (live preview, payer copy and counterfoil) prints the method and reference instead of a fixed "Cash"; the expense detail, voucher and payroll steps show "Bank (Cheque · 771204)" through `paidFrom` (`components/finance/method-text.ts`).
- **Tests:** `payment-methods.spec.ts` in shared; e2e for receipts (cheque refused without a reference, mobile and cheque to the bank, cash reference dropped, only cash in hand and handed over), expenses (cheque from the bank, `account` refused), donations (mobile to the bank) and payroll (mobile without a reference refused). Existing e2e send `method` instead of `account`.
- **Checked:** the six affected e2e files (81 tests) and `pnpm check`. The forms were not opened in a browser; the 375/820/1440 checks stay in the deferred pass.
- **Not in this step:** a by-method breakdown in the reports, the method on the receipts and donations lists, cheque clearing, a separate mobile-wallet account, fund transfers (they already pick their accounts). `payments.service.ts` is 713 lines and was not split.

## Step 32: Expenses with several lines — Built, awaiting review

Asked for by Anis on 2026-10-26: one expense record holds several items, added with "Add more" on `/dashboard/expenses/new`. Built on `step/32-expense-lines` (from `step/31-payment-methods`, committed first). Decided by Anis: the old head, vendor and description columns are **dropped** from `expenses`; each line has its own vendor; the record gets an optional title of its own; one record has one date, one fund and **one payment method**.

- **Migration `22_expense_lines`:** `expense_lines` (`position`, `expense_head_id`, `vendor_id`, `description`, `amount > 0`); every existing expense became one line. `expenses` gets `title`, `method` (back-filled from `paid_method`, else cash) and `method_ref`, and loses `expense_head_id`, `vendor_id`, `description`. A deferred constraint trigger keeps `expenses.amount` equal to the sum of at least one line; a guard refuses line changes once the expense is rejected, paid or void.
- **Shared:** `expenseInputSchema` takes `title`, `fundId`, `method`, `methodRef` (optional until paid), `spentOn` and `lines` (1–`MAX_EXPENSE_LINES` = 20); `expenseTotal`. List rows carry the first line's head, vendor and description plus `lines` (count), `title` and `method`; the detail has `lines`, `methodRef` and `budgets` (one per head with a budget) instead of `budget`. Day-book expense rows are per line (`lineId`).
- **API:** `checkRefs`, `writeLines` and `budgetsFor` in `expenses/expense-lines.ts`. One voucher, one approval and one `out` ledger row per record, unchanged. Budgets, the income report and the day book count line amounts under line heads; list filters by head or vendor match any line, the search looks at the title, line descriptions and vendors. Payroll and work orders write one line each (work orders plan cash).
- **Web:** one card per line (`expense-line-card.tsx`: head, amount, description, vendor, remove), "Add more", and a sticky bottom card with title, date, fund, payment method, the total and Save. The pay form starts from the planned method. The detail page lists the lines and each head's budget; the voucher prints an itemised table; the list shows "head +N".
- **Tests:** shared spec for lines and totals; e2e for several lines (total, per-line head and vendor, edit replaces lines, database refuses a wrong total, one ledger row, lines fixed once paid). Existing e2e post through `expenseBody` (`test/create-app.ts`).
- **Checked:** the six affected e2e files and `pnpm check`. The form was not opened in a browser; the 375/820/1440 checks stay in the deferred pass.
- **Not in this step:** different funds or dates per line, vouchers per line, reordering lines.

## Later: beyond milestone 3

These are in the mockup's dashboard nav but not in milestones 1 to 3. Each needs its own plan.

**Community**
- Notices and SMS (`noticesd`), adding SMS sending to the Step 7 notices
- Events and AGM (`events`)
- Elections and voting (`voting`) (remove this when planning, it will be done later or mostly physical)
- Community board (`board`)

**Records and administration** (done apart from review; see Steps 28–29 above)
- Documents (`documents`): built in Step 21
- Certificates and NOC (`certs`): built in Step 28
- Reports (`reports`): the finance reports came in Step 17; occupancy, members and the renter list in Step 29
- Society settings (`settings`): the finance toggles came in Step 11; other settings sit beside the module they control (stickers, helpdesk response time, certificate letter text). Module on/off switches moved to Product (decided 2026-10-24): roles already hide unused modules for one society. If finding settings becomes a problem, a small "all settings" index page linking to each is enough.
- Audit log viewer (`audit`): built in Step 17; the log itself is written from Step 4/5

**Member app:** the mockup's member-facing view (residents see their own bills, notices and requests).

**Product:** onboarding a second society (society picked by host instead of `DEFAULT_SOCIETY_SLUG`), module on/off switches per society (a `modules` setting that drops a module's permissions, nav, routes and overview cards for everyone, data kept; first planned as Step 30, deferred 2026-10-24; the number now belongs to the A4 bill print), and the deploy script for the DigitalOcean droplet.

**Out of scope for v1:** visitor and gate management, online payment, reporting to RAJUK or City Corporation.

## Pending chores

- Visual checks at 375, 820 and 1440 px for every step so far (deferred; use CDP viewport emulation).
- Click-through in a browser of the Step 28 and 29 pages (they rendered only through `tsc`, lint and, for Step 28, `next build`).
- Codex review of Steps 28 and 29, then merge 28 before 29.
- Finish the CI workflow (Anis).
- After each new migration, apply it to the test database too (`TEST_DATABASE_URL`): `migrate:deploy` and the seed.
