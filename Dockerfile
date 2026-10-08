# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24.19.0
ARG PNPM_VERSION=12.9.1

FROM node:${NODE_VERSION}-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

FROM base AS deps
COPY . .
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG API_URL=http://localhost:4000
ENV API_URL=${API_URL}
RUN pnpm --filter @s57/db generate
RUN pnpm build

FROM base AS api
ENV NODE_ENV=production
ENV PORT=4000
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/turbo.json ./
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/packages/db ./packages/db
COPY --from=build /app/packages/shared ./packages/shared
EXPOSE 4000
CMD ["pnpm", "--filter", "@s57/api", "start:prod"]

FROM base AS web
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/turbo.json ./
COPY --from=build /app/apps/web ./apps/web
COPY --from=build /app/packages/shared ./packages/shared
EXPOSE 3000
CMD ["pnpm", "--filter", "@s57/web", "start"]
