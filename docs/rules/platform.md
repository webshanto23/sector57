# Platform and public site (Steps 0–2)

## API foundation

- helmet, nestjs-pino, nestjs-zod global pipe, throttler, cookie-parser and swagger (dev only, `/docs`, JSON at `/docs/json`) are wired up.
- The env is validated at startup (`src/config/env.ts`), there is a global exception filter, and a `SocietyContext` guard and decorator resolve the society from `DEFAULT_SOCIETY_SLUG`. Routes: `GET /health`, `GET /society`.

## Web foundation

- `next-intl` routing (`bn` at `/`, `en` at `/en/`, via `src/proxy.ts`), local Noto Bengali fonts, a theme toggle (saved in `localStorage` key `s57-theme`, otherwise follows the system), a locale switch.
- Mockup components in `src/components/kit`, a dev-only gallery at `/dev/components`.
- Typed `openapi-fetch` client (`src/lib/api`). Regenerate its types with `pnpm --filter @s57/web api:types` while the API runs.
- react-hook-form (with `@hookform/resolvers/zod` and the shared schemas) is used for forms; React Query and TanStack Table are not used yet.
- The society's name, badge and place line come from `getBrand(locale)` (`src/lib/brand.ts`).

## Shared package

- `packages/shared`: `bn.json`/`en.json` messages, NFC helper, Bangla digits and `৳` formatting, `pick(bn, en)`, zod basics (phone, uuid, pagination) and the society contract, all with Vitest tests.

## Public site

- API modules `notices`, `site-pages`, committee and gallery: `GET /public/notices` (paged, `?category=`), `GET /public/notices/:id`, `GET /public/pages/:slug`, `GET /public/committee` (today's members in Dhaka time; only name, position and photo leave the API), `GET /public/gallery`, `GET /public/gallery/:id`. Public, read-only, `@SkipThrottle` because every call comes from the Next server.
- Web: `(site)` route group with header, nav and footer; pages are cached with `revalidate = 60`.
- Pages prerendered at build time must not fail when the API is down (`next build` in Docker has no API): fall back while `NEXT_PHASE === "phase-production-build"`, and throw at runtime so ISR keeps the last good page.
- `MEDIA_BASE_URL` (optional) turns stored file keys into URLs. When it's unset they resolve to null, and the site draws `art()` placeholders (`components/site/art.tsx`).
- Notice categories are fixed keys (`NOTICE_CATEGORIES` in shared); labels live in i18n, colour and icon in `components/site/notice-category.ts`.
- Committee positions are fixed keys (`COMMITTEE_POSITIONS`, labels in i18n). Any other stored text is shown as typed.
- Home and footer content is JSON in `site_pages` (`homeContentSchema`, `siteInfoSchema` in shared), stored as `{bn, en?}`.
- Developments are JSON in `site_pages` slug `developments` (`developmentsContentSchema`), bilingual per field, money as decimal strings. The home page reads ongoing projects from it. They need a real `projects` table if they are ever tied to expenses.
