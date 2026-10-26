# Collect's queue projection

**What this is:** how the database keeps `collect_queue` and `collect_queue_member` (#574), the projection Collect's queue will read through the list standard, and what keeps it right.  
**What this is not:** the screen (part 3 of #574), or the queue builder it replaces (`buildCollectIndex`, web).

## What a row is

One row per slot of the partition the queue builder makes of a Case:

| `kind` | `id` | Exists when | Members |
| --- | --- | --- | --- |
| `evidence` | Evidence id | always (hidden Evidence included) | the Jobs attached to it (none when hidden) |
| `run` | `playbook_run_id` | a step of the run attached to no visible Evidence | those steps |
| `job` | Job id | the Job has no run and attached to no visible Evidence | itself |

A Job attaches to every visible Evidence row of its Case that it could link: none when it landed more than one row; otherwise its one landed row, plus the ids in its input (`evidenceId`, `sourceEvidenceId`) when it is a Process or enrich Job or a playbook step. An input id is read by `collect_input_evidence_id`, which mirrors `parseTrimmedUuid` and never raises.

`state` is `hidden`, `unprocessed` or `landed` for Evidence; for a run or Job row it is the state of its current attempts (a Job another member retries is out) by priority: `running`, `queued`, `failed`, `cancelled`, then `landed`. `sort_at` is when the row started (capture, run start, Job creation). `activity_at` uses stored times only: `captured_at` for Evidence (today's order), and for a run or Job row the latest member creation, start or finish, or hide of Evidence the member could attach to. `search_text` is built in a fixed order and cut at 4,000 characters.

## How writes reach it

1. Row triggers on `jobs`, `evidence`, `job_evidence`, `playbook_runs` and `cases` (a restore) record the changed keys in a temporary table of the session and insert one marker row per transaction into `collect_queue_tx` (UNLOGGED). A Job update that changes only logs or `updated_at` does not fire.
2. The marker's deferred constraint trigger runs `collect_queue_flush()` once, at COMMIT. It takes each touched Case's advisory lock in ascending key order (`pg_advisory_xact_lock(1464091473, collect_queue_lock_key(case))`) and recomputes only the rows the keys reach (`collect_queue_sync`): membership by difference, upserts guarded by `IS DISTINCT FROM`.
3. The flush never fails its writer. A Case that raises (a lock timeout or a deadlock included) rolls back its own subtransaction and is logged in `collect_queue_stale`; the transaction commits.

The tables have no foreign keys, so the flush takes no lock on a source table and cannot close a cycle with `settleJobInTx` or `casesRepo.lockById`. A purge clears the Case's rows in `evidence_links_before_case_delete`; a tombstoned Case is left frozen, and its restore rebuilds it.

Every function pins `search_path` and is SECURITY DEFINER where it writes. The application role reads the two tables and has no privilege on `collect_queue_tx`, `collect_queue_stale` or `collect_queue_case`; it may call `collect_queue_flush`, `collect_queue_rebuild`, `collect_queue_diff` and `collect_queue_find_drift`, which only recompute from the sources.

## How it is read

`collectList` (`@watchdog/schemas/jobs`) is the declared list over `collect_queue`; `collectListRepo` binds it (`packages/db/src/repos/collect-list.repo.ts`), and `collect.list` (`GET /cases/{caseId}/collect`) and `wd collect list` read it.

- **Filters.** `hidden` (the Evidence the user hid; no Jobs, no state), `state`, `kind`, `unprocessed`, `unattached`, `capability` (a Cap or playbook id, any member), `entityId`, and `q` over `search_text` plus the state labels. `hidden` excludes `state`, `kind`, `unprocessed`, `unattached` and `capability`; `unattached` excludes `entityId`.
- **Sorts.** `activity.desc` (the default) and `started.desc` / `started.asc`, each ending in the id. `activity` is a _moving_ key (`moving: true`, descending only): a row rises when a Job starts or finishes and drops when a step attaches to Evidence. The cursor carries the value the row had when the page was read, so a row that rose past the cursor is skipped by a walk in progress and a row that dropped comes back on a later page. A view that pages it keeps the first occurrence of an id and re-reads its loaded pages when a change arrives.
- **One statement.** A page, `byIds` and the count go through the list binding. The page statement selects each row's member Jobs (a correlated `jsonb_agg` over `collect_queue_member`) and its Evidence (a left join), so a row's state, Jobs and Evidence come from one snapshot: the flush writes the projection in the commit of the source change, and the statement sees both or neither. Only the titles of the Evidence and Entities named in the Jobs' inputs and the actors' labels are read afterwards.
- **Indexes.** The btrees lead `(case_id, hidden, key, id)`: every read compares the generated `hidden` by equality (`sortLead` in the binding, which the plan gate reads), so no Sort node is needed for either sort. `state` uses `(case_id, state, activity_at, id)` and `entityId` a partial `(case_id, entity_id, activity_at, id)`. `kind`, `unattached` and `capability` scan the activity index and filter, bounded by the Case's rows.
- **`collect.get`** (`GET /cases/{caseId}/collect/{id}`, `?hidden=true` for the hidden view) answers `{ item, focusJobId }` for the first match of: a row id in the mode; a member Job (the row it landed, else the newest by `activity_at`, then id; `focusJobId` is the Job); a run with no row (the newest Evidence row holding one of its Jobs, with that Job in focus). Otherwise `not_found` (`Collect item`).

## Repair

The worker's reconcile tick (`reconcileJobsEffect`) calls `findCollectQueueDrift`: every live Case with a stale mark, every one of the 20 Cases counted longest ago whose counts disagree (Evidence rows, member Jobs, empty run or Job rows), and the one Case compared longest ago when a full comparison (`collect_queue_diff`) finds a difference. Each is rebuilt (`rebuildCollectQueue`) and logged as `collect_queue.drift { caseId, reason }`.

## Changing a rule

A rule lives twice: in SQL (`collect_queue_cand`, `collect_queue_memberships`, `collect_queue_compute`, `collect_input_*`) and in TypeScript (`collectQueueReference`, `@watchdog/schemas/testing`). Change both in one PR, as a migration with `CREATE OR REPLACE` followed by the backfill statement (`SELECT public.collect_queue_rebuild(c.id) FROM public.cases c WHERE c.deleted_at IS NULL`). The tests fail until both agree:

- `collect-queue-fixture.int.test.ts` (db): the 12-case fixture's hand-written rows and orders, and the reference on every column.
- `collect-queue-model.int.test.ts` (db): random committed command sequences; after each, the projection equals the reference and a full rebuild.
- `collect-queue-concurrency.int.test.ts` (db): real connections and commits; no deadlock, no stale mark.
- `collect-queue-rules.int.test.ts` (core): the id parse against `parseTrimmedUuid`, the linked Caps against the catalog.
- `collect-queue-reference.test.ts` (web): the reference against `buildCollectIndex`.

A test whose transaction rolls back sees the projection only after `flushCollectQueue(tx)` (test-db); the `seed*` helpers that write Jobs or Evidence call it. The perf seed loads with the triggers off and builds the projection once (`scripts/perf-seed/seed.sql`).
