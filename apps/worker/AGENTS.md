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

- Job execution, cancel/abort, `JobFibers`, and one-boss-per-process: single home is [`effect/references/jobs.md`](../../.agents/skills/effect/references/jobs.md). The queue is the `JobQueue` + `JobQueueWorker` services from `jobQueueWorkerLayer` (never construct a boss here); the playbook chain is core's `advancePlaybookRunEffect`.
- Cap `timeoutMs` (from Caps) drives expire and graceful stop. Do not hardcode timeouts here.
- Export: `handleExportEventEffect` → `scheduleCaseExportEffect`, which coalesces; never start parallel case writes. `listenForEventsStream` + `Stream.runForEach` is the only LISTEN path.
- Shutdown follows scope release (ADR-0002 phase 3): the first SIGTERM/SIGINT is `NodeRuntime.runMain`'s (interrupts the main fiber; the process exits **130 for SIGTERM as well as SIGINT**, as it did before this change, measured on `main`); the boot scope closes (cancel poll and LISTEN stream stop), then `jobQueueWorkerLayer` releases with a graceful `boss.stop` bounded by `gracefulStopTimeoutMs()` (in-flight Cap Jobs finish), then `JobFibers`, then `Db` and the blob store. `main.ts` composes them through `provideWorkerLayers` (`layers.ts`): keep the queue Layer innermost. `shutdown.ts` is the `WorkerShutdown` service, its Layer provided outermost by `provideWorkerLayers` so the listeners exist from process start and outlive the drain: a repeated signal (during boot or the drain) force-exits 143 SIGTERM / 130 SIGINT, and it owns the LISTEN-failure path: the boot fails with `WorkerListenError`, the same release runs (queue drain first), and the process exits **1** (a behavior change from exit 0, so a restart-on-failure supervisor restarts the worker). A LISTEN failure during shutdown force-exits 1. Export events claim (mark dirty, start the write) in the listener fiber and fork only the wait.
- Boot: `initWatchdogLogger` first in `bootWorkerEffect`; `main.ts` provides `Db.layer`, `blobStoreLayer` (the S3 client, destroyed on release), `JobFibers.layer` and the worker queue Layer. Startup reconcile (`reconcileWorkerStartupEffect`) fails stale `running` rows and re-advances playbook runs with no open Jobs; it catches at the boot edge (log and continue).
- Log failures with `log.error(err)`, never `log.set({ error: err })` (an `Error` serializes to `{}`); evlog contract in [`evlog`](../../docs/reference/contracts/evlog.md). Process wide events: `jobWideEventFields(JobRunOutcome)`.

See also: [`packages/core/AGENTS.md`](../../packages/core/AGENTS.md) · [`jobs-orpc`](../../docs/reference/platform/jobs-orpc.md).
