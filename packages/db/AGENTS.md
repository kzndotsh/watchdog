# Database package (`@watchdog/db`)

> Scope: `packages/db` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

Drizzle ORM + postgres.js for the Watchdog Case Graph and Better Auth tables.

## Commands

| Task | Command |
| --- | --- |
| Repo rule gate | `pnpm --filter @watchdog/db check:repos` |
| Generate / apply migrations | `pnpm db:generate` · `pnpm db:migrate` |
| Studio | `pnpm db:studio` |
| Wipe case data | `just wipe` / `just wipe yes`: truncates public Graph/Jobs/Inbox/Evidence; keeps `auth.*` (users, orgs, members, API keys), `credentials`, and migrations. Also empties the evidence bucket when the local `watchdog-s3` container is running and `S3_ENDPOINT` is local. Not `docker compose down -v`. |
| Screenshot seed | `just seed-demo` · `just seed-demo --force`: fictional cases in `scripts/demo-seed/`, owned by the earliest org owner; leaves no queued Jobs. |

## Structure

| Layer | Location | Owns |
| --- | --- | --- |
| Model | `src/schema/*` | Table definitions |
| Repository | `src/repos/*.repo.ts` | SQL only: queries/commands over `DbExec` (`src/exec.ts`) |
| Barrel | `src/repos/index.ts` | Named re-exports, entrypoint `@watchdog/db` (`@watchdog/db/schema` for schema-only) |

