# Core package (`@watchdog/core`)

> Scope: `packages/core` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

Domain services for Case Graph, Jobs, evidence, Tasks (case work items — not Graph writes), export, and vault. Drizzle-free — talks to Postgres only via `@watchdog/db` repos.

## Commands

| Task              | Command                                  |
| ----------------- | ---------------------------------------- |
| Typecheck         | `pnpm --filter @watchdog/core typecheck` |
| Unit tests        | `pnpm test:unit`                         |
| Integration tests | `pnpm test:integration`                  |

## Boundaries

| Do | Don’t |
| --- | --- |
| Own transactions, SSE notify Effects, domain errors | Import Drizzle / write SQL in core |
| Caps via catalog + `interpret` → Proposal | Let Caps or Jobs write Graph directly |
| Enqueue only via `enqueueCapJobEffect` / boss helpers | Open ad-hoc pg-boss clients per call site |

## Gotchas

- Services call repos with `exec: DbExec` first; never open TX inside repos.
- Core tests must not import `drizzle-orm` (assert via repos / returned records).
- Job pipeline: `executeJobEffect` / `executeJobOnMap(jobId)` require `JobFibers` in `R`. `JobFibers` is a scoped `Context.Service` (`JobFibers.layer`) owning the FiberMap **and** abort-reason map; worker `runMain` provides it once. Cancel poll yields `JobFibers` and `yield*` `fibers.abort` which sets `"timeout"|"cancel"` then `Fiber.interrupt`. Cap `ctx.signal` is the fiber `Effect.abortSignal` (one timeout sleeper in `runReadyJobEffect`). Collect splits reclaim / cache-hit / `cap.run` constructors. Stages keep `DomainTag` / `ToolsTag` in `E`. Effect 4 sticky interrupt: `catchCause` does **not** turn interrupt into Success — persist fail via `onExitIf` (interrupt-only) and map `Fiber.await` interrupt Exit in `executeJobOnMap` (clear abort reason there). Public `executeJobEffect` stays `E = never`. After collect, land-evidence / interpret / suppress / propose / finish / cache / playbook success-fail tails are Effect stages (`interpretError` stays data). Cap stages live under `jobs/stages/`. Cap `timeoutMs` drives expire / graceful stop / stale reclaim. `collectEffect` yields `cap.run(ctx)` (no `runCap`).
- **Playbooks:** `advancePlaybookRunEffect` in `jobs/stages/chain.ts` is the only chain (success, failure, stale fail, stuck reclaim). Keeps `DomainTag` in `E`; tests bridge with `runDomain`. FiberMap-owned enqueue tails may `orDie` (`enqueueCapJobEffect` inside `enqueueReleasedEffect`). Do not restore `releasePlaybookDependents` / `abandonPlaybookOnFailure`. `runPlaybook` inserts the run + step-0 `queued` Job; `enqueueStepJobs` lazy-creates later steps (`playbookFanIndex`). Historical `blocked` rows may flip to `queued` in the same TX — do not pre-insert the rest of the recipe. `handoff` is computed in `interpret.ts` (including cache hits) and persisted on the success write in `finish.ts`. Advance defects/errors on the success path are logged via `Effect.catchCause`; `reconcileStuckPlaybookRunsEffect` re-advances `running` runs whose member Jobs are all terminal.
- Stale reclaim: `reconcileStaleJobsEffect` / `reconcileStuckPlaybookRunsEffect` keep `DomainTag` in `E` and run at worker boot inside `startWorkerResourcesEffect` (worker edge `catchCause` + log). Cancel poll uses `findCancelledJobIdsEffect`.
- **Tasks** (`src/tasks/`): case-scoped CRUD + `reorderTasks` (`position` within a status column; board order is not `createdAt`-only) + `notifyTaskChangedEffect` after commit; not a Graph write / patch path. Effect exports: `createTaskEffect` / `updateTaskEffect` / `deleteTaskEffect` / `listTasksForCaseEffect` / `getTaskInCaseEffect` / `reorderTasksEffect`.
- `applyPatch` dispatches to `graph/patch/apply-*-op.ts` per resource; shared helpers in `graph/patch/apply-patch-helpers.ts`.
- **Layout:** `graph/` holds per-resource graph-node services; `graph/patch/` is the patch apply pipeline; `cases/` and `proposals/` mirror other layers (Case CRUD, Inbox accept/reject). Worker code imports `@watchdog/core/worker` instead of the full barrel.
- Edge updates: `edge-update.ts` — `validateEdgeUpdate` / `buildEdgePatch` / `applyValidatedEdgeUpdate` (used from `edges.ts`).
- Identifier Accept: `apply-identifier-op.ts` uses `validateIdentifierWrite` (value + handle→platform; same as Dossier `createIdentifier` / `updateIdentifier`). Type-only updates re-validate under the new type.
- Inbox list annotates `identifierCollisions` via `loadIdentifierCollisionsEffect` + `identifiersRepo.listForCase` (index by type+value). Warn, don’t block Accept. Invalid Identifier values block Accept (schemas `listInvalidIdentifierOps` preflight + core TX).
- Entity create: `seedDefaultQuestions` / `seedDefaultQuestionsEffect` in `questions.ts` (`Partial<Record<EntityKind, …>>` — person seeds today). Do not inline kind `if`s in `createEntity`.
- Agent ingress: propose by default; `graph write` + `userOverride` → Graph @ `unverified` + `graph_writes` audit. `parseAgentPatchEffect` is the shape gate (no `runSync`).
- **Errors:** Case CRUD, Tasks, Entities, Claims, Identifiers, Edges, Events, Questions, Evidence, Proposals, Jobs, Search, and Activity are Effect programs (`*Effect`). Tests bridge with `runDomain` (no production Promise service edges). CapContext vault/blob methods are Effects (`ToolsTag`). Graph patch apply is `applyPatchEffect`. Vault slots are Effect-first (`getCredentialEffect` / `putCredentialEffect` / …). Service TX bodies use `transact` (yield tagged errors). Infra Layer in use: `JobFibers` (worker). Vault/blob/Postgres/JobQueue/repo identity Layers were removed — call `tryDb` / module Effects directly.
- Vault slots: `listCredentialSlots` / `putCredentialSlot` (Settings + `/credentials` API); never return plaintext.
- **Inbox Accept/Reject is one TX** — attestation + patch + status (and reject fingerprints) in a single `transact`; `proposalsRepo.lockInCase` (`SELECT … FOR UPDATE`) then re-check `status = 'pending'` before apply/accept.
- **Org-scoped case children** — API/actor Effects take `organizationId` and gate with `assertCaseInOrgEffect` (missing / foreign-org Case → `not_found`). Worker/export paths that already trust a Case id from a Job or child row use `assertCaseExistsUncheckedEffect` / `casesRepo.getByIdUnchecked` — do not widen that to HTTP handlers.
- **TX asserts use `tx`** — pass `tx` into `assertEntityInCase` / `assertEvidenceInCase` / `assertCaseInOrgEffect` (or unchecked inside a trusted TX); never assert on the global pool while writing on `tx`.
- Collect scratch FS maps to `ScratchIOError` (then stage handling); export writers map domain failures to `ExportIOError` then `logSwallowed` — keep `DomainTag` on render/reconcile/playbook-advance edges for `runApp` / `runDomain`.
- Dossier create+link / replace Evidence: one `transact`; helpers in `evidence-links.ts`.
- Jobs list: `listJobsForCase` → `JobListRecord` (input + artifact output; no `logs`). Detail via `getJobForCase`.
- One boss per process: web/API `ensureBossProducerEffect` / `enqueueCapJobEffect` (`supervise: false`); worker `ensureBossWorkerEffect` (`supervise: true`); playbook chain reuses the live worker boss — never a second pool from Vite. Enqueue and start map pg-boss failures to `InvalidError` (including a second role in the same process).
- Dual SoT cancel: product `jobs.status` is authoritative; worker `cancelPollLoopEffect` (`Schedule.spaced("2 seconds")`, first tick immediate) + `JobFibers.abort` interrupts the Job fiber (`FiberMap`). Do not bridge pg-boss `job.signal`. `"timeout"` vs `"cancel"` is stored before interrupt (`fibers.setReason` / `fibers.abort`), not recovered from `Cause`.
- Export sync: `scheduleCaseExportEffect` coalesces via `SynchronizedRef` (dirty set + in-flight fiber). Calling it marks dirty synchronously (`runSync` claim) so fire-and-forget `void Effect.runPromise(...)` still coalesces. The loop rechecks dirty before dropping the fiber so a concurrent mark is not dropped. `renderEntityMarkdownEffect` / `renderCaseExportEffect` keep `DomainTag` in `E` (API `runApp`); writers `writeCaseExportEffect` / `writeEntityExportEffect` map that to `ExportIOError` then `logSwallowed`. Case delete/rename uses `removeCaseExportDirEffect` / `renameCaseExportDirEffect`. Do not start parallel case writes from the worker. Case name rename regenerates slug (`slugForCaseName`); conflict if taken; best-effort rename then `scheduleCaseExportEffect`. Empty slugify → `invalid`.
- Process logs: `@watchdog/log` (`logSwallowed` / `logProcess` — `logSwallowed` uses `log.error`); `executeJobEffect` / `executeJobOnMap` return `JobRunOutcome` (`outcome` / `stopReason` / `abortReason`). evlog ≠ `Job.logs` / `graph_writes` custody. Job stages carry `Effect.withSpan` (`cap.execute`, `cap.preflight`, `cap.collect`, `cap.interpret`, `cap.finish`). Worker `runMain` runs jobs with `executeJobOnMap(jobId)` under scoped `JobFibers`. Export LISTEN is db `listenForEventsStream` (`Stream.runForEach`); web SSE stays on callback `listenForEvents`. After-commit SSE fan-out is `notifyEntityChangedEffect` / `notifyTaskChangedEffect` / `notifyJobUpdateEffect` / `notifyProposalCreatedEffect` (`notifyEvent` + ignore + `forkDetach`). Domain TX uses `transact` (one nested `runPromise` for Drizzle).
- **Activity** (`src/activity/`): org-scoped recent activity merge (`listRecentActivity`) for Dashboard Activity — read-only; no notify / live channel.
- **Case search** (`src/search/`): `searchCase` — Active Case `ilike` across entities / identifiers / evidence / tasks / jobs / pending proposals, plus Cases-by-name for switch. Repos own the SQL (`containsPattern`); core does not concatenate `%` wildcards.

## See also / External References

| Need | File |
| --- | --- |
| Repo contract | [`packages/db/AGENTS.md`](../db/AGENTS.md) |
| Cap authoring | [`packages/caps/AGENTS.md`](../caps/AGENTS.md) |
| Patch custody | [`packages/policy/AGENTS.md`](../policy/AGENTS.md) |
| Process logging | [`packages/log/AGENTS.md`](../log/AGENTS.md) |
| Platform architecture | [`docs/reference/platform/README.md`](../../docs/reference/platform/README.md) |
