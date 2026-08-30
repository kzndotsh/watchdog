<!-- intent-skills:start -->

## Skill Loading

No `apps/web`-scoped skill exists yet. Root-level Agent Skills in [`.agents/skills/`](../../.agents/skills/) (`audit-contract`, `check-gates`) apply here too. Load explicitly (`/audit-contract`, `/check-gates`) rather than relying on auto-selection.

<!-- intent-skills:end -->

# Watchdog web (`@watchdog/web`)

> Scope: `apps/web` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

TanStack Start UI for Watchdog. Web UI contracts live in [`docs/`](docs/README.md). Platform doctrine / architecture / UX: [`docs/`](../../docs/README.md). When UI contracts disagree with root AGENTS, **`apps/web/docs/` wins**; platform nouns → **`docs/`**.

## Commands

| Task | Command |
| --- | --- |
| Dev | `pnpm dev:web` |
| Typecheck | `pnpm --filter @watchdog/web typecheck` |
| DS bans | `pnpm --filter @watchdog/web ds:check` |
| Unit tests | `pnpm test:unit` (packages + worker + web `*.test.ts`) |
| Component tests | `pnpm test:component` (`*.component.test.tsx` + hook RTL tests) |
| E2E | `pnpm test:e2e` |
| Generate routes | `pnpm generate-routes` |
| Build | `pnpm build` |

## Boundaries

| Do | Don’t |
| --- | --- |
| Split = Queue + Detail (`SplitView`) | Console / Tape / Panel / Pane / Rail / Strip as surfaces |
| Query cache SoT — `ensureQueryData` / `useSuspenseQuery` / named invalidation | Loader→`useState` forks; QueryClient singleton |
| Reuse domain `hooks/*` workspace hooks (`use-jobs-workspace`, `use-task-workspace`, `use-triage-workspace`, `use-intake-actions`, …) | Duplicate Queue/Detail mutation machines in components |
| Read web `docs/` + platform `docs/` before inventing | Reinvent from `_legacy-v2` without reading it as reference |
| Caps/agents → Proposal → Triage Accept | Land Cap/agent output as `confirmed` Graph |
| Process logs via `@watchdog/log` + `src/start.ts` middleware | `withEvlog` on handlers; secrets / Evidence bodies in log fields; treat NDJSON as Graph audit |

## Gotchas

- Env: repo-root `.env` via Vite `envDir: "../../"`; schema in [`@watchdog/env`](../../packages/env/AGENTS.md). Cap secrets = vault, not env.
- Solo signup: no account is seeded. `BETTER_AUTH_ALLOW_SIGNUP=1` → restart web → register at `/auth/sign-up` → set back to `0`. There is no `/login` route; Better Auth views are `/auth/$path`.
- Prefer [`docs/GOTCHAS.md`](docs/GOTCHAS.md) for Router/Query/SSE/hydration traps.
- **Loading shell doctrine:** thin loaders + `warm*Queries`; in-page `RegionBoundary` / `PendingRegion` in data slots only — no route `RoutePending` on shell-first pages. Sixteen rules + ban table: [`UI.md`](docs/UI.md) § Loading & hydration.
- **Table loading:** `DataTable` `pending` + per-cell skeleton rows only — never `PendingRegion` on table bodies ([`UI.md`](docs/UI.md) § Tables).
- **Hand skeletons:** domains gate data slots with `PendingRegion` from `@/shared/ui/pending-region`; shapes live in `shared/ui/skeletons.tsx`.
- **Jobs:** queue grouping uses `playbookRunStatus` + recipe length (`lib/status.ts`); waiting chrome is the next recipe step, not Job `blocked`. Playbook seeds include ip/email/hash/handle (`lib/playbook-seed-view.ts`).
- **Tasks:** DnD math in `lib/task-board-dnd.ts`. Cross-column drop changes status; within-column drop calls `reorderTasks` (`position`). `use-task-workspace` owns `handleCommitDrop`.
- Evlog: `src/start.ts` owns request + function middleware; dynamic-import drain init inside `.server()` only (never top-level `evlog/fs`). Drain dir = `apps/web/.evlog/logs/` (not `apps/.evlog`). Identify in `createApiContext` only. `orpcForActor` injects ALS `log`. Capture failures with `log.error(err)` or `log.setLevel("warn")` + serializable fields — never `log.set({ error: someError })` (`Error` JSON-stringifies to `{}`).
- CSRF: keep `createCsrfMiddleware({ filter: serverFn })` in `requestMiddleware` after evlog (`[evlogRequestMiddleware, csrfMiddleware]` — logger outermost). ServerFn paths skip the `/api/**` request logger; CSRF 403s on `/_serverFn` still emit a warn (`auth.reason: "csrf"`). Custom `start.ts` disables Start’s auto-install.
- ServerFn auth is global: `functionMiddleware: [evlogFunctionMiddleware, requireAuth]` (logger outermost so `UnauthorizedError` still emits). Do not re-add per-fn `.middleware([requireAuth])`. No per-fn opt-out — public endpoints = HTTP `routes/api/*`, never an unauthenticated ServerFn. Expected denials (`UnauthorizedError` from `requireSession`) log `level: "warn"` + `auth: { denied, reason: "no_session" }`; unexpected throws use `log.error`.
- Auth layers stay separate: BA UI / `_protected` = UX redirect; Start `requireAuth` = data gate (throw `UnauthorizedError`); `/api/auth` = cookies.
- Better Auth API keys inherit full account authority (same as session). Default expiry is 90 days with rate limiting enabled in `auth/server.ts`.

## See also / External References

| Need | File |
| --- | --- |
| Web docs | [`docs/README.md`](docs/README.md) |
| Platform docs | [`docs/README.md`](../../docs/README.md) |
| Product / UX / Caps | [`PRODUCT`](../../docs/PRODUCT.md) · [`UX`](../../docs/UX.md) · [`CAPS`](../../docs/CAPS.md) · [`TYPES`](../../docs/TYPES.md) |
| UI / Domains / Data | [`UI`](docs/UI.md) (loading contract § Loading & hydration, § Loading skeletons) · [`DOMAINS`](docs/DOMAINS.md) (§ `hooks/` + `lib/`, Page ownership, Map) · [`DATA`](docs/DATA.md) |
| Architecture | [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) · process logging |
| Log package | [`packages/log/AGENTS.md`](../../packages/log/AGENTS.md) |
