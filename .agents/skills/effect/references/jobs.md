# Effect jobs / worker

Load this when: changing Cap Job execution, cancel/timeout abort, worker
boot, boss roles, or Cap `ctx.signal` wiring. Single home for this design;
package AGENTS.md files link here.

## Boot

- Process entry: `NodeRuntime.runMain(provideWorkerLayers(bootWorkerEffect, jobQueueWorkerLayer))`;
  it provides `JobFibers.layer` once (a scoped `Context.Service` owning the
  FiberMap **and** each attempt's stop slot), `Db.owned` (the pool's owner, released last), and the worker queue
  Layer.
- Shutdown = scope release. First SIGTERM/SIGINT: `runMain` interrupts the main
  fiber (exit 130 for SIGTERM and SIGINT alike, same as before phase 3); the boot scope closes (cancel poll, LISTEN stream); the
  queue Layer releases with `boss.stop({ graceful: true, timeout:
  gracefulStopTimeoutMs() })` so in-flight Cap Jobs finish; then `JobFibers`
  interrupts leftovers; then `Db`. The queue Layer must stay innermost in
  `provideWorkerLayers`; the `WorkerShutdown` Layer (signal listeners) is
  outermost, so a repeated signal also works during boot and the drain and
  force-exits (143 SIGTERM, 130
  SIGINT, 1 for a LISTEN failure); a LISTEN failure otherwise fails the boot
  with `WorkerListenError`, so the same release runs (queue drain first) and
  the process exits non-zero (1). This is a behavior change from exit 0; a
  restart-on-failure supervisor now restarts the worker.
- Export trigger: `runActivityConsumerEffect` only (R = `Db`): the worker reads the activity log from its durable cursor (`activity_cursors`, consumer `worker-export`), catching up at boot then live; there is no legacy-event LISTEN path.
- The pg-boss work handler runs `processCapJobBatchEffect` with `JobFibers`
  provided; it yields `executeJobOnMap(jobId)`.

## Boss roles

The queue is the `JobQueue` service (`jobs/job-queue.ts`, `R` of
`enqueueCapJobEffect`); no module-level boss. Two role Layers, one per
process: `jobQueueProducerLayer` (web/API via `AppLive`, `supervise: false`,
pg-boss starts lazily on the first send) and `jobQueueWorkerLayer` (worker,
`supervise: true`, also provides `JobQueueWorker` for `work`). Each acquires
pg-boss in its scope and releases it on scope close; the producer Layer does
not provide `JobQueueWorker`, so worker-only code cannot type-check against
it. The playbook chain enqueues through the worker's own `JobQueue`. After
release a send fails as `InternalError`; a blank job id is `InvalidError`.
Tests: `recordingJobQueue()`, `makeJobQueueLayers(() => fakeDriver)`.

## Dual cancel SoT

1. Product: `jobs.status = cancelled` (authoritative).
2. Runtime: `cancelPollLoopEffect` (`findCancelledJobIdsEffect`, spacing
   `CANCEL_POLL_SPACING` in `apps/worker/src/cancel-poll.ts`, first tick
   immediate) finds cancelled ids → `JobFibers.abort(id, { cause:
   "user_cancelled" })` offers the stop to the attempt's stop slot **then**
   `Fiber.interrupt`s. The stop is stored before the interrupt, never
   recovered from `Cause`.
3. Cap `ctx.signal` = fiber `Effect.abortSignal` (one timeout sleeper in
   `capBody`, which offers `cap_timeout` to the slot before it interrupts).
   **Not** a collect-local `AbortController`.
