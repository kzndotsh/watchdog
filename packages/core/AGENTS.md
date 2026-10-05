# Core package (`@watchdog/core`)

> Scope: `packages/core` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

Domain services for Case Graph, Jobs, Evidence, Tasks (case work items, not Graph writes), export, and vault. Talks to Postgres only through `@watchdog/db` repos; it has no `drizzle-orm` dependency, so SQL does not belong here.

## Commands

| Task              | Command                                  |
| ----------------- | ---------------------------------------- |
| Typecheck         | `pnpm --filter @watchdog/core typecheck` |
| Unit tests        | `pnpm test:unit`                         |
| Integration tests | `pnpm test:integration`                  |

## Import paths

Import from a per-domain subpath, never the root: `@watchdog/core/<domain>` where `<domain>` is `activity`, `actors`, `caps`, `cases`, `errors` (tagged errors), `events` (notify + SSE listen), `evidence`, `export`, `graph` (entities, claims, edges, identifiers, questions, timeline, patch, guards), `infra` (`Db`, `tryDb`, `tryDbWith`, `transact`, `runDomain`, `runDomainWith`), `jobs`, `proposals`, `search`, `tasks`, `vault`. Also `blob` (blob functions and the `BlobStore` service), `job-display`, `proposal-display` and `worker`. Each domain is `src/<domain>/index.ts`; there is no root import or `src/index.ts`. New domain: add the folder index and the `exports` entry in one change. `pnpm check:boundaries` fails an import path missing from `exports`.

## Rules

| Rule | Enforced by |
| --- | --- |
| Services call repos with `exec: DbExec` first and own transactions (`transact`); repos never open one | `pnpm --filter @watchdog/db check:repos` (repo side) |
| Normalize display fields (trim, slugify, `InvalidError`) before repo writes; repos do not reject blank name/text. Trim `actorLabel` with `actorLabelForPersist` | guidance |
| Caps via catalog + `interpret` → Proposal; Caps and Jobs never write Graph directly | guidance (root Boundaries) |
| Enqueue only through `enqueueCapJobEffect` (`R = JobQueue`); never construct a `PgBoss` outside `jobs/job-queue.ts`. A process composes exactly one role Layer (`jobQueueProducerLayer` or `jobQueueWorkerLayer`) | guidance (a second `PgBoss` is not blocked by lint; `job-queue.test.ts` covers the Layers) |
| Service programs are `*Effect` and keep `DomainTag` in `E`; tests bridge with `runDomain` | `pnpm check:effect-edges:strict` for `run*` sites; the rest is guidance |
| `transact` body runs with the caller's services; interrupting the caller aborts it and rolls back; tagged errors and defects pass through unchanged; the only `run*` edge is its `runPromiseExitWith` bridge | `postgres-tx.int.test.ts`; `check:effect-edges:strict` |
| A `transact` inside another `transact`'s body opens a second connection and transaction: it does not reuse the outer one, commits independently, and can deadlock a small pool. Pass `tx` down instead of nesting | guidance |
| Inbox Accept/Reject is one `transact`: attestation + patch + status, with `proposalsRepo.lockInCase` (`FOR UPDATE`) then a re-check of `status = 'pending'` | integration tests |
| `InvalidError` is caller-fixable input (400). A write that returns no row is `InternalError`; an update/delete of a caller-supplied id matching nothing is `NotFoundError({ entity, id })`; its message is derived from `entity` in the class, never hand-written | `map-domain-error.test.ts`; no lint |
| Case children are org-scoped: API/actor Effects take `organizationId` and gate with `assertCaseInOrgEffect` (foreign or missing Case is `not_found`). Worker/export paths that already trust a Case id use `assertCaseExistsUncheckedEffect` / `casesRepo.getByIdUnchecked`: never widen that to HTTP handlers | `org-isolation.int.test.ts` (hand-enumerated) |
| Inside a TX, pass `tx` into the `assert*InCase` helpers; never assert on the global pool while writing on `tx` | guidance |

## `Db` service pattern (ADR-0002 phase 2)

`Db` (`infra/db-service.ts`) is a `Context.Service` whose value is a `DbExec`; `Db.layer` is the live Layer over `@watchdog/db`'s `db`. All core code reads the client from it: importing `db` from `@watchdog/db` in core source fails lint (`no-restricted-imports`, plus `watchdog/no-core-db-dynamic-import` for `import()`; exempt: `infra/db-service.ts` and tests). Reference: `listCasesEffect` (`cases/cases.ts`, test `cases-db-layer.int.test.ts`).

