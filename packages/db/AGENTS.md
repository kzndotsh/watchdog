# Database package (`@watchdog/db`)

> Scope: `packages/db` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

Drizzle ORM + postgres.js for the Watchdog Case Graph and Better Auth tables.

## Structure

| Layer | Location | Owns |
| --- | --- | --- |
| Model | `src/schema/*` | Table definitions |
| Repository | `src/repos/*.repo.ts` | SQL only — queries/commands over `DbExec` |
| Barrel | `src/repos/index.ts` | Named re-exports (`claimsRepo`, `ClaimRow`, …) — entrypoint `@watchdog/db`; `@watchdog/db/schema` for schema-only |

Services (`@watchdog/core`) call repos. Controllers (`@watchdog/api`) call services. Apps never write SQL except documented exceptions (`auth/server.ts`, SSE `listenForEvents`).

The barrel is **re-exports only**. Do not add an aggregate `repos` object: building one needs a value import of every repo, so a single type import would pull all repo modules and their tables into the graph.

## Repo contract (six rules)

1. **Rows, not DTOs** — no `.toISOString()`, no API-shaped objects. Read-model joins for display _are_ allowed (`EdgeListRow` carries peer names; `JobWithPlaybook` carries `playbookId` + `playbookRunStatus`); name them `…Row` or `…With…`, keep formatting in core, and return multi-aggregate joins **nested** (never flattened — flattening invites `"x" in row` probes).
2. **Never `notifyEvent`** — fire after commit in the service.
3. **Never throw domain errors** — return `null` / `[]`; the service decides 404 vs conflict. Core maps unique violations with `tryDb` / `mapPostgresCatch` — do not put that mapping inside repos.
4. **Never open a transaction** — only services call `transact` (Drizzle `db.transaction` lives in `packages/core` `postgres-tx.ts`).
5. **Plain values only** — no `SQL` / `eq(...)` in public signatures. Options like `{ includeRetracted?: boolean }`; the repo builds `where` internally.
6. **Soft delete is the repo's job** — only `evidence` has `deletedAt`; exclude deleted by default (`isNull(deletedAt)`), require `includeDeleted`. A method that deliberately includes deleted rows says so in its name (`getUriInCaseIncludingDeleted`).

### Red flags — STOP

- Protocol/interface split for Drizzle repos (TS structural typing is enough)
- `listWhere(exec, cond: SQL)` leaking drizzle types to core
- `notifyEvent` / `db.transaction` / `throw new Error("… not found")` inside `repos/`
- Hand-written row interfaces when `$inferSelect` / column maps suffice
- Accepting optional trailing `exec` that defaults to global `db` inside repos (always leading `exec: DbExec`)
- A repo method that only forwards to another repo method with a narrower input type

## DbExec convention

```ts
export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbExec = typeof db | DbTx;
```

Repos take `exec` first. Outside a TX pass `db`; inside pass `tx`. This **inverts** session-per-method frameworks (e.g. Tux) so multi-table unit-of-work (Inbox Accept) stays one transaction.

## Schema conventions

- **Enums:** `text().$type<T>()` from `@watchdog/schemas` — **never** `pgEnum`.
- **PKs:** `uuid().defaultRandom()` for domain tables; `text` for Better Auth.
- **Timestamps:** [`src/schema/_helpers.ts`](src/schema/_helpers.ts). `updatedAt` uses `$onUpdateFn`, so **never** hand-set it in a `.set()` — drizzle injects it on every update.
- **Queries:** builder API only (`select` / `insert` / `update` / `delete`). No `db.query` / `relations()`.
- **Indexes:** array callback form. List-by-case/entity FKs get non-unique indexes.
- **JSONB:** concrete `$type` interfaces — no bare `jsonb()`.
- **Events:** `notifyEvent` on the shared pool; `listenForEvents` opens a dedicated LISTEN connection. Effect consumers use `listenForEventsStream` (`Stream.callback`).
- **Boot URL:** runtime via `@watchdog/env/server`. **`drizzle.config.ts` does not** — loads repo-root `.env` with dotenv.

**Soft refs (no FK):** `jobs.proposal_id` (would cycle with `proposals.job_id`) · `claims.superseded_by_claim_id` / `proposals.superseded_by_proposal_id` (self-ref, app-enforced) · `cap_cache.job_id` (cache may outlive Job; `case_id` is a real FK) · `credentials.user_id` (auth id as text, no cross-schema FK) · `cases.organization_id` (Better Auth org id as text, no cross-schema FK).

