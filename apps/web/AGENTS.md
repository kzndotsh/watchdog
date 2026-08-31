<!-- intent-skills:start -->

## Skill Loading

No `apps/web`-scoped skill exists yet. Root-level Agent Skills in [`.agents/skills/`](../../.agents/skills/) (`audit-contract`, `check-gates`) apply here too. Load explicitly (`/audit-contract`, `/check-gates`) rather than relying on auto-selection.

<!-- intent-skills:end -->

# Watchdog web (`@watchdog/web`)

> Scope: `apps/web` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

TanStack Start UI for Watchdog. When UI contracts disagree with root AGENTS, **[`docs/reference/web/`](../../docs/reference/web/README.md) wins**; platform nouns → **[`docs/`](../../docs/README.md)**.

## Commands

| Task | Command |
| --- | --- |
| Dev | `pnpm dev:web` |
| Typecheck | `pnpm --filter @watchdog/web typecheck` |
| DS bans | `pnpm --filter @watchdog/web ds:check` |
| Unit tests | `pnpm test:unit` (packages + worker only — web `*.test.ts` runs in `pnpm test:component`) |
| Component tests | `pnpm test:component` (`*.component.test.tsx` + web lib/hook `*.test.ts`) |
| E2E | `pnpm test:e2e` · `pnpm test:e2e:smoke` · `pnpm test:e2e:journey` |
| Generate routes | `pnpm generate-routes` |
| Build | `pnpm build` |

## Boundaries

| Do | Don’t |
| --- | --- |
| Split = Queue + Detail (`SplitView`) | Console / Tape / Panel / Pane / Rail / Strip as surfaces |
| Query cache SoT — `ensureQueryData` / `useSuspenseQuery` / named invalidation | Loader→`useState` forks; QueryClient singleton |
| Reuse domain `hooks/*` workspace hooks | Duplicate Queue/Detail mutation machines in components |
| Read [`docs/reference/web/`](../../docs/reference/web/README.md) before inventing | Reinvent from `_legacy-v2` without reading it as reference |
| Caps/agents → Proposal → Triage Accept | Land Cap/agent output as `confirmed` Graph |
| Process logs via `@watchdog/log` + `src/start.ts` middleware | Secrets / Evidence bodies in log fields; treat NDJSON as Graph audit |

Canonical contracts: [`docs/reference/contracts/`](../../docs/reference/contracts/README.md). Web traps: [`docs/reference/web/README.md#traps-index`](../../docs/reference/web/README.md#traps-index).

## See also

| Need | File |
| --- | --- |
| Web docs | [`docs/reference/web/README.md`](../../docs/reference/web/README.md) |
| UI leaves | [`ui/`](../../docs/reference/web/ui/README.md) · loading · tables · page-shell |
| Domains / Data | [`domains.md`](../../docs/reference/web/domains.md) · [`data.md`](../../docs/reference/web/data.md) |
| Product / UX / Caps | [`product`](../../docs/explanation/product.md) · [`ux`](../../docs/explanation/ux.md) · [`caps-lexicon`](../../docs/reference/platform/caps-lexicon.md) |
| Auth / local-dev | [`auth-setup`](../../docs/how-to/auth-setup.md) · [`local-dev`](../../docs/how-to/local-dev.md) |
| Log package | [`packages/log/AGENTS.md`](../../packages/log/AGENTS.md) |
