# Auth (Step 4)

- Migration `2_auth`: `user_sessions` (refresh tokens stored as SHA-256 hashes) and `users.failed_login_count` / `locked_until`.
- API `auth` module: `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `GET /me`, `POST /me/password`. Access JWT 60 min (`jose`, HS256, `JWT_SECRET` ≥ 32 chars, required), refresh token 7 days and rotated on every use (an old token coming back revokes the whole family). 4 wrong passwords lock the account for 60 min; unknown phones get identical answers.
- Every route needs a login unless marked `@Public()` (global `AuthGuard`).
- The global `CsrfGuard` checks `Origin` against `WEB_ORIGIN` and a double-submit token (`s57_csrf` cookie echoed in `X-CSRF-Token`) on every unsafe method; `@SkipCsrf()` is for pre-login forms only. Cookie and header names are in `AUTH_COOKIES` / `CSRF_HEADER` in shared.
- Passwords: Node's built-in `crypto.argon2` (argon2id, PHC string format). Don't use the `argon2` npm package; it doesn't build on Windows with Node 24.
- `AuditService` (`src/audit`) writes `audit_logs`; login events are logged.
- CLI (after `pnpm --filter @s57/api build`): `create-admin` (first super admin, granted the role with `is_system`) and `reset-password` (random 10-character password, logs the user out everywhere). Both prompt, so no secrets end up in the repo.
- Web: `/login` page; `src/proxy.ts` (with `src/lib/session-proxy.ts`) refreshes an expired session for `/dashboard` before rendering, or redirects to `/login?next=`. The browser API client adds the CSRF header and retries once after a refresh.
