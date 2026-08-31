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
| Own transactions, `notifyEvent`, domain errors | Import Drizzle / write SQL in core |
| Caps via catalog + `interpret` → Proposal | Let Caps or Jobs write Graph directly |
| Enqueue only via `enqueueCapJob` / boss helpers | Open ad-hoc pg-boss clients per call site |

## Gotchas

- Services call repos with `exec: DbExec` first; never open TX inside repos.
- Core tests must not import `drizzle-orm` (assert via repos / returned records).
- Job pipeline: `run-job.ts` delegates success/failure tails to `runSucceededPath` / `runFailedPath` in `jobs/run-paths.ts`; Cap stages live under `jobs/stages/`. Cap `timeoutMs` drives expire / graceful stop / stale reclaim.
- **Playbooks:** `advancePlaybookRun` in `jobs/stages/chain.ts` is the only chain (success, failure, stale fail, stuck reclaim). Do not restore `releasePlaybookDependents` / `abandonPlaybookOnFailure`. `runPlaybook` inserts the run + step-0 `queued` Job; `enqueueStepJobs` lazy-creates later steps (`playbookFanIndex`). Historical `blocked` rows may flip to `queued` in the same TX — do not pre-insert the rest of the recipe. `handoff` is computed in `interpret.ts` (including cache hits) and persisted on the success write in `finish.ts`. Advance errors on the success path are logged; `reconcileStuckPlaybookRuns` re-advances `running` runs whose member Jobs are all terminal.
- Stale reclaim: `reconcileStaleJobs` (per-Cap expire on stuck `running` Jobs) + `reconcileStuckPlaybookRuns`. Worker runs both at boot.
- **Tasks** (`src/tasks/`): case-scoped CRUD + `reorderTasks` (`position` within a status column; board order is not `createdAt`-only) + `notifyTaskChanged` after commit; not a Graph write / patch path.
- `applyPatch` dispatches to `graph/patch/apply-*-op.ts` per resource; shared helpers in `graph/patch/apply-patch-helpers.ts`.
- **Layout:** `graph/` holds per-resource graph-node services; `graph/patch/` is the patch apply pipeline; `cases/` and `proposals/` mirror other layers (Case CRUD, Inbox accept/reject). Worker code imports `@watchdog/core/worker` instead of the full barrel.
- Edge updates: `edge-update.ts` — `validateEdgeUpdate` / `buildEdgePatch` / `applyValidatedEdgeUpdate` (used from `edges.ts`).
- Identifier Accept: `apply-identifier-op.ts` uses `validateIdentifierWrite` (value + handle→platform; same as Dossier `createIdentifier` / `updateIdentifier`). Type-only updates re-validate under the new type.
- Inbox list annotates `identifierCollisions` via `identifier-collisions.ts` + `identifiersRepo.listForCase` (index by type+value). Warn, don’t block Accept. Invalid Identifier values block Accept (schemas `listInvalidIdentifierOps` preflight + core TX).
- Entity create: `seedDefaultQuestions` in `questions.ts` (`Partial<Record<EntityKind, …>>` — person seeds today). Do not inline kind `if`s in `createEntity`.
- Agent ingress: propose by default; `graph write` + `userOverride` → Graph @ `unverified` + `graph_writes` audit.
- Vault slots: `listCredentialSlots` / `putCredentialSlot` (Settings + `/credentials` API); never return plaintext.
- **Inbox Accept/Reject is one TX** — attestation + patch + status (and reject fingerprints) in a single `db.transaction`; `proposalsRepo.lockInCase` (`SELECT … FOR UPDATE`) then re-check `status = 'pending'` before apply/accept.
- **TX asserts use `tx`** — pass `tx` into `assertEntityInCase` / `assertEvidenceInCase` / `assertCaseExists`; never assert on the global pool while writing on `tx`.
- Dossier create+link / replace Evidence: one `db.transaction`; helpers in `evidence-links.ts`.
- Jobs list: `listJobsForCase` → `JobListRecord` (input + artifact output; no `logs`). Detail via `getJobForCase`.
- One boss per process: web/API `ensureBossProducer()` / `enqueueCapJob` (`supervise: false`); worker `ensureBossWorker()` (`supervise: true`); playbook chain reuses the live worker boss — never a second pool from Vite.
- Dual SoT cancel: product `jobs.status` is authoritative; worker polls ~2s and aborts Cap `AbortController`; do not bridge pg-boss `job.signal`.
- Export sync: `scheduleCaseExport(caseId)` coalesces (returns a Promise; callers fire-and-forget with `void`). Do not start parallel `writeCaseExport` from the worker. Case name rename regenerates slug (`slugForCaseName`); conflict if taken; best-effort `renameCaseExportDir` then `scheduleCaseExport`. Empty slugify → `invalid`.
- Process logs: `@watchdog/log` (`logSwallowed` / `logProcess` — `logSwallowed` uses `log.error`); `executeJob` returns `JobRunOutcome` (`outcome` / `stopReason` / `abortReason`). evlog ≠ `Job.logs` / `graph_writes` custody.
- **Activity** (`src/activity/`): cross-case recent activity merge (`listRecentActivity`) for Dashboard Activity — read-only; no notify / live channel.
- **Case search** (`src/search/`): `searchCase` — Active Case `ilike` across entities / identifiers / evidence / tasks / jobs / pending proposals, plus Cases-by-name for switch. Repos own the SQL (`containsPattern`); core does not concatenate `%` wildcards.

## See also / External References

| Need | File |
| --- | --- |
| Repo contract | [`packages/db/AGENTS.md`](../db/AGENTS.md) |
| Cap authoring | [`packages/caps/AGENTS.md`](../caps/AGENTS.md) |
| Patch custody | [`packages/policy/AGENTS.md`](../policy/AGENTS.md) |
| Process logging | [`packages/log/AGENTS.md`](../log/AGENTS.md) |
| Platform architecture | [`docs/reference/platform/README.md`](../../docs/reference/platform/README.md) |
