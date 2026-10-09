# Database package (`@watchdog/db`)

> Scope: `packages/db` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

Drizzle ORM + postgres.js for the Watchdog Case Graph and Better Auth tables.

## Commands

| Task | Command |
| --- | --- |
| Repo rules | `pnpm check` (oxlint `watchdog/db-repo-*`, scoped to `src/repos/*.repo.ts`) |
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

Services (`@watchdog/core`) call repos; controllers (`@watchdog/api`) call services. Apps never write SQL, except `@watchdog/auth`; the SSE route reaches Postgres through core (the `ActivityTailer`). The barrel is re-exports only: do not add an aggregate `repos` object (it would pull every repo and table into any importer's graph). Repos take `exec: DbExec` first (pass `db` outside a TX, `tx` inside) so multi-table units of work such as Inbox Accept stay one transaction.

## Repo contract

| # | Rule | Enforced by |
| --- | --- | --- |
| 1 | Rows, not DTOs: no `.toISOString()`, no API-shaped objects. Display read-model joins are fine (`…Row` / `…With…`), nested, never flattened | `watchdog/db-repo-no-dto-date` (`toISOString`); nesting is review |
| 2 | Never send a NOTIFY (`pg_notify`, `.notify(`) from a repo. The only sender is the `activity` log's `AFTER INSERT` trigger, so the signal is part of the transaction (delivered at commit, dropped on rollback) | `watchdog/db-repo-no-notify` |
| 3 | Never throw domain errors; return `null` / `[]` and let the service decide 404 vs conflict. Unique-violation mapping lives in core (`tryDb` / `mapPostgresCatch`) | `watchdog/db-repo-no-throw` |
| 4 | Never open a transaction; only services call `transact` | `watchdog/db-repo-no-transaction` |
| 5 | Plain values only: no `SQL` / `eq(...)` in public signatures | `watchdog/db-repo-no-sql-param` |
| 6 | Soft delete is the repo's job: only `evidence` has `deletedAt`; exclude deleted by default, require `includeDeleted`, and name methods that include them (`getUriInCaseIncludingDeleted`) | review only |
| - | No local job status set: use `OPEN_` / `CANCELLABLE_` / `LIVE_` / `TERMINAL_JOB_STATUSES` from `@watchdog/schemas` | `watchdog/db-repo-no-job-status-set` |
| - | Builder API only: no raw `sql` template fragments (existing ones are baselined per file; shrink, never raise) | `watchdog/db-repo-no-raw-sql` |
| - | No `zod` / `drizzle-zod` import: repos do not validate | `watchdog/db-repo-no-validation-import` |
| - | Leading `exec: DbExec` parameter; no `trimmedOrNull` in repos; `trimmedOrUndefined` only in lookup-only methods | `watchdog/db-repo-exec-first`, `watchdog/db-repo-no-trim-or-null`, `watchdog/db-repo-trim-lookup-only` |

Repos do **not** re-validate display strings (name/title/text, slugify, blank→null): Zod and core `*Effect` own that. Repos do keep lookup scoping (`trimCaseId` / `trimResourceId` / `trimActorId` on WHERE; an invalid UUID returns `[]` / `null`), slug WHERE keys (`slugForLookup`; case slugs are unique per organization, so case-by-slug lookups take `organizationId`), fail-closed graph ids, and actor integrity on proposals. `create`/`update` return `null` for a scoped-id miss, actor reject, or zero-row update/delete, not for empty display text. Padded-UUID lookup behavior is tested once in `src/repos/__tests__/scoped-ids.test.ts`.

Trimming boundary (ADR-0003): a `CaseId` is already a validated uuid, so for a typed Case id the repos' `trimCaseId` / `trimScopedCaseIds` have nothing left to clean up and stay as a fail-closed re-check: a brand stamped without validation (`untrustedCaseId`, tests only) still misses instead of matching. The helpers themselves still trim plain strings (`trimCaseId("  <uuid>  ")` returns the `CaseId`, and `orgCaseFilter` accepts padded canonical UUIDs), which is what the padded-UUID tests exercise. `_scoped-ids.ts` is the one place a plain string enters: `trimCaseId(string)`, `trimResourceId(string)` (entity, job, evidence, edge, proposal and other graph ids stay plain strings until their own phase) and `trimActorId`. A test that passes a padded or malformed Case id on purpose parses it at the test edge with `untrustedCaseId(...)` from `@watchdog/schemas/testing`; it never casts and never loosens a repo signature back to `string`.

## Schema conventions (guidance; nothing lints these)

- Enums: `text().$type<T>()` from `@watchdog/schemas`, never `pgEnum`. JSONB: concrete `$type` interfaces, no bare `jsonb()`.
- Builder API only (`select` / `insert` / `update` / `delete`); no `db.query` / `relations()`.
- Branded ids: every `case_id` / `cases.id` column is `.$type<CaseId>()` and every organization id column (`cases.organization_id`, `auth.organization.id`, `member`, `invitation`, `session.active_organization_id`) is `.$type<OrganizationId>()`. That is a promise the database cannot check: raw `sql` results are not branded. Repo `organizationId` and `caseId` parameters (and the `caseId` of every `values` / input object) are `OrganizationId` / `CaseId`; a swapped `(caseId, organizationId)` call fails to compile. `cases.repo` takes its Case id as `CaseId` too. Never cast.
- PKs: `uuid().defaultRandom()` for domain tables, `text` for Better Auth. Timestamps: `src/schema/_helpers.ts`; `updatedAt` uses `$onUpdateFn`, so never set it by hand in `.set()`.
- Indexes in array callback form; list-by-case/entity FKs get non-unique indexes.
- Migrations: the TypeScript schema is the source. `pnpm db:generate` then `pnpm db:migrate`; never hand-author a migration without its `drizzle/meta` snapshot (keep it in sync with `_journal.json`). `CREATE SCHEMA "auth"` migrations use `IF NOT EXISTS` when `init.sql` already created it.
- Migration workflow: generate with an explicit name, `pnpm db:generate --name=<what_changed>` (snake_case, e.g. `add_task_due_date`); never accept a random drizzle name. A released migration (anything on `main`) is immutable: never edit or rename it, add a new one. Existing names stay as they are. `pnpm check:migrations` (pre-commit, CI) runs generate and fails when a schema edit has no migration.
- `drizzle.config.ts` does not use `@watchdog/env/server`: it loads the repo-root `.env` with dotenv.
- **Soft refs (no FK):** `jobs.proposal_id` (cycles with `proposals.job_id`) · `claims.superseded_by_claim_id` / `proposals.superseded_by_proposal_id` (self-ref) · `cap_cache.job_id` (cache may outlive the Job; `case_id` is a real FK) · `credentials.user_id` and `cases.organization_id` (Better Auth ids as text, no cross-schema FK).

## Gotchas

- `listenOnChannel` opens a dedicated postgres.js connection that stays open until `end()`: awaiting `sql.listen` only waits for LISTEN to start, so ending the connection behind it silently drops every notification (fixed in ADR-0005 S1; postgres.js re-LISTENs after a dropped connection, so consumers keep a fallback poll). Its only caller is the activity tailer, on `watchdog_activity`.
- Activity retention (ADR-0005 S7): `activity_floor` is a one-row table (`singleton` boolean primary key with a check) holding the newest `(xid, id)` ever pruned; `activityFloorRepo.get` / `raise` (forward only, `setWhere` row comparison) / `zeroXid`. `activityLogRepo.pruneBatch(exec, { before, keepPerCase, limit, notPast })` is the only prune: it deletes in `(xid, id)` order rows older than `before`, outside the newest `keepPerCase` of their Case (by id, through `(case_id, id desc)`), at or below `notPast`, and returns `{ count, newest }`; the caller (core) runs it and `activityFloorRepo.raise` in one `transact`. `activityCursorsRepo.slowestActive(exec, since)` is the lowest cursor among consumers that moved at or after `since`.
- Activity cursors (ADR-0005 S5): `activity_cursors(consumer, xid, id)` holds one durable read position per named consumer (`activityCursorsRepo.get` / `set`, upsert in either direction so a resync can move a stale cursor back to the head); the worker export consumer is the only user. `createActivityTailer` takes `startAt` (resume after a cursor instead of the head) and `onListenError` (a LISTEN that could not connect, apart from drain errors the tailer survives). `casesRepo.listAllIdsUnchecked` is the worker re-scan read.
- Activity log (ADR-0005): table `activity` (`id bigint identity`, `xid xid8 default pg_current_xact_id()`), the only writer is `activityLogRepo.append(tx, ...)` through core's `appendActivityEffect`. The migration `activity_trigger_and_backfill` (hand-written SQL with its snapshot) installs the `activity_notify` trigger, which `pg_notify`s `watchdog_activity` with `{id, caseId}` (a wake-up; readers fetch rows). Read only through `activityLogRepo.drain`: `(xid, id) > cursor AND xid < pg_snapshot_xmin(pg_current_snapshot())`, which never returns a row that an older still-open transaction could precede. `createActivityTailer` is the per-process tailer (one LISTEN connection, a 5 s fallback poll, a 250 ms re-poll while a transaction holds rows back). Backfilled rows carry `xid = 0`. An `xid8` restored from another cluster can sit in the future: core's boot check rewrites it (`activityLogRepo.hasFutureXid` / `zeroXids`, `activityFloorRepo.zeroXid`, `activityCursorsRepo.zeroXids`; see [`restore-database`](../../docs/how-to/restore-database.md)).
- Jobs: unique `(playbook_run_id, playbook_step, playbook_fan_index)` (`jobs_playbook_run_step_fan_uq`); new steps insert `queued` (legacy `blocked` handling: [`jobs.md`](../../.agents/skills/effect/references/jobs.md)). The `actor_label` columns store an API-key display snapshot (`api-key:…`) only; `actor_id` stays the user id.
- Tasks: `position` int NOT NULL; list order is `position, createdAt`; use `nextPosition` / `rewriteOrder`, never `createdAt` alone.
- Cap cache is unique on `(case_id, capability_id, input_hash)`; `lookupActive` is case-scoped.
- `activity` (the log) is the only source of Recent activity (`activityLogRepo.recentFeed`: one org-scoped query, collapsed by `group_id`, through the `FEED_ACTIONS` allowlist; `proposalLabelRows` and `jobLabelRows` resolve labels for the entries it returns) and of the live signal; migration `backfill_feed_activity` gave the pre-log Evidence, Proposals and Jobs of the last 90 days their entries (`xid` 0, idempotent). The old Task-only log table was dropped in migration 0018 (S1 had copied its rows into `activity`). `auth.auth_event` is an append-only process row (not Graph, not an SSE source). `onAuthSessionCreated` stamps `session.active_organization_id` from the user's membership; `promoteFirstUserToInstanceAdmin` runs from the auth `user.create.after` hook; the DB does not auto-create an organization.
- `casesRepo.getById(exec, id, organizationId)` is the default. `getByIdUnchecked` is only for worker/export internals whose Case id came from a trusted Job or child row.
- Search `ilike`: escape user terms with `containsPattern` (`src/repos/_ilike.ts`); never concatenate `%` in callers.
- Postgres `53300` is usually Vite/tsx HMR leaking pools: restart vite + worker rather than raising the pool `max`.
- Core wraps repo Promise calls with `Effect.tryPromise` + `mapPostgresCatch`; do not dual-write through `@effect/sql-pg`.

See also: [`docs/reference/platform/README.md`](../../docs/reference/platform/README.md).
