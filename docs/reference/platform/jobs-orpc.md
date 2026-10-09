# Jobs, oRPC, and process logging wiring

**What this is:** Cap job enqueue path, oRPC/OpenAPI boundary, where evlog is installed.  
**What this is not:** Cap authoring ([`caps-boundary.md`](caps-boundary.md)), package matrix ([`packages.md`](packages.md)), logging rules ([`../contracts/evlog.md`](../contracts/evlog.md)). Procedure lists are generated: `GET /api/v1/spec.json` and `packages/api`.

## Jobs path

Enqueue: `enqueueCapJobEffect` → pg-boss queue `watchdog.cap-jobs` → `apps/worker` runs the Cap → Evidence + Proposal → Triage Accept/Reject (one TX). Collect lists jobs via `JobListRecord` (no `logs`); run detail loads the full `JobRecord` via `getJobForCase`.

- **One pg-boss per process, as a scoped service.** Enqueue is `enqueueCapJobEffect` with `R = JobQueue`. Web/API compose `jobQueueProducerLayer` (`supervise: false`, starts lazily on the first send); the worker composes `jobQueueWorkerLayer` (`supervise: true`) and the playbook chain reuses that queue. Each Layer releases pg-boss when its scope closes; the worker release is a graceful `boss.stop` bounded by `gracefulStopTimeoutMs()`.
- **Timing derives from Cap `timeoutMs`:** abort, per-job expire, graceful stop, stale-Job reclaim (see [`caps-boundary.md`](caps-boundary.md)).
- **Orphan reconcile.** Worker boot re-enqueues `queued` Jobs left without a pg-boss delivery (`reconcileOrphanedQueuedJobsEffect`, 2-minute `updatedAt` grace; `singletonKey` on send makes repeat enqueue safe).
- **Export shadow sync:** the worker listens for graph events and calls `scheduleCaseExportEffect` (coalesced in `@watchdog/core`).

**Effect runtime (jobs).** The worker boots `bootWorkerEffect` (`NodeRuntime.runMain`) with stream LISTEN + `cancelPollLoopEffect`. `JobFibers` (FiberMap + abort-reason map) is provided once. Cancel sets `"timeout"|"cancel"` then interrupts the Job fiber; `jobs.status` stays the product SoT, so do not bridge pg-boss `job.signal`. Cap `run` is Effect (`HttpClient` via `toolsHttpClientLayer`); stages keep tagged `E` until `run-job` `catchCause`. Effect 4 sticky interrupt: persist failure via `onExitIf` + map `Fiber.await` in `executeJobOnMap`. The API maps `DomainTag` through `runApp` to `ORPCError`. Deep gotchas: [`packages/core/AGENTS.md`](../../../packages/core/AGENTS.md), [`apps/worker/AGENTS.md`](../../../apps/worker/AGENTS.md). The allowlist for `run*` edges is the `effectRunEdges` list in `oxlint.config.ts`, enforced by `watchdog/no-effect-run-outside-edge`.

**Capability ids** are `<category>.<salient_axis>.<method>`, file path mirroring the id under `packages/caps/src/`. Lexicon and what is enforced: [`caps-lexicon.md`](caps-lexicon.md).

## oRPC

- Router: `packages/api` (`@watchdog/api`): Zod procedures; business logic in `@watchdog/core`; SQL in `@watchdog/db` `repos`.
- **Web UI:** in-process `createRouterClient` through ServerFns (`orpcFromContext`). There is no browser HTTP oRPC and no `/api/rpc` mount. ServerFns are the path for all web reads and writes.
- **OpenAPI (agents/CLI):** `apps/web/src/routes/api/v1.ts` + `v1.$.ts` → `OpenAPIHandler` at `/api/v1`. Spec `GET /api/v1/spec.json`, Scalar `GET /api/v1/`. Security schemes: Bearer, `apiKeyAuth` (`x-api-key`, what `@watchdog/client` and `wd` send), session cookie.
- **Auth context:** `createApiContext` (`@watchdog/auth`) resolves the session cookie or API key into an `ApiActor` with `organizationId` (session `activeOrganizationId`, or the key's `metadata.organizationId`, membership re-checked). `authed` rejects an actor with no organization (403); case-scoped Effects gate on `assertCaseInOrgEffect` ([`../contracts/README.md`](../contracts/README.md#org-isolation)). `ApiContext.log?` is the Start ALS logger when middleware bound one.
- **External SDK:** `createWatchdogClient({ baseUrl, apiKey })` over `/api/v1`; a blank `apiKey` throws at construction. The contract JSON in `packages/client/src/generated/` is regenerated with `pnpm generate:client`; CI fails on drift. Do not hand-roll `/api/v1` paths. Case Export zip/md are authenticated file routes outside `contract.json` (`wd export` uses raw `fetch` + `x-api-key`).
- oRPC docs: [https://orpc.dev/llms.txt](https://orpc.dev/llms.txt).

## Process logging (evlog)

Rules live in [`../contracts/evlog.md`](../contracts/evlog.md). Wiring:

- **Sole HTTP emitter:** `apps/web/src/start.ts`, `requestMiddleware: [evlogRequestMiddleware, csrfMiddleware]` (logger outermost; `/api/**` included; health, `spec.json` and Scalar excluded). Do not wrap handlers with `withEvlog` (double emit + private ALS). CSRF is `createCsrfMiddleware({ filter: serverFn })` because the custom `start.ts` disables Start's auto-install; CSRF 403s on `/_serverFn` still emit a warn (`auth.reason: "csrf"`). Keep CSRF after evlog.
- **ServerFns:** `functionMiddleware: [evlogFunctionMiddleware, requireAuth]` in the same file. One wide event per ServerFn; `requireAuth` is global, with no per-function opt-out.
- **oRPC:** `createApiContext` and `orpcFromContext` pass `peekRequestLogger()`; identity is attached once in `createApiContext`.
- **Worker:** `initWatchdogLogger` first in `main()`; Cap Job events come from `executeJobOnMap` as `JobRunOutcome` via `jobWideEventFields` (`outcome` / `stopReason` / `abortReason` / `durationMs`).
- **Drains:** `apps/web/.evlog/logs` and `apps/worker/.evlog/logs` (+ stdout). Hash-chain `.audit/`, `evlog/ai` and Sentry are not built.
