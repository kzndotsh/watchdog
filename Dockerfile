# Watchdog container image: one definition, two targets.
#
#   docker build --target web    -t watchdog-web .
#   docker build --target worker -t watchdog-worker .
#
# Both targets ship bundles, not a dependency tree: every npm dependency is inlined at build
# time, so the runtime stages hold Node, the bundle and the migrator, and no node_modules, no
# dev dependencies and no package manager.
#
# Base image: Node 22 (the major CI and the nix shell use), Alpine, pinned by digest. The digest
# is the multi-arch index; Dependabot's docker entry bumps tag and digest together. This is the
# only line that names the base: every other stage builds on `node-base`.
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS node-base

# ---- build: toolchain and the full dependency tree (never shipped) ----
FROM node-base AS build
# pnpm comes from corepack at the version `packageManager` pins in package.json.
RUN corepack enable
WORKDIR /repo

# The lockfile alone is enough to fill the pnpm store, so this layer is rebuilt only when
# dependencies change, not on every source edit.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch --store-dir /pnpm/store

COPY . .
# --ignore-scripts: the root `prepare` (effect-tsgo oxlint patch) is a dev-tool hook that does not
# support musl, and no build step here needs a lifecycle script.
RUN pnpm install --offline --frozen-lockfile --ignore-scripts --store-dir /pnpm/store

# Web: TanStack Start production build with every dependency inlined into dist/server
# (WD_BUNDLE_SSR, see apps/web/vite.config.ts), then the server and the SSR build in one file.
RUN WD_BUNDLE_SSR=1 pnpm --filter @watchdog/web build \
    && pnpm --filter @watchdog/web build:serve
# Worker, migrator and the first-admin command: single-file bundles.
RUN pnpm --filter @watchdog/worker build && pnpm --filter @watchdog/db build:migrate \
    && pnpm --filter @watchdog/auth build:bootstrap

# ---- runtime: what both targets share ----
FROM node-base AS runtime
LABEL org.opencontainers.image.source="https://github.com/kzndotsh/watchdog"
ENV NODE_ENV=production \
    WD_MIGRATIONS_DIR=/app/drizzle \
    WD_EXPORT_DIR=/data/export \
    WD_LOG_DIR=/tmp/evlog
WORKDIR /app
COPY --from=build /repo/packages/db/dist/migrate.mjs ./migrate.mjs
COPY --from=build /repo/packages/db/drizzle ./drizzle
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
# Nothing at runtime needs a package manager: drop npm, npx, corepack and yarn, which carry their
# own dependency tree (and with it scanner findings) that is not Watchdog's.
# The Case Export shadow is the only thing the app writes to disk; mount a volume here to keep it.
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx \
        /usr/local/bin/corepack /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && chmod 0555 /usr/local/bin/entrypoint.sh \
    && mkdir -p /data/export \
    && chown -R node:node /data
# The base image's `node` user (uid/gid 1000), numeric so an orchestrator can verify non-root.
USER 1000:1000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# ---- web: the app and its API, runs migrations on start ----
FROM runtime AS web
LABEL org.opencontainers.image.title="watchdog-web"
COPY --from=build /repo/apps/web/dist/serve.mjs ./serve.mjs
COPY --from=build /repo/apps/web/dist/client ./client
# The first-admin command: `node bootstrap-admin.mjs --email you@example.com` (docs/how-to/self-host.md).
COPY --from=build /repo/packages/auth/dist/bootstrap-admin.mjs ./bootstrap-admin.mjs
ENV PORT=3000 \
    WD_CLIENT_DIR=/app/client
EXPOSE 3000
# Liveness only (/api/v1/health answers without touching Postgres or storage); readiness is
# /api/v1/ready, which the compose file and the CI smoke test use.
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 \
    CMD wget -q --spider "http://127.0.0.1:${PORT}/api/v1/health" || exit 1
CMD ["node", "serve.mjs"]

# ---- worker: Cap Job runner and Case Export, skips migrations by default ----
# No HEALTHCHECK: it serves no HTTP. A crash exits non-zero and the restart policy handles it.
FROM runtime AS worker
LABEL org.opencontainers.image.title="watchdog-worker"
COPY --from=build /repo/apps/worker/dist/worker.mjs ./worker.mjs
# The web container migrates; set WD_SKIP_MIGRATIONS=0 to make a worker migrate too.
ENV WD_SKIP_MIGRATIONS=1
CMD ["node", "worker.mjs"]
