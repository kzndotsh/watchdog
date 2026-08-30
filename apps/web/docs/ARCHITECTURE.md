# Architecture — `@watchdog/web`

**What this is:** TanStack Start layout, Vite, chrome, and the web server-fn boundary.  
**Not:** package import graph, Caps, Collect/Triage/Export — that is [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md).

## Stack

| Choice | Value |
| --- | --- |
| Framework | TanStack Start (React) — blank / default CLI preset |
| Router | TanStack Router file-based (`src/routes`) |
| Bundler | Vite 8 + `@vitejs/plugin-react` |
| CSS | Tailwind CSS v4 (`@tailwindcss/vite`) + `@tailwindcss/typography` |
| Package manager | pnpm (workspace: repo root) |
| Devtools | `@tanstack/react-devtools` + router panel + React Query Devtools; `@tanstack/devtools-vite` first in Vite plugins |
| Server state | TanStack Query via `@tanstack/react-router-ssr-query` (QueryClient in router context) |

Docs index: [https://tanstack.com/llms.txt](https://tanstack.com/llms.txt) → Start / Router.

## Layout decisions

1. **Official CLI output is SoT for Start layout** — `src/routes`, `src/router.tsx`, `vite.config.ts` with `devtools()` first, then Tailwind, `tanstackStart()`, `viteReact()`. Theme toggle lives in `shared/layout/` (chrome).
2. **Import alias** — hand-written files use `@/*` → `./src/*`. No relative `./` / `../` in hand-written files — use `@/domains/...` full paths. (`#/*` still works; `@/*` is canonical.)
3. **Monorepo / packages** — see [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md) (import direction, Caps, Jobs, oRPC).
4. **Product chrome** — `shared/layout/app-shell.tsx` wraps shadcn `SidebarProvider` + `SidebarInset`; nav in `shared/layout/app-sidebar.tsx`. Page chrome beside `page.tsx`: `page-toolbar`, `page-filter-menu`, `route-pending`, `route-error`. Active Case id = httpOnly cookie (`watchdog.active-case-id`); Case rows = Postgres.
5. **Auth** — Better Auth + Drizzle adapter; tables in `auth` schema; `/api/auth/$`; solo signup via `BETTER_AUTH_ALLOW_SIGNUP`. API keys via `@better-auth/api-key`; Settings → API Keys. Pass `Authorization: Bearer <key>` or `x-api-key`. Layers: BA UI / `_protected` = UX redirect; Start `requireAuth` (global `functionMiddleware`) = ServerFn data gate (throw `UnauthorizedError`); `/api/auth` = cookies. CSRF: `createCsrfMiddleware({ filter: serverFn })` after evlog in `src/start.ts` `requestMiddleware`.
6. **Server boundary (Start)** — `.functions.ts` = RPC surface (`createServerFn`, safe to import from UI). Auth is global via `functionMiddleware: [evlogFunctionMiddleware, requireAuth]` — do not re-add per-fn `.middleware([requireAuth])`; no public ServerFn opt-out (use `routes/api/*`). Prefer **thin ServerFns → `orpcForActor` → `@watchdog/api` → `@watchdog/core` → `@watchdog/db` repos**. Do not put Drizzle in `apps/web` (allowlist: Better Auth adapter + SSE `listenForEvents`). Shared DTOs + Zod in `types.ts`. Full contract: [`DOMAINS.md`](DOMAINS.md), [`docs/TYPES.md`](../../../docs/TYPES.md). Process logs: `src/start.ts` request + function middleware (`@watchdog/log`); see platform [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md#process-logging-evlog).
7. **Isomorphic by default** — use `createServerFn` for server-only work. Do not use `*.client.ts` for server functions.
8. **Domain layout** — see [`DOMAINS.md`](DOMAINS.md). `domains/{noun}/` = product surfaces; graph children in `entities/{child}/`; dossier chrome in `dossier/components/`. Domain `hooks/` own workspace state (e.g. `use-jobs-workspace`, `use-triage-workspace`, `use-intake-actions`, `use-dump-evidence`, `use-entity-table`, `use-dossier-shell`, `use-triage-detail-forms`, `use-search-ui`); pure helpers stay in `lib/` — see [`DOMAINS.md`](DOMAINS.md) § hooks/lib + Map. Shell-mounted search lives in `domains/search` (`SearchChrome` from `AppShell`).

## Realtime / Case data

Query cache + loaders + Active Case cookie + SSE — see [`DATA.md`](DATA.md).

- Router: `createAppQueryClient()` + `setupRouterSsrQueryIntegration` in `src/router.tsx`.
- Hook: `shared/hooks/use-live-events` → named invalidation contracts in `shared/lib/query-invalidation.ts`.
- Active Case cookie helpers: `domains/cases/lib/active-case*`.
- No manual Refresh buttons for live paths; no loader→`useState` fork for server lists.

## Web oRPC wiring

- **RPC:** `src/routes/api/rpc.$.ts` → `RPCHandler` prefix `/api/rpc`.
- **OpenAPI:** `src/routes/api/v1.ts` + `v1.$.ts` → `OpenAPIHandler` prefix `/api/v1` (Bearer + `x-api-key` + session). Spec `/api/v1/spec.json`.
- Auth context: Better Auth session → `ApiActor` (`src/auth/api-context.server.ts`); identify fields for logs live there (one `getSession`).
- ServerFns: `src/lib/orpc.server.ts` in-process client (`orpcForActor`) — preferred path for domain I/O; injects ALS `log` from Start middleware. Case Export zip/md = authenticated file routes (API key OK) — not oRPC.
- `src/lib/` holds app RPC/OpenAPI wiring + `utils` only — not domain cookie/SSE helpers.
- Platform oRPC / client contract: [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md).

## Scaffold note

CLI create command + Intent install recorded in `.cta.json`. Historical scaffold steps live in git history of `AGENTS.md` if needed.
