# Worker app (`@watchdog/worker`)

> Scope: `apps/worker` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

Thin Cap Job runner: pg-boss `work` → `executeJobOnMap`, cancel poll, export events → `scheduleCaseExportEffect`.

## Commands

| Task       | Command                                    |
| ---------- | ------------------------------------------ |
| Dev        | `pnpm dev:worker`                          |
| Typecheck  | `pnpm --filter @watchdog/worker typecheck` |
| Unit tests | `pnpm test:unit`                           |

## Boundaries

| Do                                    | Don’t                                |
| ------------------------------------- | ------------------------------------ |
| Stay thin — logic in `@watchdog/core` | Reimplement job stages in the worker |
| One boss per process via core helpers | Spawn extra pg-boss instances        |
| React to export-triggering events     | Write Graph from the worker          |

## Gotchas

- Imports `@watchdog/env/server` for boot validation.
- Cap `timeoutMs` (from Caps) drives expire / graceful stop — do not hardcode elsewhere.
- Use `ensureBossWorkerEffect` (`supervise: true`) only — never a second boss; playbook chain is `advancePlaybookRunEffect` in core (`enqueueCapJobEffect` on the live worker boss). Do not call deleted `releasePlaybookDependents` / `abandonPlaybookOnFailure`.
- Cancel: `cancelPollLoopEffect` (`findCancelledJobIdsEffect` + `Schedule.spaced("2 seconds")`, first tick immediate) forked inside `bootWorkerEffect`. Yields `JobFibers` and calls `fibers.abort` (FiberMap interrupt + abort reason set before interrupt). Do not bridge pg-boss `job.signal`.
- Export: `handleExportEventEffect` → `scheduleCaseExportEffect` (forkDetach join). `listenForEventsStream` + `Stream.runForEach` is the only LISTEN path. Coalesced; no parallel case writes.
- Startup: `reconcileStaleJobsEffect` fails stale `running` rows (per-Cap expire window); `reconcileStuckPlaybookRunsEffect` re-advances playbook runs with no open Jobs (`queued`/`running`/`blocked`). All-`blocked` leftover recipes are not this path.
- Logging: `initWatchdogLogger` first in `bootWorkerEffect`; `runMain` provides `JobFibers.layer`. Cap jobs: pg-boss `work` calls `Effect.runPromise(processCapJobBatchEffect.pipe(provideService(JobFibers)))` which yields `executeJobOnMap(jobId)`. Export events: `listenForEventsStream` + `Stream.runForEach`. Cap Job wide events via `jobWideEventFields(executeJobOnMap → JobRunOutcome)`. Failures: `log.error(err)` — never `log.set({ error: err })` (`Error` → `{}`). Abort reasons: `abort("cancel")` / Cap timeout `abort("timeout")`. Analyze: `apps/worker/.evlog/logs/`. Process entry: `NodeRuntime.runMain(bootWorkerEffect)`. Effect.log goes through `evlogEffectLoggerLayer`. Tests run `bootWorkerEffect` (same program as prod).

## See also / External References

| Need | File |
| --- | --- |
| Job pipeline | [`packages/core/AGENTS.md`](../../packages/core/AGENTS.md) |
| Caps | [`packages/caps/AGENTS.md`](../../packages/caps/AGENTS.md) |
| Process logging | [`packages/log/AGENTS.md`](../../packages/log/AGENTS.md) |
| Platform architecture | [`docs/reference/platform/README.md`](../../docs/reference/platform/README.md) |
