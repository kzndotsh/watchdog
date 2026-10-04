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

Import from a per-domain subpath, never the root: `@watchdog/core/<domain>` where `<domain>` is `activity`, `actors`, `caps`, `cases`, `errors` (tagged errors), `events` (notify + SSE listen), `evidence`, `export`, `graph` (entities, claims, edges, identifiers, questions, timeline, patch, guards), `infra` (`tryDb`, `transact`, `runDomain`), `jobs`, `proposals`, `search`, `tasks`, `vault`. Also `blob`, `job-display`, `proposal-display` and `worker`. Each domain is `src/<domain>/index.ts`; there is no root import or `src/index.ts`. New domain: add the folder index and the `exports` entry in one change. `pnpm check:boundaries` fails an import path missing from `exports`.

## Rules

| Rule | Enforced by |
| --- | --- |
| Services call repos with `exec: DbExec` first and own transactions (`transact`); repos never open one | `pnpm --filter @watchdog/db check:repos` (repo side) |
| Normalize display fields (trim, slugify, `InvalidError`) before repo writes; repos do not reject blank name/text. Trim `actorLabel` with `actorLabelForPersist` | guidance |
| Caps via catalog + `interpret` → Proposal; Caps and Jobs never write Graph directly | guidance (root Boundaries) |
| Enqueue only through `enqueueCapJobEffect` / the boss helpers; one pg-boss boss per process | guidance (a second boss role in one process fails at runtime with `InternalError`; nothing blocks a direct `boss.send`) |
| Service programs are `*Effect` and keep `DomainTag` in `E`; tests bridge with `runDomain` | `pnpm check:effect-edges:strict` for `run*` sites; the rest is guidance |
| `transact` body runs with the caller's services; interrupting the caller aborts it and rolls back; tagged errors and defects pass through unchanged; the only `run*` edge is its `runPromiseExitWith` bridge | `postgres-tx.int.test.ts`; `check:effect-edges:strict` |
| Inbox Accept/Reject is one `transact`: attestation + patch + status, with `proposalsRepo.lockInCase` (`FOR UPDATE`) then a re-check of `status = 'pending'` | integration tests |
| `InvalidError` is caller-fixable input (400). A write that returns no row is `InternalError`; an update/delete of a caller-supplied id matching nothing is `NotFoundError` | `map-domain-error.test.ts`; no lint |
| Case children are org-scoped: API/actor Effects take `organizationId` and gate with `assertCaseInOrgEffect` (foreign or missing Case is `not_found`). Worker/export paths that already trust a Case id use `assertCaseExistsUncheckedEffect` / `casesRepo.getByIdUnchecked`: never widen that to HTTP handlers | `org-isolation.int.test.ts` (hand-enumerated) |
| Inside a TX, pass `tx` into the `assert*InCase` helpers; never assert on the global pool while writing on `tx` | guidance |

## Gotchas

- Job pipeline, `JobFibers`, cancel/abort, Effect 4 sticky interrupt, boss roles, `blocked` leftovers: [`effect/references/jobs.md`](../../.agents/skills/effect/references/jobs.md) is the single home.
- Playbooks: `advancePlaybookRunEffect` in `jobs/stages/chain.ts` is the only chain (success, failure, stale fail, stuck reclaim). `runPlaybookEffect` inserts the run and the step-0 `queued` Job; later steps are created lazily after the previous Job succeeds (`playbookFanIndex`). Do not pre-insert the rest of the recipe.
- Agent ingress: propose by default; `graph write` + `userOverride` writes Graph at `unverified` plus a `graph_writes` audit row. `parseAgentPatchEffect` is the shape gate.
- Identifier Accept validates with `validateIdentifierWrite` (same as Dossier create/update). Invalid Identifier values block Accept; `identifierCollisions` on the Inbox list only warn.
- Entity create seeds default Questions through `seedDefaultQuestionsEffect` (`graph/questions.ts`, keyed by entity kind): do not inline kind `if`s in `createEntity`.
- Vault slots are listed/written through the `*Effect` credential helpers and never return plaintext.
- Organization delete: `deleteOrganizationCasesEffect(organizationId, { actorId })` removes every Case (artifacts and export dir included) before the org row goes, because `cases.organization_id` is a soft ref and nothing cascades. The app wires it through `createAuth({ beforeDeleteOrganization })`.
- Export: `scheduleCaseExportEffect` coalesces through a `SynchronizedRef` and marks dirty synchronously (`runSync`), so fire-and-forget calls still coalesce. The export dir is `<export>/<organization-id>/<case-slug>/`; case rename regenerates the slug (unique within the organization), then reschedules export.
- After-commit SSE notifies (`notify*Effect`) fire only when not inside a parent `transact`; accept/reject notify after their own commit.
- Client-safe label helpers live in `@watchdog/core/job-display`; worker code imports `@watchdog/core/worker`, not a domain subpath.
- Logging: `@watchdog/log` (`logSwallowed`, `logProcess`). evlog is not `Job.logs` / `graph_writes` custody.
- Tests: generic padded-UUID trim belongs in unit owners (`graph/patch/__tests__/guards.test.ts`, `@watchdog/schemas` `primitives-trim.test.ts`, db `scoped-ids.test.ts`); core `*.int.test.ts` assert domain contracts only. Core tests must not import `drizzle-orm`.

See also: [`packages/db/AGENTS.md`](../db/AGENTS.md) · [`packages/caps/AGENTS.md`](../caps/AGENTS.md) · [`packages/policy/AGENTS.md`](../policy/AGENTS.md) · [`docs/reference/platform/README.md`](../../docs/reference/platform/README.md).
