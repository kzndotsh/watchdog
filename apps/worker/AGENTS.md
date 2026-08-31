# Worker app (`@watchdog/worker`)

> Scope: `apps/worker` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

Thin Cap Job runner: pg-boss `work` → `executeJob`, cancel poll, export events → `scheduleCaseExport`.

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
- Use `ensureBossWorker()` (`supervise: true`) only — never a second boss; playbook chain is `advancePlaybookRun` in core (`enqueueCapJob` on the live worker boss). Do not call deleted `releasePlaybookDependents` / `abandonPlaybookOnFailure`.
- Cancel: poll product `jobs.status` (~2s) and abort Cap `AbortController`; do not bridge pg-boss `job.signal`.
- Startup: `reconcileStaleJobs` fails stale `running` rows (per-Cap expire window); `reconcileStuckPlaybookRuns` re-advances playbook runs with no open Jobs (`queued`/`running`/`blocked`). All-`blocked` leftover recipes are not this path.
- Export: call `scheduleCaseExport(caseId)` only — coalesced; no parallel `writeCaseExport`.
- Logging: `initWatchdogLogger` first in `main()`; Cap Job wide events via `jobWideEventFields(executeJob → JobRunOutcome)`. Failures: `log.error(err)` — never `log.set({ error: err })` (`Error` → `{}`). Abort reasons: `abort("cancel")` / Cap timeout `abort("timeout")`. Analyze: `apps/worker/.evlog/logs/`.

## See also / External References

| Need | File |
| --- | --- |
| Job pipeline | [`packages/core/AGENTS.md`](../../packages/core/AGENTS.md) |
| Caps | [`packages/caps/AGENTS.md`](../../packages/caps/AGENTS.md) |
| Process logging | [`packages/log/AGENTS.md`](../../packages/log/AGENTS.md) |
| Platform architecture | [`docs/reference/platform/README.md`](../../docs/reference/platform/README.md) |