Services (`@watchdog/core`) call repos; controllers (`@watchdog/api`) call services. Apps never write SQL, except `@watchdog/auth` and SSE `listenForEvents`. The barrel is re-exports only: do not add an aggregate `repos` object (it would pull every repo and table into any importer's graph). Repos take `exec: DbExec` first (pass `db` outside a TX, `tx` inside) so multi-table units of work such as Inbox Accept stay one transaction.

## Repo contract

| # | Rule | Enforced by |
| --- | --- | --- |
| 1 | Rows, not DTOs: no `.toISOString()`, no API-shaped objects. Display read-model joins are fine (`…Row` / `…With…`), nested, never flattened | `check:repos` (`toISOString`); nesting is review |
| 2 | Never `notifyEvent` in a repo; services fire it after commit | `check:repos` |
| 3 | Never throw domain errors; return `null` / `[]` and let the service decide 404 vs conflict. Unique-violation mapping lives in core (`tryDb` / `mapPostgresCatch`) | `check:repos` |
| 4 | Never open a transaction; only services call `transact` | `check:repos` |
| 5 | Plain values only: no `SQL` / `eq(...)` in public signatures | `check:repos` |
| 6 | Soft delete is the repo's job: only `evidence` has `deletedAt`; exclude deleted by default, require `includeDeleted`, and name methods that include them (`getUriInCaseIncludingDeleted`) | review only |
| - | No local job status set: use `OPEN_` / `CANCELLABLE_` / `LIVE_` / `TERMINAL_JOB_STATUSES` from `@watchdog/schemas` | `check:repos` |
| - | Leading `exec: DbExec` parameter; no `trimmedOrNull` in repos; `trimmedOrUndefined` only in lookup-only methods | `check:repos` |

Repos do **not** re-validate display strings (name/title/text, slugify, blank→null): Zod and core `*Effect` own that. Repos do keep lookup scoping (`trimCaseId` / `trimResourceId` / `trimActorId` on WHERE; an invalid UUID returns `[]` / `null`), slug WHERE keys (`slugForLookup`; case slugs are unique per organization, so case-by-slug lookups take `organizationId`), fail-closed graph ids, and actor integrity on proposals. `create`/`update` return `null` for a scoped-id miss, actor reject, or zero-row update/delete, not for empty display text. Padded-UUID lookup behavior is tested once in `src/repos/__tests__/scoped-ids.test.ts`.

## Schema conventions (guidance; nothing lints these)

- Enums: `text().$type<T>()` from `@watchdog/schemas`, never `pgEnum`. JSONB: concrete `$type` interfaces, no bare `jsonb()`.
- Builder API only (`select` / `insert` / `update` / `delete`); no `db.query` / `relations()`.
- Branded ids: every `case_id` / `cases.id` column is `.$type<CaseId>()` and every organization id column (`cases.organization_id`, `auth.organization.id`, `member`, `invitation`, `session.active_organization_id`) is `.$type<OrganizationId>()`. That is a promise the database cannot check: raw `sql` results are not branded. Repo `organizationId` parameters are `OrganizationId`; `caseId` parameters stay `string` because repos trim and validate them (`trimCaseId` in `repos/_scoped-ids.ts` returns `CaseId | undefined`); never cast.
- PKs: `uuid().defaultRandom()` for domain tables, `text` for Better Auth. Timestamps: `src/schema/_helpers.ts`; `updatedAt` uses `$onUpdateFn`, so never set it by hand in `.set()`.
- Indexes in array callback form; list-by-case/entity FKs get non-unique indexes.
- Migrations: the TypeScript schema is the source. `pnpm db:generate` then `pnpm db:migrate`; never hand-author a migration without its `drizzle/meta` snapshot (keep it in sync with `_journal.json`). `CREATE SCHEMA "auth"` migrations use `IF NOT EXISTS` when `init.sql` already created it.
- Migration workflow: generate with an explicit name, `pnpm db:generate --name=<what_changed>` (snake_case, e.g. `add_task_due_date`); never accept a random drizzle name. A released migration (anything on `main`) is immutable: never edit or rename it, add a new one. Existing names stay as they are. `pnpm check:migrations` (pre-commit, CI) runs generate and fails when a schema edit has no migration.
- `drizzle.config.ts` does not use `@watchdog/env/server`: it loads the repo-root `.env` with dotenv.
- **Soft refs (no FK):** `jobs.proposal_id` (cycles with `proposals.job_id`) · `claims.superseded_by_claim_id` / `proposals.superseded_by_proposal_id` (self-ref) · `cap_cache.job_id` (cache may outlive the Job; `case_id` is a real FK) · `credentials.user_id` and `cases.organization_id` (Better Auth ids as text, no cross-schema FK).

## Gotchas

- `notifyEvent` uses the shared pool; `listenForEvents` opens a dedicated postgres.js connection; `listenForEventsStream` is its Effect wrapper.
- Jobs: unique `(playbook_run_id, playbook_step, playbook_fan_index)` (`jobs_playbook_run_step_fan_uq`); new steps insert `queued` (legacy `blocked` handling: [`jobs.md`](../../.agents/skills/effect/references/jobs.md)). The `actor_label` columns store an API-key display snapshot (`api-key:…`) only; `actor_id` stays the user id.
- Tasks: `position` int NOT NULL; list order is `position, createdAt`; use `nextPosition` / `rewriteOrder`, never `createdAt` alone.
- Cap cache is unique on `(case_id, capability_id, input_hash)`; `lookupActive` is case-scoped.
- `activity_events` and `auth.auth_event` are append-only process rows (not Graph, not SSE sources). `onAuthSessionCreated` stamps `session.active_organization_id` from the user's membership; `promoteFirstUserToInstanceAdmin` runs from the auth `user.create.after` hook; the DB does not auto-create an organization.
- `casesRepo.getById(exec, id, organizationId)` is the default. `getByIdUnchecked` is only for worker/export internals whose Case id came from a trusted Job or child row.
- Search `ilike`: escape user terms with `containsPattern` (`src/repos/_ilike.ts`); never concatenate `%` in callers.
- Postgres `53300` is usually Vite/tsx HMR leaking pools: restart vite + worker rather than raising the pool `max`.
- Core wraps repo Promise calls with `Effect.tryPromise` + `mapPostgresCatch`; do not dual-write through `@effect/sql-pg`.

See also: [`docs/reference/platform/README.md`](../../docs/reference/platform/README.md).
