# Jobs, oRPC, and process logging

**What this is:** Cap job enqueue path, oRPC/OpenAPI boundary, evlog process logging.  
**Not:** Cap authoring ([`caps-boundary.md`](caps-boundary.md)), package matrix ([`packages.md`](packages.md)). Canonical evlog rules also land in [`../contracts/evlog.md`](../contracts/evlog.md) (D3).

## Jobs path

Enqueue: `enqueueCapJobEffect` → pg-boss queue `watchdog.cap-jobs` → `apps/worker` runs Cap → Evidence + Proposal → Triage Accept/Reject (one TX). Collect lists jobs via `JobListRecord` (no `logs`); run detail loads full `JobRecord` via `getJobForCase`.

One boss per process: web/API via `enqueueCapJobEffect` / `ensureBossProducerEffect` (`supervise: false`); worker via `ensureBossWorkerEffect` (`supervise: true`): playbook chain reuses the live worker boss. Cap `timeoutMs` drives abort, per-job expire, graceful stop, and stale-Job reclaim (see package AGENTS Gotchas). Export shadow sync: worker listens for graph events → `scheduleCaseExportEffect` (coalesced in `@watchdog/core`).

**Effect runtime (jobs):** Worker boots `bootWorkerEffect` (`NodeRuntime.runMain`) with stream LISTEN + `cancelPollLoopEffect`. `JobFibers` (FiberMap + abort-reason map) is provided once; cancel sets `"timeout"|"cancel"` then interrupts the Job fiber — product SoT stays `jobs.status`; do not bridge pg-boss `job.signal`. Cap `run` is Effect (`HttpClient` via `toolsHttpClientLayer` at collect / `runCap`); stages keep tagged `E` until `run-job` `catchCause` (tagged failures only). Effect 4 sticky interrupt: persist fail via `onExitIf` + map `Fiber.await` in `executeJobOnMap`. API maps `DomainTag` via `runApp` → ORPCError. Deep Gotchas: [`packages/core/AGENTS.md`](../../../packages/core/AGENTS.md), [`apps/worker/AGENTS.md`](../../../apps/worker/AGENTS.md).

**Capability ids**: three segments `<category>.<salient_axis>.<method>` (ADR-045). File path mirrors the id under `packages/caps/src/`. Lexicon, method vocabulary, D1-D5 decisions, and ship gates: [`caps-lexicon.md`](caps-lexicon.md).

## oRPC

- Router: `packages/api` (`@watchdog/api`): Zod procedures; business logic in `@watchdog/core`; SQL in `@watchdog/db` `repos`.
- **Web UI:** in-process `createRouterClient` via ServerFns (`orpcForActor`). No browser HTTP oRPC / `/api/rpc` mount.
- **OpenAPI (agents/CLI):** `apps/web` `src/routes/api/v1.ts` + `v1.$.ts` → `OpenAPIHandler` prefix `/api/v1`.
  - Spec: `GET /api/v1/spec.json`
  - Scalar: `GET /api/v1/`
  - Security schemes: Bearer, **`apiKeyAuth` (`x-api-key`)**, session cookie: `@watchdog/client` / `wd` send `x-api-key`.
