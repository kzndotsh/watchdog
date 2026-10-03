# Worker app (`@watchdog/worker`)

> Scope: `apps/worker` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

Thin Cap Job runner: pg-boss `work` → `executeJobOnMap`, a cancel poll, and export events → `scheduleCaseExportEffect`. Logic stays in `@watchdog/core`; the worker has no `@watchdog/db` dependency, so it cannot run SQL.

## Commands

| Task                    | Command                                    |
| ----------------------- | ------------------------------------------ |
| Dev                     | `pnpm dev:worker`                          |
| Typecheck (src + tests) | `pnpm --filter @watchdog/worker typecheck` |
| Unit tests              | `pnpm test:unit`                           |

## Gotchas

- Job execution, cancel/abort, `JobFibers`, and one-boss-per-process: single home is [`effect/references/jobs.md`](../../.agents/skills/effect/references/jobs.md). Use `ensureBossWorkerEffect` only; the playbook chain is core's `advancePlaybookRunEffect`.
- Cap `timeoutMs` (from Caps) drives expire and graceful stop. Do not hardcode timeouts here.
- Export: `handleExportEventEffect` → `scheduleCaseExportEffect`, which coalesces; never start parallel case writes. `listenForEventsStream` + `Stream.runForEach` is the only LISTEN path.
- Boot: `initWatchdogLogger` first in `bootWorkerEffect`; `runMain` provides `JobFibers.layer`. Startup reconcile (`reconcileWorkerStartupEffect`) fails stale `running` rows and re-advances playbook runs with no open Jobs; it catches at the boot edge (log and continue).
- Log failures with `log.error(err)`, never `log.set({ error: err })` (an `Error` serializes to `{}`); evlog contract in [`evlog`](../../docs/reference/contracts/evlog.md). Process wide events: `jobWideEventFields(JobRunOutcome)`.

See also: [`packages/core/AGENTS.md`](../../packages/core/AGENTS.md) · [`jobs-orpc`](../../docs/reference/platform/jobs-orpc.md).