```ts
// before: R = never, module-global db
tryDb(() => casesRepo.list(db, organizationId));
// after: R = Db; same error mapping (unique violations, tagged passthrough)
tryDbWith((exec) => casesRepo.list(exec, organizationId));
```

- Add `Db` to the function's declared return type (`Effect.Effect<A, DomainTag, Db>`, `import type { Db } from "../infra/db-service"`) and drop the `db` import once no site uses it. Callers that are themselves migrated propagate `Db`; `runDomain` / `runApp` accept `R = Db` and provide `Db.layer`.
- Inside `transact((tx) => ...)` keep the explicit handle: `tryDb(() => repo.x(tx, ...))`. `transact` opens its transaction on the `Db` service's client (R gains `Db`; if the service value is itself a `tx`, drizzle opens a savepoint). Helpers that accept an optional `exec` (`assert*InCase`, `suppressKnownFindingsEffect`) use `tryDbOn(exec, ...)`: a caller's `tx` wins, otherwise the service supplies the client.
- Tests: `runDomainWith(Db.layer)(effect)` (the pool, same as `testDb`; `Db.layerOf(exec)` for a `tx` or a spying `Proxy`), or `runDomainWith(Layer.succeed(Db, stub))`. Unit tests may still `vi.mock("@watchdog/db")` (the live Layer wraps the mocked `db`); prefer the Layer. `runDomain(effect)` works for integration tests.
- Worker: `main.ts` provides `Db.layer`, `blobStoreLayer`, `JobFibers.layer` and the worker queue Layer (`Db`, `BlobStore`, `JobQueue` and `jobQueueWorkerLayer` are exported from `@watchdog/core/worker`).

## `JobQueue` service pattern (ADR-0002 phase 3)

`JobQueue` (`jobs/job-queue.ts`) is the Cap Job queue as a `Context.Service`; there is no module-level boss. `enqueueCapJobEffect`, `startJobEffect`, `reconcileOrphanedQueuedJobsEffect`, `advancePlaybookRunEffect`, `executeJobOnMap` and the evidence verbs that enqueue carry `JobQueue` in `R`.

- Two role Layers, each acquiring pg-boss in the Layer scope and releasing it when the scope closes. `jobQueueProducerLayer` (web/API): `supervise: false`, starts pg-boss lazily on the first send (the start runs uninterruptibly behind one gate shared with release; a failed start or ensure retries only the failed step on the next send), so building it never touches the database; release waits for an in-flight start, then stops any started boss. `jobQueueWorkerLayer` (worker): `supervise: true`, starts and ensures the queue at build (failure fails the boot), also provides `JobQueueWorker` (`work`), and releases with `boss.stop({ graceful: true, timeout: gracefulStopTimeoutMs() })`. Sends stay open during that drain (an in-flight Job may enqueue its playbook successor); after release a send fails with `InternalError`.
- A process is one role: the producer Layer does not provide `JobQueueWorker`, so worker-only code (`work`) fails to type-check against it. Composing both Layers in one process is not blocked by types (guidance).
- `runApp` / `AppLive` include the producer Layer. `runDomain` stays `Db`-only: a caller whose Effect enqueues passes a queue Layer, `runDomainWith(Layer.mergeAll(Db.layer, queue.layer))(effect)`. Tests use `recordingJobQueue()` (records sends instead of reaching pg-boss) or `makeJobQueueLayers(() => fakeDriver)` for scope-release tests; `BossDriver` is the slice of pg-boss the service uses.
- Worker: `main.ts` provides the worker queue Layer innermost so it releases (drains) before `JobFibers` closes ([`apps/worker/AGENTS.md`](../../apps/worker/AGENTS.md)).

## `BlobStore` service pattern (ADR-0002 phase 3)

`BlobStore` (`infra/blob-store.ts`) is the object store as a `Context.Service` whose value is `{ client: S3Client, bucket }`; there is no module-level client. Every function in `infra/blob.ts` (`uploadArtifactEffect`, `createPresignedPutEffect`, `assertUploadedObjectEffect`, `readArtifactBytesEffect`, `createPresignedGetEffect`, `deleteCaseArtifactsEffect`) carries `BlobStore` in `R`, with the same signatures and `InvalidError` mapping as before. `R` propagates to Case delete, Evidence upload/presign/download, the Evidence snapshot pack, Case export (`scheduleCaseExportEffect`, whose write fiber captures `Db | BlobStore` from the scheduling caller), the Cap `uploadArtifact` / `readArtifact` helpers (collect captures the service and provides it to the Cap context, whose R stays `never`) and `executeJobOnMap`.

