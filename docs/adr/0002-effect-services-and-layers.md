# ADR-0002: Infrastructure moves to Effect services and Layers, in phases

**Status:** accepted (2026-10-04); phase 2 done (`Db` service, #126-#130); phase 3 queue done (`JobQueue`, #132) · closes [#46](https://github.com/kzndotsh/watchdog/issues/46) **What this is:** how core and the apps obtain the database, blob store, job queue and vault; why plain module functions are being replaced; the order of the migration; and what stays as it is. **What this is not:** the migration itself (tickets) or the error taxonomy ([#57](https://github.com/kzndotsh/watchdog/issues/57)).

## Context

Today the domain code reaches infrastructure through module-level singletons:

- 23 core files import the global `db` from `@watchdog/db` and hand it to repos as `exec: DbExec`; there are about 635 `(db, …)` / `(tx, …)` call sites.
- `transact` (21 call sites in 14 files) calls `db.transaction` on that global and runs the body in a nested `Effect.runPromise`. The body therefore cannot use services, interruption does not reach the transaction, and tagged errors are converted to `DomainError` and back.
- The S3 client (`blob.ts`) and the pg-boss queue (`boss.ts`) are module-level `let` singletons; the worker wires startup and shutdown by hand. (The queue is now the scoped `JobQueue` service; see the phase 3 note.)
- `packages/api/src/runtime.ts` builds a `ManagedRuntime` from `Layer.empty`, and the `/effect` skill and `packages/api/AGENTS.md` say not to introduce Layers. That policy was forced by the `transact` limitation above, not chosen on its merits.

Consequences: tests swap infrastructure by mocking modules, resource lifetimes are implicit, and a service the body of a transaction needs cannot be provided.

## Decision

Move infrastructure dependencies to Effect services (`Context.Service`) provided through Layers, in three phases. Each phase ships alone and keeps every suite green.

1. **Fix `transact`.** The transaction body runs with the caller's services, interruption reaches the transaction, and tagged errors pass through without the `DomainError` round trip. This was part of the error-model spec (#57), because retiring `DomainError` depends on it. **Shipped** (#117, PR #124): `transact` captures the caller's services (`Effect.context`), runs the body with `Effect.runPromiseExitWith(services)` and the callback's abort signal, so interruption aborts the run, the driver callback rejects and the transaction rolls back, and the callback waits for that rollback. A typed failure is carried out in a closure as its `Cause` (the driver callback throws a private marker to force the rollback) and re-raised unchanged; raw defects (for example a driver error) still roll back as themselves so `mapPostgresCatch` can map them. A `transact` nested inside another body still opens a second transaction; no call site does.
2. **`Db` service.** Provide the database client as a service and replace the 23 global `db` imports. `AppLive` composes the live Layer; tests compose a Layer over the test database.
3. **The rest.** Blob store, job queue (scoped acquire and release replacing the worker's hand-written shutdown), vault, and clock. **Queue shipped** (#132): `JobQueue` (`R` of `enqueueCapJobEffect`) with two role Layers, `jobQueueProducerLayer` (web/API, composed in `AppLive`, starts pg-boss lazily on the first send) and `jobQueueWorkerLayer` (adds `JobQueueWorker`, starts eagerly, releases with the same graceful `boss.stop` and `gracefulStopTimeoutMs()` budget). A process composes one role; the producer Layer does not provide `JobQueueWorker`, so worker-only code cannot type-check against it. The worker's SIGTERM sequence is now: runMain interrupts the main fiber, the boot scope closes, the queue Layer drains pg-boss, then `JobFibers` closes. `runDomain` stays `Db`-only: callers that enqueue pass a queue Layer through `runDomainWith` (tests use `recordingJobQueue()`); `runApp` includes the producer Layer.

The transaction handle stays an **explicit parameter**: repos and services keep taking `exec: DbExec` first, which the db package rules and `check:repos` already enforce. It is not moved into the Effect context.

## Why

- Layers make the dependency visible in the type and swappable in tests without module mocking.
- Resource lifetimes (the queue, the S3 client) become scoped and the worker's shutdown stops being bespoke.
- The `ManagedRuntime` and its composition root already exist; the Layer slot is empty, not missing.
- Phasing keeps each change reviewable, starting with the one that fixes real behaviour (interruption, error round trip).

## Consequences

- The "no Layers" lines in `.agents/skills/effect/SKILL.md`, `packages/api/AGENTS.md` and `packages/api/src/runtime.ts` describe the phase state: the `Db` Layer is live; do not add ad-hoc Layers outside the phases (the `JobQueue` role Layers are live; blob and vault next).
- Phase 2 changes how tests obtain the database; `@watchdog/test-db` provides the Layer.
- The ~635 `exec` call sites do not change, which is the main reason the handle stays explicit.

## Considered

- **Keep plain functions.** No migration, but tests keep mocking modules, the globals and the `transact` limitation stay.
- **Fix `transact` only.** Fixes the behaviour but leaves the globals; it is phase 1 of this decision rather than the whole of it.
- **Ambient transaction in the Effect context.** Removes the `exec` parameter, but rewrites about 635 call sites and the `check:repos` gate, and hides which calls run inside a transaction.
- **Everything at once.** One end state, but too large to review safely.

## Reopen when

- Phase 1 shows the nested promise boundary cannot propagate services or interruption (the driver's transaction API is promise-based), or
- the Effect Layer and Scope APIs change in a way that makes phase 2 or 3 expensive.
