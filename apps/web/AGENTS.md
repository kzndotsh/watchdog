# Watchdog web (`@watchdog/web`)

> Scope: `apps/web` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

TanStack Start UI. UI contracts live in **[`docs/reference/web/`](../../docs/reference/web/README.md)** (it wins over this file); web traps are indexed at [`README.md#traps-index`](../../docs/reference/web/README.md#traps-index). Design direction: [`DESIGN.md`](../../DESIGN.md).

## Commands

| Task | Command |
| --- | --- |
| Dev | `pnpm dev:web` |
| Typecheck | `pnpm --filter @watchdog/web typecheck` |
| DS bans | `pnpm --filter @watchdog/web ds:check` |
| Unit tests | `pnpm test:unit` (includes the `web-unit` project: `apps/web/src/**/__tests__/**/*.test.ts`) |
| Component tests | `pnpm test:component` |
| E2E | `pnpm test:e2e` · `pnpm test:e2e:smoke` · `pnpm test:e2e:journey` |
| Generate routes | `pnpm generate-routes` |
| Build | `pnpm build` |

## Rules

| Rule | Enforced by |
| --- | --- |
| Primitives: vanilla from `@watchdog/ui/components/*`, wrapped ones from `@/shared/ui/primitives/*` (the wrapped list is derived in `oxlint.config.ts`) | oxlint `no-restricted-imports`; `shadcn/no-restyle` bans `className` restyling in `domains/**` and `routes/**` |
| Split view = Queue + Detail (`SplitView`); no `*Console` / `*Workbench` / `*Tape` exports | `ds:check` (a `*Panel` screen name is reviewed by hand) |
| Query cache is the source of truth: `ensureQueryData` loaders and `useQuery` / named invalidation; no loader→`useState` forks, no QueryClient singleton | guidance |
| Caps/agents → Proposal → Triage Accept; never land output as `confirmed` Graph | guidance (root Boundaries) |

## Gotchas

- Keep server code off the client import graph: Job Detail reads artifacts through `getArtifactContentFn` in `jobs-artifact.functions.ts` (not `@watchdog/api`/`core` directly); zip/md export routes use `runApp`.
- Client UI must not import the `@watchdog/policy` barrel (pulls Effect into the browser): use the subpaths `@watchdog/policy/patch-needs-confidence` / `@watchdog/policy/confirmed-evidence`. For job/playbook labels use `@watchdog/core/job-display`, not another `@watchdog/core` subpath. Import `JobListRecord` / `JobRecord` from `@/domains/jobs/types`, not `jobs.functions`. Guidance only: no lint rule covers these.
- Process logging goes through `@watchdog/log` and the `src/start.ts` middleware.
