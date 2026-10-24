# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=26.12.1
ARG PNPM_VERSION=12.9.1

FROM node:${NODE_VERSION}-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
# Node 25+ no longer bundles corepack, so install pnpm directly.
RUN npm install -g pnpm@${PNPM_VERSION}

# Only the manifests, so the install layer is reused until a dependency changes.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/

# Full install (dev tools included) for building. The pnpm store is a BuildKit cache,
# so it never lands in an image and survives between builds.
FROM manifests AS build
RUN --mount=type=cache,id=s57-pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY . .
ARG API_URL=http://localhost:4000
ENV API_URL=${API_URL}
# Standalone output: Next copies only the files the server needs (see next.config.ts).
ENV NEXT_OUTPUT=standalone
RUN pnpm --filter @s57/db generate
# `locked`: compose builds the api and web targets in parallel, and two Next builds
# must not share Turbopack's cache at the same time.
RUN --mount=type=cache,id=s57-next,target=/app/apps/web/.next/cache,sharing=locked pnpm build

# API runtime dependencies: only the API and its workspace packages, not the web's.
# Prisma CLI and tsx stay because the container runs `migrate:deploy` and `seed`.
FROM manifests AS api-deps
RUN --mount=type=cache,id=s57-pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --store-dir /pnpm/store --filter "@s57/api..."

FROM api-deps AS api
ENV NODE_ENV=production
ENV PORT=4000
COPY --from=build /app/turbo.json ./
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/src/i18n ./packages/shared/src/i18n
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/db/generated ./packages/db/generated
COPY --from=build /app/packages/db/prisma ./packages/db/prisma
COPY --from=build /app/packages/db/prisma7.config.ts /app/packages/db/tsconfig*.json ./packages/db/
EXPOSE 4000
CMD ["pnpm", "--filter", "@s57/api", "start:prod"]

# Web runtime: the standalone server only, no pnpm and no node_modules install.
FROM node:${NODE_VERSION}-slim AS web
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
