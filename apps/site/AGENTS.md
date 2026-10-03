# AGENTS.md — `@watchdog/site`

> Scope: `apps/site` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

Static Astro landing for Watchdog. No Case Graph, auth, API routes, or worker: it links out to the product app and docs. Imports from `@watchdog/db`, `@watchdog/core`, or `apps/web/src` are kept out by an empty dependency list, not by lint. Design tokens are copied (trimmed) from `apps/web/src/styles/wd-*`; there is no `ds:check` coupling. Copy comes from `README.md` and `docs/explanation/product.md` only.

## Commands

| Task | Command |
| --- | --- |
| Dev (port 3001; also started by `just dev`) | `pnpm dev:site` |
| Build | `pnpm build:site` (production: `PUBLIC_APP_URL=https://app.watchdog.com pnpm build:site`) |
| Preview | `pnpm --filter @watchdog/site preview` |
| Typecheck | `pnpm --filter @watchdog/site typecheck` |

CTAs link to `{PUBLIC_APP_URL}/auth/sign-in`. The site is dark-only (v1).
