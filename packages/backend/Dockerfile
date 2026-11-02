# syntax=docker/dockerfile:1.27@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
#
# Dropsea backend image (@dropsea/backend), the shape of Willo's backend image.
#
# Bun runs the TypeScript entrypoint directly (`bun packages/backend/src/server.ts`);
# `bun run typecheck` below is a build-time gate only. Built for AWS Graviton
# (linux/arm64). The build context MUST be the monorepo ROOT so the workspace
# packages and the hoisted node_modules resolve (bunfig.toml pins
# `linker = "hoisted"`):
#
#   docker build -f packages/backend/Dockerfile -t dropsea-backend .
#
# sharp ships its libvips as a per-platform optional dependency
# (`@img/sharp-linuxmusl-arm64` here), so --ignore-scripts installs a working
# sharp with no install script. Runtime configuration comes from the
# environment: DATABASE_URL from SSM, the rest as plain task-definition env
# (see src/config/index.ts). Base images are pinned by index digest after the
# tag; bumping one means a new tag AND its digest.

# ── Stage 1: build (install deps, type-gate the backend) ────────────────────
FROM oven/bun:1.4.3-alpine@sha256:629e17411f1f129dbec3af78d5af9c9f2a937435c80349437206c6b0b7422373 AS builder
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
# Every workspace member's package.json, for the frozen install to reconcile.
COPY packages/backend/package.json packages/backend/
COPY packages/shared-types/package.json packages/shared-types/
RUN bun install --frozen-lockfile --ignore-scripts

COPY packages/shared-types/ packages/shared-types/
COPY packages/backend/tsconfig.json packages/backend/drizzle.config.ts packages/backend/
COPY packages/backend/src/ packages/backend/src/
RUN cd packages/backend && bun run typecheck

# ── Stage 2: runtime ──────────────────────────────────────────────────────
FROM oven/bun:1.4.3-alpine@sha256:629e17411f1f129dbec3af78d5af9c9f2a937435c80349437206c6b0b7422373 AS runtime
WORKDIR /app

RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup

COPY --from=builder /app/package.json /app/bun.lock /app/bunfig.toml ./
COPY --from=builder /app/packages/backend/package.json packages/backend/
COPY --from=builder /app/packages/shared-types/package.json packages/shared-types/
# Production dependencies only, from the manifests alone, so a source-only
# change reuses this layer.
RUN bun install --frozen-lockfile --production --ignore-scripts

COPY --from=builder /app/packages/backend/src/ packages/backend/src/
COPY --from=builder /app/packages/backend/tsconfig.json packages/backend/
# The SQL migrations `bun run db:migrate` applies at deploy time.
COPY packages/backend/drizzle/ packages/backend/drizzle/

ENV NODE_ENV=production
USER appuser

# config/index.ts: PORT (default 4300). Liveness is the ALB target group's
# check against GET /health (app.ts).
EXPOSE 4300

CMD ["bun", "packages/backend/src/server.ts"]