## Migrations

- SoT is the **TypeScript schema** under `src/schema/`. Generate: `pnpm db:generate` → apply: `pnpm db:migrate`. Keep `drizzle/meta/` snapshots in sync with `_journal.json`. Never hand-author a migration without a snapshot. Live kit history is a squash: `0000_baseline` + follow-ons. `CREATE SCHEMA "auth"` migrations should use `IF NOT EXISTS` when init.sql already created the schema.

## Gotchas

- **`notifyEvent`**: shared pool (`client`). **`listenForEvents`**: dedicated postgres.js connection (not the shared pool). `listenForEventsStream` is the Effect wrapper; worker `runMain` consumes it with `Stream.runForEach`.
- Jobs / playbooks: `playbook_fan_index` NOT NULL default 0; unique `(playbook_run_id, playbook_step, playbook_fan_index)` (`jobs_playbook_run_step_fan_uq`); `handoff` jsonb `$type<JobHandoff>`. New steps insert `queued`. `releaseBlockedStep` / `abandonBlockedForPlaybook` clean historical `blocked` rows only — do not pre-insert them. `playbookRunsRepo.lock` (`FOR UPDATE`) + `listRunning`; `jobsRepo.listForPlaybookRun`. `jobs.actor_label` / `evidence.actor_label` / `graph_writes.actor_label` / `playbook_runs.actor_label` store an API-key display snapshot (`api-key:…`) only; `actor_id` stays the user id.
- **Tasks:** `position` int NOT NULL + `tasks_case_status_position_idx`. List order `position, createdAt`. `nextPosition` / `rewriteOrder` — do not order the board by `createdAt` only.
- **Cap cache:** unique `(case_id, capability_id, input_hash)`; `lookupActive(exec, caseId, …)` is case-scoped. Migration `0006` wipes existing cache rows.
- **`activity_events`**: append-only task activity rows for Dashboard Activity (status diffs); not a Graph table and not an SSE notify source by itself. Optional `actor_id` is the acting user id (display labels resolve in core).
- **`auth.auth_event`**: append-only auth process rows (`session.created` + IP/UA). Insert via `insertAuthEvent` / `onAuthSessionCreated` in `src/auth/`, not a Graph repo. Not Graph audit and not an SSE notify source. Wipe keeps `auth.*`.
- **Cases by id:** `casesRepo.getById(exec, id, organizationId)` is the default (org filter). `getByIdUnchecked` is only for worker/export internals where the Case id already came from a trusted Job or child row — core mirrors this with `assertCaseInOrgEffect` vs `assertCaseExistsUncheckedEffect`.
- **Search `ilike`**: escape user terms in `src/repos/_ilike.ts` (`containsPattern`); do not concatenate `%` in repo callers.
- Postgres `53300`: usually Vite/tsx HMR leaking pools — singleton + `idle_timeout` stay; do **not** raise pool `max` (stays 10); restart vite + worker if needed.
- `@effect/sql-pg@4.0.0-rc.112` exists, but Drizzle schema/migrations stay SoT. Core wraps repo Promise calls with `Effect.tryPromise` + `mapPostgresCatch` — do not dual-write through `@effect/sql-pg`.

## Commands

| Task | Command |
| --- | --- |
| Repo soft-rule gate | `pnpm --filter @watchdog/db check:repos` |
| Generate / apply migrations | `pnpm db:generate` · `pnpm db:migrate` |
| Studio | `pnpm db:studio` |
| Wipe case data | `just wipe` / `just wipe yes` — truncates public Graph/Jobs/Inbox/Evidence; keeps `auth.*` (users, orgs, members, API keys) + `credentials` + migrations. Empties MinIO objects, not the bucket. Not `docker compose down -v`. |

`check:repos` gates `src/repos/*.repo.ts` on the mechanically checkable parts of the contract: leading `exec: DbExec`, plus no `notifyEvent` (2), `throw new` (3), `.transaction(` (4), `.toISOString()` (1), or `: SQL` in a signature (5). Rule 6 and the nested-read-model rule stay review conventions, as does update/delete without `.where()` (oxlint hosts no drizzle plugin).

## See also

[`docs/reference/platform/caps-lexicon.md`](../../docs/reference/platform/caps-lexicon.md) · [`docs/reference/platform/README.md`](../../docs/reference/platform/README.md)