4. pg-boss `job.signal` **is** bridged (#397), through the same path:
   `interruptOnQueueSignal` (`jobs/queue-signal.ts`, wrapped around
   `executeJobOnMap` in the worker's `executeCapJobPayloadEffect`) forks a
   watcher that waits for the signal and calls `JobFibers.abort`. pg-boss aborts
   the signal when the handler outlives the job's `expireInSeconds` (it then
   fails the delivery and holds the worker slot until the handler returns), when
   a heartbeat finds the claim gone, and when a graceful stop gives up. An abort
   at or after the expiry offers `cap_timeout` with the text
   `Timed out after <expiry>` (`timedOutMessage`, e.g. `Timed out after 1m 30s`);
   an earlier abort offers `queue_aborted` (`aborted`). The text is the stop's
   `detail` and `stopMessage` is the one place that turns a stop into the Job's
   `error`. The Cap's own timer (collect only) offers `Timed out after
   <timeoutMs>` the same way. The first offer to the slot wins (races between
   sources record the first one's cause in `error_code`); the slot is the
   attempt's, dropped by `executeJobOnMap` when its fiber ends. The
   expiry is the Cap's `timeoutMs` plus `POST_RUN_SLACK_MS`, so it mostly fires
   for post-collect stages or a Cap that ignores its signal.

## Job pipeline

- `executeJobOnMap(jobId)` / `executeJobEffect` require `JobFibers` in `R`
  and return `JobRunOutcome` (`outcome` / `stopReason` / `stopCause`).
  Public `executeJobEffect` stays `E = never`; it is the lifecycle `run`
  around the Cap body (`capBody` in `run-job.ts`). Stages (under
  `jobs/stages/`) keep `DomainTag` / `ToolsTag` in `E` and carry
  `Effect.withSpan` (`cap.execute`, `cap.preflight`, `cap.collect`,
  `cap.interpret`, `cap.finish`).
- `lifecycle/run.ts` `run(jobId, { cap, system })` is `Effect.acquireUseRelease` (a system Job such as the Case export, `jobs/system-jobs.ts`, runs its own `system` body through the same claim and settle): acquire
  is the claim plus preflight, use is the Cap body, release (uninterruptible,
  once) settles from the Exit. A tagged failure settles `failed` (`cap_failed`),
  a defect settles `failed` and stays a defect, an interrupt settles from the
  stop slot (`queue_aborted` when no source wrote one), a finish settles
  `succeeded`. Effect 4 sticky interrupt: an interrupted fiber exits as
  interrupt however it is caught, so release publishes its `JobRunOutcome` to
  `JobFibers.attemptFor(jobId).settled` and `executeJobOnMap` reads it after
  `Fiber.await`. Acquire is uninterruptible, so an interrupt during preflight
  lands at the start of the body. A fiber interrupted before it starts claims
  nothing (the Job stays queued for the orphan reconcile).
- Log lines (#479): `lifecycle/run.ts` wraps each body in `withLogFlusher` (`jobs/job-log.ts`): a child fiber saves new `jobLog` lines every `WD_JOB_LOG_FLUSH_MS`, and an `ensuring` stops it and saves once more before the settle, on every exit (finish, failure, interrupt). The lines are bounded in `createJobLog`.
- Collect yields `cap.run(ctx)` under `httpClientLayer` over the worker's
  `OutboundClient` (no `runCap` in the worker path; `OutboundClient` is in
  `executeJobOnMap`'s `R`).
- Cap `timeoutMs` also drives pg-boss expire, graceful stop, stale reclaim.
- pg-boss `persistWarnings: true` (both roles): warnings (handler overrun,
  queue backlog, slow query, ...) are written to `pgboss.warning` (pg-boss
  prunes it by `warningRetentionDays`) and logged through `@watchdog/log` at
  `warn` level, scope `pg-boss:producer` / `pg-boss:worker`
  (`logProcessWarning`). A `handler_overrun` warning means a handler kept the
  worker slot after its job expired: the interrupt had not finished yet, or
  Cap code ignored interruption.
- Interruption: `safeFetch` runs under the Job fiber through the `HttpClient`
  (and `unshorten` / `http-probe` through the same client), so a Job abort
  aborts the in-flight request; the `OutboundClient` pools close after
  `JobFibers`. A Cap that does non-Effect work (a promise, a child process)
  only stops if it honours `ctx.signal`.
- Reconcile: `reconcileJobsEffect` keeps `DomainTag` in `E`; the worker edge
  (`jobReconcileLoopEffect`, `apps/worker/src/job-reconcile.ts`) catches and
  logs. The worker schedules it (boot, then every `JOB_RECONCILE_INTERVAL`);
  core never forks a loop.
- Playbook advance is `advancePlaybookRunEffect`. FiberMap-owned enqueue
  tails may `orDie` (`enqueueCapJobEffect` inside `enqueueReleasedEffect`).

## Status lifecycle

`packages/core/src/jobs/lifecycle/` owns how a Job's status moves. `decideJob`
is a pure table over every status and event (`claim`, `succeed`, `fail`,
`cancel`); a terminal Job has no move. `settleJobEffect` (`settleJobInTx` inside a
caller's transaction) is the one writer for claim, finish, fail, cancel and
reclaim: it locks the row, asks the table, and writes
with the guard `allowedFromStatuses(event)` derives from that same table
(`jobsRepo.settle`), so no writer keeps a status list of its own. A `fail` or
`cancel` event carries a `JobStopCause`, stored in `jobs.error_code` beside the
free-text `error`. `run` (above) is the worker's settle. Every terminal outcome that
settles through it (finish, failure, defect, interrupt, a preflight stop that
wrote a status, `reclaim_converged`) runs `advancePlaybookTailEffect` after the
status commit, and a success (a reclaimed one too) stores the Cap cache
(`capCacheKey`) and stamps the source Evidence. Reconcile (`reconcileJobsEffect`) repairs through
`settleJobEffect` and the same tail. A stop that finds the Job already terminal (the cancel poll
aborting a Job cancelled elsewhere) moves nothing and advances nothing: the writer that ended the
Job owns the advance.

Stop sources, one entry point each:

- `stop(selector, cause, detail?)` (`lifecycle/stop.ts`; selector `job` or
  `running`) is for a source with no transaction open: it offers the cause to
  the attempt's stop slot and interrupts the fiber (`JobFibers.abort`), and the
  release of `run` settles and advances. The pg-boss signal, the cancel poll
  and graceful shutdown use it. The `JobFibers` layer's finalizer stops every
  fiber still running with `worker_shutdown`, so those Jobs end `failed`, not
  `cancelled` (the pg-boss signal that fires when graceful stop gives up still
  says `queue_aborted`).
- `cancelWithin(tx, selector, cause)` (`lifecycle/cancel.ts`; selector `job`,
  `case` or `playbookRun`; cause `user_cancelled` or `case_deleted`) is for the
  API cancel (`cancelJobEffect`, `cancelPlaybookRunEffect` in
  `jobs/cancel-jobs.ts`) and Case delete (`tombstoneInTx`). Inside the caller's
  transaction it settles each open Job with a `cancel` event and returns
  `{ cancelled, afterCommit }`. Run `afterCommit` only after the commit: it
  aborts a fiber this process runs for each cancelled Job (other workers see
  the row through the cancel poll) and advances each Playbook run once. A
  rolled-back transaction never yields it, so nothing is advanced or aborted.
  Its `R` is `Db | JobQueue` (the advance may enqueue); `JobFibers` is optional,
  because the API process runs no Job fibers. `jobsRepo.listIdsInStatuses`
  only names the candidates, with the statuses taken from the table.
`blocked` no longer exists: migration 0041 moved old rows to `failed` with
`legacy_blocked`. `TASK_STATUSES.blocked` (kanban column) is unrelated.

## Product invariants (do not “simplify”)

- Cap `interpret` sync throw → Job succeeded + `interpretError`, no Proposal.
- Nested `runPromise` inside `transact` for Drizzle TX bodies.
- Export coalesce marks dirty and starts-or-joins the write fiber when the
  `scheduleCaseExportEffect` Effect is interpreted, with the interpreting
  caller's `Db` (the fiber outlives the caller).
