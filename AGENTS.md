# Sector57 Agent Guide

## Project Shape

- pnpm 12.9.1 + Turborepo monorepo: apps in `apps/*`, packages in `packages/*`.
- `apps/api`: NestJS 12 (ESM, Vitest, oxlint), Prisma through `@s57/db`. Entry `src/main.ts`, port `PORT ?? 4000`.
- `apps/web`: Next.js 16, React 19, Tailwind CSS 4, shadcn, Base UI, lucide icons. App Router under `src/app`.
- `packages/db`: Prisma 7 schema, migrations, generated client, DB exports.
- `packages/shared`: framework-agnostic contracts, zod schemas, constants and helpers used by more than one app.

## Commands

- `pnpm install`, `pnpm dev`, `pnpm build`, `pnpm check` (lint, typecheck, test across the workspace).
- Per package: `pnpm --filter @s57/api <dev|build|lint|test|test:e2e>`, `pnpm --filter @s57/web <dev|build|lint>`.
- Database: `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:studio`, `pnpm --filter @s57/db generate`.
- While working, run only the affected spec or e2e file (`vitest run <path>`); run `pnpm check` once before handing work over.

## Code Style

- Follow `.editorconfig`: UTF-8, LF, two spaces, final newline, no trailing whitespace outside Markdown.
- ESM everywhere; in the API keep relative imports explicit with `.js` (`moduleResolution: "nodenext"`).
- Strict TypeScript and typed boundaries. Keep code in the package that owns it.
- Unit tests: Vitest with globals, `*.spec.ts` beside the code. E2E tests: `apps/api/test`, `vitest.config.e2e.ts`.

## Generated Output

- Never hand-edit `apps/api/dist/**`, `apps/api/*.tsbuildinfo`, `packages/db/dist/**`, `packages/db/generated/prisma/**`, `.turbo/**`, `node_modules/**`.
- After a Prisma schema change: update `schema.prisma`, add a migration, `pnpm --filter @s57/db generate`. Keep `pnpm-lock.yaml` in sync with dependency changes.

## Database

- Prisma config is `packages/db/prisma7.config.ts` (expects `DATABASE_URL`). `apps/api/src/prisma/prisma.service.ts` builds `PrismaClient` with `PrismaPg`; keep that adapter pattern.
- Some features live only in SQL migrations (check constraints, partial and trigram indexes, citext). Migrations are additive unless the user explicitly asks otherwise. Details: `docs/rules/database.md`.

## Web

- Read and obey `apps/web/AGENTS.md` before changing web code (Next.js 16 guidance).
- Follow `apps/web/components.json` (shadcn/Base UI) and the tokens in `apps/web/src/app/globals.css`; use lucide icons; keep UI accessible and responsive.

## Product Context

- Society management, multi-tenant (`society_id` everywhere), Bangla first: display text is `*_bn` (required) plus `*_en` (optional).
- Module rules set by earlier steps are in `docs/rules/<area>.md` (the index is in `CLAUDE.md`). Read the file for the area you touch.
- References: `docs/glossary.md`, `docs/schema-phase1.sql`, `docs/steps.md`, `docs/Sector 57 Production UI.html` (UI reference, not source).

## Agent Roles

Two agents work on this repo, each with a fixed job. When `CLAUDE.md` and this file seem to conflict, these roles decide; anything still unclear goes to Anis.

- **Claude (Claude Code): code and development.** Designs and implements features, schema changes, migrations and refactors. Owns the code that ships.
- **Codex: review, debug and test.** Reviews Claude's changes, debugs failures, writes and runs tests. Reports findings (bug, file, reproduction) for Claude to fix; small fixes needed to make a test or debug session run are fine.
- Neither agent undoes the other's work silently. Disagreements are written up for Anis to decide.

## Working Rules

- Inspect the relevant files and any nearer `AGENTS.md` before editing. Keep changes narrowly scoped.
- Do not remove the Next-generated block in `apps/web/AGENTS.md` or the Turborepo block below; the tools recreate them.
- Never run destructive database or Git operations unless explicitly requested.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