- `blobStoreLayer` builds the `S3Client` from `S3_*` env when the Layer is built (no connection) and `client.destroy()`s it when the Scope closes (`Effect.acquireRelease` inside `Layer.effect`). `new S3Client` outside `infra/blob-store.ts` fails lint (`no-restricted-imports`, gate test `oxlint-core-s3-ban.gate.test.ts`); read the client with `yield* BlobStore`.
- Compose it once per process: `AppLive` (API and the web server routes that use `runApp`) and the worker's `provideWorkerLayers` (outside the queue Layer, so in-flight Jobs can still read blobs while the queue drains). `runDomain` provides `Db | BlobStore` (the blob Layer is cheap per call: it only builds a client); a caller that needs a different store passes `runDomainWith(Layer.mergeAll(Db.layer, store.layer))`.
- Tests: `recordingBlobStore({ objects?, respond? })` is a real `S3Client` aimed at a dummy endpoint whose requests never leave the process: a middleware records each command (`calls`), serves `GetObject` / `PutObject` from an in-memory map and answers other commands through `respond`; presigning signs normally with no network, and `destroyed()` reports the scope release. `makeBlobStoreLayer(() => ({ client, bucket }))` is the factory for any other fake; `blobStoreLayer` over the local S3 container is exercised by `infra/__tests__/blob.int.test.ts`. Do not `vi.mock` the blob module.

## Gotchas

- Job pipeline, `JobFibers`, cancel/abort, Effect 4 sticky interrupt, boss roles, `blocked` leftovers: [`effect/references/jobs.md`](../../.agents/skills/effect/references/jobs.md) is the single home.
- Playbooks: `advancePlaybookRunEffect` in `jobs/stages/chain.ts` is the only chain (success, failure, stale fail, stuck reclaim). `runPlaybookEffect` inserts the run and the step-0 `queued` Job; later steps are created lazily after the previous Job succeeds (`playbookFanIndex`). Do not pre-insert the rest of the recipe.
- Agent ingress: propose by default; `graph write` + `userOverride` writes Graph at `unverified` plus a `graph_writes` audit row. `parseAgentPatchEffect` is the shape gate.
- Identifier Accept validates with `validateIdentifierWrite` (same as Dossier create/update). Invalid Identifier values block Accept; `identifierCollisions` on the Inbox list only warn.
- Entity create seeds default Questions through `seedDefaultQuestionsEffect` (`graph/questions.ts`, keyed by entity kind): do not inline kind `if`s in `createEntity`.
- Vault slots are listed/written through the `*Effect` credential helpers and never return plaintext.
- Organization delete: `deleteOrganizationCasesEffect(organizationId, { actorId })` removes every Case (artifacts and export dir included) before the org row goes, because `cases.organization_id` is a soft ref and nothing cascades. The app wires it through `createAuth({ beforeDeleteOrganization })`.
- Export: `scheduleCaseExportEffect` coalesces through a `SynchronizedRef`: it marks dirty and starts-or-joins the write fiber when the returned Effect is interpreted, and the write fiber keeps the `Db` of the interpreting caller. `claimCaseExportEffect` is its first stage (mark + start, returns the wait): a caller that forks the wait runs the claim first so an interrupt cannot lose the mark. The export dir is `<export>/<organization-id>/<case-slug>/`; case rename regenerates the slug (unique within the organization), then reschedules export.
- After-commit SSE notifies (`notify*Effect`) fire only when not inside a parent `transact`; accept/reject notify after their own commit.
- Client-safe label helpers live in `@watchdog/core/job-display`; worker code imports `@watchdog/core/worker`, not a domain subpath.
- Logging: `@watchdog/log` (`logSwallowed`, `logProcess`). evlog is not `Job.logs` / `graph_writes` custody.
- Tests: generic padded-UUID trim belongs in unit owners (`graph/patch/__tests__/guards.test.ts`, `@watchdog/schemas` `primitives-trim.test.ts`, db `scoped-ids.test.ts`); core `*.int.test.ts` assert domain contracts only. Core tests must not import `drizzle-orm`.

See also: [`packages/db/AGENTS.md`](../db/AGENTS.md) · [`packages/caps/AGENTS.md`](../caps/AGENTS.md) · [`packages/policy/AGENTS.md`](../policy/AGENTS.md) · [`docs/reference/platform/README.md`](../../docs/reference/platform/README.md).
