# Effect jobs / worker

Load this when: changing Cap Job execution, cancel/timeout abort, worker
boot, or Cap `ctx.signal` wiring.

## Boot

- Process entry: `NodeRuntime.runMain(bootWorkerEffect)`.
- Provide `JobFibers.layer` once (FiberMap **and** abort-reason map).
- Export LISTEN: `listenForEventsStream` + `Stream.runForEach` only.
- Cancel poll: `cancelPollLoopEffect` (`Schedule.spaced("2 seconds")`,
  first tick immediate) forked inside `bootWorkerEffect`.

## Dual cancel SoT

1. Product: `jobs.status = cancelled` (authoritative).
2. Runtime: poll finds cancelled ids → `JobFibers.abort` sets
   `"timeout"|"cancel"` **then** `Fiber.interrupt`.
3. Cap `ctx.signal` = fiber `Effect.abortSignal` (one timeout sleeper in
   `runReadyJobEffect`). **Not** a collect-local `AbortController`.
4. Do **not** bridge pg-boss `job.signal`.

## Job pipeline

- `executeJobOnMap(jobId)` / `executeJobEffect` require `JobFibers` in `R`.
- Stages keep `DomainTag` / `ToolsTag` in `E`.
- `run-job` `catchCause`: tagged → fail path; other defects stay defects.
  Effect 4 sticky interrupt: `onExitIf` persists fail/cancel; `executeJobOnMap`
  maps `Fiber.await` interrupt Exit (not `catchCause` alone).
- Public `executeJobEffect` stays `E = never`.
- Collect yields `cap.run(ctx)` under `toolsHttpClientLayer` (no `runCap`
  in the worker path).
- Cap `timeoutMs` also drives pg-boss expire, graceful stop, stale reclaim.

## Product invariants (do not “simplify”)

- Cap `interpret` sync throw → Job succeeded + `interpretError`, no Proposal.
- Nested `runPromise` inside `transact` for Drizzle TX bodies.
- Export coalesce marks dirty with `runSync` so fire-and-forget
  `runPromise` still coalesces.
