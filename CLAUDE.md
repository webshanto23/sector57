# Sector 15 Community Management System

@AGENTS.md

`AGENTS.md` (imported above) holds the shared rules for every coding agent: workspace layout, commands, code style, generated files. This file adds the product context and the decisions Claude needs on top of that.

**Roles:** Claude does the code and development; Codex reviews, debugs and tests (see "Agent Roles" in `AGENTS.md`). When Codex reports a bug or review finding, Claude makes the fix. If the two files still disagree after applying the roles, ask Anis rather than picking one.

## What we are building

- A community (welfare society) management system for Uttara Sector 15, Dhaka. Owner and only developer: Anis, working with Claude and Codex.
- It will later ship as a product to other societies, so everything is multi-tenant: every business table carries `society_id`, and nothing may assume a single society.
- Priorities, in order: security, then speed. Design polish comes after both.
- Out of scope for v1: visitor/gate management, online payment, external reporting to RAJUK or City Corporation.

## Product rules that shape the code

- **Bangla first.** `bn` is the default locale (Bangla at `/`, English at `/en/`, `next-intl`). Messages are `bn.json` / `en.json` in `packages/shared/src/i18n`.
- **Bilingual data.** Display text is `*_bn` (required) plus `*_en` (optional, falls back to Bangla). Names of people, places and vendors are stored as typed (`persons.full_name`, optional `full_name_en`). Normalise text to Unicode NFC before saving.
- **Roles and permissions are data.** Never hardcode or check a role by name; check permissions (CASL abilities from `roles`, `permissions`, `role_permissions`, `user_roles`). Seeded roles are only starting points.
- **Area-scoped access.** A role can be limited to one branch of the location tree (sector > block > road > plot > building > storey > unit); `location_levels` defines the levels per society, `locations` is one self-referencing tree, `units` are leaf locations with an extra row.
- **Money.** `numeric(14,2)` in BDT (Prisma `Decimal`, never JS floats). Financial rows are never hard-deleted. Cash only; a receipt is issued.
- **The society's identity is data.** Name, logo badge and place line come only from the database (`societies.name_bn/en` plus the `branding` setting); never put them in code or i18n. The web reads them with `getBrand(locale)`; receipts and bills get the badge in `header.mark`.
- **President toggles** (e.g. sharing renter data with the thana, separate funds) are `society_settings`, not code branches.
- **Responsive, mobile first.** Tables become cards on phones. Layouts target 375, 820 and 1440 px.
- **UI style.** Modern, neutral, card-based. Use the token classes from `apps/web/src/app/globals.css` (`bg-surface`, `text-good`, `bg-warn-soft`, ...), not raw colours.

## Module rules (read before working on a module)

Each file holds the rules earlier steps set for that area. Read only the ones the task touches.

| Area | File |
|---|---|
| Database workflow, migrations, UTF8, seed, deployment | `docs/rules/database.md` |
| API/web foundation, shared package, public site | `docs/rules/platform.md` |
| Login, sessions, CSRF, CLI | `docs/rules/auth.md` |
| Permissions, scopes, audit, roles and users admin | `docs/rules/permissions.md` |
| Uploads, private files, CMS | `docs/rules/cms-storage.md` |
| Location tree, units | `docs/rules/property.md` |
| People, owners, renters, residents, members, forms, moves, directory | `docs/rules/members.md` |
| Money, ledger, transfers, reports, overview | `docs/rules/finance.md` |
| Bills, schedules, billing runs | `docs/rules/billing.md` |
| Payments, receipts, handover, donations | `docs/rules/payments.md` |
| Expenses, budgets | `docs/rules/expenses.md` |
| Documents library | `docs/rules/documents.md` |
| Staff, attendance | `docs/rules/staff.md` |
| Payroll | `docs/rules/payroll.md` |
| Facilities, assets | `docs/rules/facilities.md` |
| Helpdesk, tickets, work orders | `docs/rules/helpdesk.md` |
| Vehicles, stickers, parking | `docs/rules/vehicles.md` |
| Certificates and NOCs | `docs/rules/certificates.md` |

When a step sets a new rule, add it to the matching file (or a new one listed here), not to this file.

## How Claude works on a step

Keep each step small and cheap in tokens.

- **Scope first.** Before building, post a short scope note: what is in, what is out, the files to touch, any migration. Build only after Anis confirms it.
- **Small slices.** One feature, one policy, one API path, one UI path per slice. Split a big step into parts (schema, API, UI, tests) that can each run in a fresh session.
- **File size.** No service, controller or component grows past about 350 lines. Put rules and planning in pure helpers (`packages/shared` contracts or a `*.policy.ts` beside the service) and test those with unit tests. Split an existing large file only when real work touches it.
- **Read narrowly.** Read only the needed part of a large file (offset and limit, or grep first). Don't re-read a file after editing it.
- **Tests.** While working, run only the affected spec or e2e file. E2e tests cover the key rules (scope, grants, money, conflicts), not every path. Run `pnpm check` once, before handover.
- **Docs once.** Update `docs/steps.md`, `docs/rules/` and memory once, at the end of the step, not along the way.
- **No subagents** unless Anis asks for them.

## Current state (2026-10-24)

- Steps 0–27 are done and merged into `main` (GitHub remote `origin`; Step 27 as PR #27, migration folders zero-padded in PR #28). Step 28 (certificates and NOCs, the first "Records and administration" item) is built on `step/28-certificates` and awaits Codex review. Planned next: Step 29 (member and property reports), Step 30 (module switches and one settings screen).
- The full step list with status and open decisions is in `docs/steps.md`; keep it updated as steps move.
- Visual checks at 375/820/1440 are deferred. When they resume, use CDP viewport emulation (headless Chrome won't go below about 500 px with `--window-size`).
- Still open: on an existing database built from the SQL file, run `pnpm --filter @s57/db migrate:resolve-baseline` once.

## Reference material

- `docs/glossary.md`: Person, Owner, Renter, Resident and Member in Bangla and English. User-facing text must follow it ("Member" is reserved for registered society members).
- `docs/schema-phase1.sql`: the phase-1 schema with design notes. Read the header before changing the data model.
- `docs/Sector 57 Production UI.html`: the UI mockup. Match its layout and components when building screens.