- Auth context: Better Auth session → `ApiActor`. Optional `ApiContext.log` from Start ALS (`peekRequestLogger`): present for HTTP handlers and ServerFn `orpcForActor` when middleware bound the logger.
- Web ServerFns: in-process `orpcForActor`: **preferred path for all domain writes/reads**. Browser HTTP oRPC client not used (OpenAPI via `@watchdog/client` for CLI/agents). Wide events for ServerFns come from `functionMiddleware` in `apps/web/src/start.ts` (not `withEvlog`); `orpcForActor` injects ALS `log` so procedure enrichment works on the UI path.
- **Case search:** `search.case` (`GET /cases/{caseId}/search`) → core `searchCase` → repo `ilike` helpers. Active Case nouns (entities / identifiers / evidence / tasks / jobs / pending proposals) plus Cases-by-name for switch. Web Mod+K palette calls it via `domains/search` ServerFn: not client-only `includes` filter.
- **Hard delete (entities / identifiers):** `entities.delete` (`DELETE /cases/{caseId}/entities/{entityId}`, `authed`) and `identifiers.delete` (`DELETE /cases/{caseId}/identifiers/{identifierId}`, `graphChildWrite` + `userOverride` for agents). Both call core delete effects → repo `DELETE` → `notifyEntityChangedEffect` (worker re-exports). Entity delete cascades graph children (identifiers, claims, events, edges, questions); evidence/tasks `entity_id` SET NULL. Web UI uses ServerFns; OpenAPI clients call the same routes after `pnpm generate:client`.
- Docs: [https://orpc.dev/llms.txt](https://orpc.dev/llms.txt).
- **External SDK:** `@watchdog/client`: `createWatchdogClient({ baseUrl, apiKey })` over OpenAPI (`/api/v1`). Contract JSON lives in `@watchdog/contract` and is regenerated with `pnpm generate:client` after API route changes. CLI uses this; agents/MCP should too. Do not hand-roll `/api/v1` JSON paths (binary **Case Export** zip/md are authenticated file routes outside `contract.json`: `wd export` uses raw `fetch` + `x-api-key`).

## Process logging (evlog)

- Package: [`@watchdog/log`](../../../packages/log/AGENTS.md): ALS (`peekRequestLogger` / `runWithRequestLogger`), `initWatchdogLogger`, `jobWideEventFields`. Pin exact `evlog`. Never depend from `cli` / `client` (stdout is the agent contract).
- **Sole HTTP emitter:** [`apps/web/src/start.ts`](../../../apps/web/src/start.ts) `requestMiddleware: [evlogRequestMiddleware, csrfMiddleware]` (logger outermost; `/api/**` include; exclude health, `spec.json`, Scalar). Do **not** wrap handlers with `withEvlog` (double-emit + private ALS). CSRF: `createCsrfMiddleware({ filter: serverFn })` (custom `start.ts` disables Start's auto-install). ServerFn paths skip the `/api/**` logger; CSRF 403s on `/_serverFn` still emit warn (`auth.reason: "csrf"`).
- **ServerFns:** same file `functionMiddleware: [evlogFunctionMiddleware, requireAuth]` (logger outermost; global auth: no per-fn opt-out). One wide event per ServerFn. `orpcForActor` injects ALS `log`. Expected `UnauthorizedError` → `level: "warn"` + `auth: { denied: true, reason: "no_session" }`; unexpected throws → `log.error(err)`.
- **Errors in fields:** use `log.error(err)` or `log.setLevel` + `{ name, message }`: never `log.set({ error: someError })` (`JSON.stringify(Error)` → `{}`).
- oRPC: `createApiContext` / `orpcForActor` pass `peekRequestLogger()`; `evlog()` on `os` sets `operation`; shared middleware lifts common ids from input. `ApiContext.log?` optional outside ALS.
- Identify once in `createApiContext` (`identifyUser` + API-key fields): one `getSession`; no dual `createAuthMiddleware` on those paths.
- Worker: `initWatchdogLogger` first in `main()`; Cap Job events from `executeJobOnMap` → `JobRunOutcome` via `jobWideEventFields` (`outcome` / `stopReason` / `abortReason` / `durationMs`). Cancel → `abort("cancel")`; Cap timeout → `abort("timeout")`. Handler failures: `log.error(err)`, not raw `Error` in `log.set`.
- Drains: `apps/web/.evlog/logs` and `apps/worker/.evlog/logs` (+ stdout): not `apps/.evlog`. Hash-chain `.audit/` / `evlog/ai` / Sentry deferred.
- **Custody split:** `Job.logs`, `graph_writes`, Triage Accept remain SoT. evlog = process observability, not Graph audit. Never **log** secrets, Evidence bodies, or Bearer / `x-api-key` plaintext. Breach Caps may still **store** recovered credential fields inside Evidence artifacts (see [`caps-lexicon.md`](caps-lexicon.md) **D5**); that material belongs in the case file, not in process logs.
