# AGENTS.md — `@watchdog/site`

Static marketing landing for Watchdog (`watchdog.com`). No Case Graph, auth, or worker — link out to the product app and docs only.

## Scope

- Single landing page (`/`) — no auth, DB, worker, or Cap runtime
- CTAs link to `{PUBLIC_APP_URL}/auth/sign-in` via `PUBLIC_APP_URL`
- Tokens copied from `apps/web/src/styles/wd-*` (trimmed); no `ds:check` coupling

## Commands

| Task            | Command                                               |
| --------------- | ----------------------------------------------------- |
| Dev (port 3001) | `pnpm dev:site` or `pnpm --filter @watchdog/site dev` |
| Build           | `pnpm build:site`                                     |
| Preview         | `pnpm --filter @watchdog/site preview`                |
| Typecheck       | `pnpm --filter @watchdog/site typecheck`              |

Production build: `PUBLIC_APP_URL=https://app.watchdog.com pnpm build:site`

## Boundaries

| Do | Don't |
| --- | --- |
| Static `.astro` + CSS tokens | Import `@watchdog/db`, `@watchdog/core`, or `apps/web/src` |
| Link out to GitHub docs and product sign-in | Add Better Auth, API routes, or secrets |
| Use semantic token utilities in components | Hardcode hex in `.astro` files |
| `cn()` for conditional classes | Scroll animations, `backdrop-blur`, `tracking-*` |
| Distinct layout per section: centered hero, full-width demo, visual how-it-works, split contrast, collector grid | Repeating the same heading+card-grid template every section |

Not part of `just dev` — no infra dependency.

## Design

Dark-only v1. One primary CTA (**View docs**). Sign in stays in the header. Copy from README + `docs/explanation/product.md` only. See root plan / `README.md` for merge gate checklist.
