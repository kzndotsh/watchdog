---
name: effect
description: >-
  Use when writing or reviewing Effect code in Watchdog (core, api, caps,
  tools, worker, policy) — tagged E, run* edges, JobFibers/cancel, Cap run,
  HttpClient layers, or browser Effect boundaries. Trigger on Effect.gen,
  DomainTag, ToolsTag, runApp, runDomain, JobFibers, toolsHttpClientLayer,
  or "how should Effect look here". Do NOT trigger for generic Effect API
  docs alone — read `node_modules/effect/AGENTS.md` first; this skill is
  Watchdog runtime conventions only.
metadata:
  owner: watchdog
  sources: oxlint.config.ts, docs/reference/platform/jobs-orpc.md
---

# Effect (Watchdog)

Single home for Watchdog Effect runtime doctrine. Not an Effect API tutorial.

## Outcomes

- **Clean** — change matches the edges below and the nearest package AGENTS.
- **Changed** — Effect code/allowlist updated to match doctrine.
- **Blocked** — needs a new `run*` edge or Layer; stop and ask before inventing one.

## Edit scope

May edit Effect programs under `packages/*` / `apps/*` and `oxlint.config.ts` (`effectRunEdges`) when adding an allowlisted edge. Does not restore deleted identity Layers.

## Instructions

1. For Effect API syntax read [`node_modules/effect/AGENTS.md`](../../../node_modules/effect/AGENTS.md) completely, then search `node_modules/effect/src`. Then read the nearest package/app `AGENTS.md`.
2. Keep `DomainTag` / `ToolsTag` in `E` until a documented edge; do not `orDie` tagged domain failures mid-pipeline. Never throw in production: yield tagged errors. Defects stay defects.
3. `Effect.runPromise` / `runSync` / `appRuntime.runPromise` only on the `effectRunEdges` list in `oxlint.config.ts` (enforced by `watchdog/no-effect-run-outside-edge` in `pnpm check`; tests are skipped). A new production `run*` goes on that list and its reason in the nearest `AGENTS.md`. `tryPromise` / `try` need an inline `{ try, catch }` (`watchdog/effect-try-requires-catch`).
4. Cap `interpret` stays pure/sync (may throw); Cap `run` is `Effect` (`CapRun`); tests use `runCap` / `itRunsCollectCap`.
5. Provide `toolsHttpClientLayer` once at Cap `run` / job collect / vitest root, not per HTTP call. Vendor clients export `*Effect` only.
6. Worker and Job execution, cancel, boss roles: [references/jobs.md](references/jobs.md).
7. Browser UI never imports the `@watchdog/policy` barrel: use `@watchdog/policy/patch-needs-confidence`.
8. Tests: `@effect/vitest` `it.effect` for sleeping/Layer programs; domain suites bridge with `runDomain` only.

## Gotchas

- Error channels: `DomainTag` (core services → `runApp` / `runDomain` / job `catchCause`), `ToolsTag` (CapContext I/O, tools HTTP → Cap fail path / `mapToolsCatch`), `CustodyViolationError` (`@watchdog/policy` gates → Accept / apply-patch). API maps `DomainTag` via `toOrpcError` / `Match.tagsExhaustive`; prefer `runApp`.
- The promise bridge inside `transact` (`runPromiseExitWith`: caller services, abort signal) is intentional: do not "fix" it away. The export-coalesce write fiber is detached and provides its own `Db` / `BlobStore` (`ExportWriteServices`), never the scheduling caller's.
- Services (ADR-0002): `Db`, `Vault`, `BlobStore` and `JobQueue` are `Context.Service`s with Layers; `AppLive` composes the live ones for the API (producer queue role), `runDomain` provides `Db | Vault | BlobStore` per call (`JobQueue` stays out: pass `recordingJobQueue().layer` through `runDomainWith`), and the worker composes its own set with the worker queue role (`provideWorkerLayers`). Core takes the client from the service (`tryDbWith((exec) => repo.x(exec, …))`, R = `Db`) and never imports the global `db` or `S3Client` (lint-enforced). Tests override with `runDomainWith(Db.layer)` / `runAppWith(...)` and use `recordingBlobStore()`, `fakeVault()`, `makeJobQueueLayers(() => fakeDriver)`, `TestClock`; no module mocks. Time comes from Effect's `Clock` (`nowDateEffect`, no `new Date()` for now in core). A transaction handle stays an explicit `tx` parameter. Recipe: `packages/core/AGENTS.md`.
- Lifetimes: a fiber that outlives its caller must not reuse the caller's services. The detached export write provides its own `Db` / `BlobStore` (`ExportWriteServices`), so it survives a rolled-back `Db.layerOf(tx)` and a destroyed per-call `runDomain` client. Detached export write fibers are in neither `JobFibers` nor the queue (worker shutdown does not drain them; they die with the process, each with its own `Db` / S3 client), and `updateCaseEffect` / `claimCaseExportEffect` / `scheduleCaseExportEffect` carry no `BlobStore` in `R`: tests that trigger a name or slug change must provide `ExportWriteServices` (`isolatedExportWriteServices()`) or they hit the real pool and S3. A nested `transact` dies before opening a second transaction (`InsideTransaction`; a detached fiber resets it with `outsideTransaction`, an awaited child does not). The API's `appRuntime` is disposed on Vite SSR full reload (`makeAppRuntime`); production has no shutdown hook. The worker logs the shutdown signal from `WorkerShutdown` (`apps/worker/AGENTS.md`).
- Do not copy Effect-guide patterns that Watchdog rejects: Effect `Schema` as domain SoT (wire stays Zod in `@watchdog/schemas`), `@effect/sql` / Model.Class (Postgres is Drizzle), `HttpApi` servers (HTTP is oRPC), `@effect/ai*` (`@watchdog/ai` uses the Vercel AI SDK). Library examples are not license to add `run*` sites.
