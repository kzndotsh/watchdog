# Effect jobs / worker

Load this when: changing Cap Job execution, cancel/timeout abort, worker
boot, boss roles, or Cap `ctx.signal` wiring. Single home for this design;
package AGENTS.md files link here.

## Boot

- Process entry: `NodeRuntime.runMain(provideWorkerLayers(bootWorkerEffect, jobQueueWorkerLayer))`;
  it provides `JobFibers.layer` once (a scoped `Context.Service` owning the
  FiberMap **and** the abort-reason map), `Db.layer`, and the worker queue
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
   immediate) finds cancelled ids → `JobFibers.abort` sets
   `"timeout"|"cancel"` **then** `Fiber.interrupt`. The reason is stored
   before the interrupt, never recovered from `Cause`.
3. Cap `ctx.signal` = fiber `Effect.abortSignal` (one timeout sleeper in
   `runReadyJobEffect`). **Not** a collect-local `AbortController`.
4. pg-boss `job.signal` **is** bridged (#397), through the same path:
   `interruptOnQueueSignal` (`jobs/queue-signal.ts`, wrapped around
   `executeJobOnMap` in the worker's `executeCapJobPayloadEffect`) forks a
   watcher that waits for the signal and calls `JobFibers.abort`. pg-boss aborts
   the signal when the handler outlives the job's `expireInSeconds` (it then
   fails the delivery and holds the worker slot until the handler returns), when
   a heartbeat finds the claim gone, and when a graceful stop gives up. An abort
   at or after the expiry stores reason `"timeout"` with the text
   `Timed out after <expiry>` (`timedOutMessage`, e.g. `Timed out after 1m 30s`);
   an earlier abort stores `"cancel"` (`aborted`). The text lives beside the
   reason (`JobFibers.peekDetail`) and `abortFailureMessage` is the one place
   that turns reason + detail into the Job's `error`. The Cap's own timer
   (collect only) stores `Timed out after <timeoutMs>` the same way. The
   expiry is the Cap's `timeoutMs` plus `POST_RUN_SLACK_MS`, so it mostly fires
   for post-collect stages or a Cap that ignores its signal.

## Job pipeline

- `executeJobOnMap(jobId)` / `executeJobEffect` require `JobFibers` in `R`
  and return `JobRunOutcome` (`outcome` / `stopReason` / `abortReason`).
  Public `executeJobEffect` stays `E = never`. Stages (under
  `jobs/stages/`) keep `DomainTag` / `ToolsTag` in `E` and carry
  `Effect.withSpan` (`cap.execute`, `cap.preflight`, `cap.collect`,
  `cap.interpret`, `cap.finish`).
- `run-job` `catchCause`: tagged → fail path; other defects stay defects.
  Effect 4 sticky interrupt: `catchCause` does **not** turn an interrupt into
  Success. `onExitIf` (interrupt-only) persists fail/cancel, and
  `executeJobOnMap` maps the `Fiber.await` interrupt Exit (clearing the abort
  reason there).
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
- Startup: `reconcileStaleJobsEffect` / `reconcileStuckPlaybookRunsEffect`
  keep `DomainTag` in `E`; the worker edge catches and logs.
- Playbook advance is `advancePlaybookRunEffect`. FiberMap-owned enqueue
  tails may `orDie` (`enqueueCapJobEffect` inside `enqueueReleasedEffect`).

## Legacy `blocked` rows

New playbook Jobs are always `queued`. `blocked` stays in the job vocab for
historical rows only: `decidePlaybookAdvance` still treats all-`blocked`
steps as releasable (the `blockedOnly` branch in
`packages/caps/src/playbooks/advance.ts`) and
`jobsRepo.abandonBlockedForPlaybook` cleans them. Delete the branch once no
in-flight run carries `blocked` rows. `TASK_STATUSES.blocked` (kanban column)
is unrelated.

## Product invariants (do not “simplify”)

- Cap `interpret` sync throw → Job succeeded + `interpretError`, no Proposal.
- Nested `runPromise` inside `transact` for Drizzle TX bodies.
- Export coalesce marks dirty and starts-or-joins the write fiber when the
  `scheduleCaseExportEffect` Effect is interpreted, with the interpreting
  caller's `Db` (the fiber outlives the caller).
