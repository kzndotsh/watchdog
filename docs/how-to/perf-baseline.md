# Performance baseline

**What this is:** the measurement base for database performance work: query statistics (`pg_stat_statements`) in the dev Postgres, a frozen synthetic dataset in a private scratch database, and a scripted session whose top queries you read back. Every performance change should move numbers taken here.  
**What this is not:** a benchmark of production latency. The dataset is deliberately heavy; read the shape of the curve, not the absolute milliseconds. Query-count budgets and plan assertions in tests: [testing standards](../contributing/testing/standards.md#query-count-budgets-and-plan-assertions).

## Query statistics

`docker-compose.yml` starts the dev Postgres with `pg_stat_statements` preloaded, `pg_stat_statements.track=all`, `work_mem=16MB` and `random_page_cost=1.1`; `just up` then creates the extension in `watchdog` (`just pg-stat-statements`, idempotent; a fresh volume also creates it from `docker/postgres/init.sql`). It is dev only: never a migration, and the script refuses a non-loopback `DATABASE_URL_MIGRATE`. Tuning rationale: [local-dev](local-dev.md#postgres-tuning-and-query-statistics).

A container started before this change keeps its old command line: `just up` prints a hint and skips the extension until it is recreated (`docker compose up -d postgres` recreates the container and keeps the data volume). Check with `psql ... -c "show shared_preload_libraries"`.

Statistics are cluster-wide but the view exists per database, and non-superusers see only their own queries' text. Read them as `postgres` from a database that has the extension (`watchdog`, or a scratch database made by `just perf-seed`, which creates it when the server preloads the library).

```sql
select calls,
       round(total_exec_time::numeric) as total_ms,
       round(mean_exec_time::numeric, 1) as mean_ms,
       rows,
       shared_blks_hit + shared_blks_read as blocks,
       temp_blks_written,
       left(regexp_replace(query, '\s+', ' ', 'g'), 120) as query
from pg_stat_statements
where dbid = (select oid from pg_database where datname = current_database())
  and query not ilike '%pg_stat%'
order by total_exec_time desc
limit 20;
```

Read `total_ms` first (what the session cost), then `mean_ms` (one call), `blocks` (I/O the query touches, whatever its time) and `temp_blks_written` (a sort or hash that spilled past `work_mem`). The query text carries `$n` placeholders, so one row covers every parameter value; a statement whose text differs only in its placeholder count (a longer `IN` list) gets its own row. Start a clean measurement with `select pg_stat_statements_reset()` as `postgres`.

## The synthetic dataset

```sh
just perf-seed                  # database wd_perf_seed: create, migrate, load, print sizes
just perf-seed wd_perf_other    # another name
PERF_SEED_DIV=100 just perf-seed wd_perf_smoke   # every per-Case count / 100, for a quick check
just perf-seed-drop             # drop wd_perf_seed (or: just perf-seed-drop wd_perf_other)
```

`scripts/perf-seed.sh` creates the database, applies every migration, runs the set-based `scripts/perf-seed/seed.sql` (`generate_series` inserts, one transaction, `VACUUM ANALYZE` after) and prints row counts and sizes. The shape is the backend audit's: 50 Cases (40 in `perf-org-a`, 10 in `perf-org-b`), 12,500 Entities, 50,000 Claims, 37,500 Identifiers, 25,000 Events, 37,500 Questions, 12,500 Edges, 20,000 Evidence rows (about 2 KB of text each), 50,000 finished Jobs with 30-line logs, 15,000 Proposals with 20-op patches on real Entities, and 1,000,000 activity rows over 120 days. Measured on this machine's `postgres:18-alpine`, the full load took about 40 s and the database is about 400 MB.

The seed is frozen: no `random()`, `now()` or `gen_random_uuid()`. Ids are md5 of a stable key (v4-shaped, so the live uuid parsers accept them), timestamps are a fixed base time (2026-01-01) minus a hash-derived offset, and the activity `xid` is 0. `scripts/perf-seed.sh checksum [db]` prints a row count and md5 per table; two full loads gave identical output. After loading, `packages/db/scripts/check-seed-patches.ts` parses about one Proposal in twenty through the live `patchSchema` and fails the load if any patch is invalid.

The data is obviously synthetic (`perf-*` ids, `.invalid` addresses, placeholder text) and carries no investigation content. There is no queued Job, so a running worker has nothing to pick up. To run the app or the integration tests against it, point `DATABASE_URL` at `postgresql://watchdog_app:watchdog@127.0.0.1:5432/wd_perf_seed` (`perf-seed` prints the line), and set `DATABASE_URL_MIGRATE` the same way with the `postgres` user for migrations; the seed has no sign-in user, so for the web UI add yourself to `perf-org-a` or use the core-level run below.

Guards: the name must match `wd_perf_[a-z0-9_]+`, and `postgres`, `template0`, `template1`, `watchdog`, `watchdog_test`, `watchdog_e2e`, `watchdog_e2e_s6` and `watchdog_s6` are refused by name as well, so the script cannot create, load or drop the dev, e2e or shared test databases. `up` refuses a database that already exists. The host must be loopback.

## The scripted session

Run it against the full seed with statistics reset first, so the top queries are the session's own.

1. Reset: `select pg_stat_statements_reset()` as `postgres`.
2. Dashboard: open `/` (the Case list and Recent activity).
3. Open a Case: open `perf-case-1` (Entities, Identifiers, Edges, Evidence, Proposals, Jobs, Tasks and the Case's activity).
4. Search: run 10 terms in Case search.
5. Accept a Proposal: Triage, a pending Proposal, Accept.
6. A playbook of Jobs: start a playbook with about 10 Jobs on a Case.
7. Read the top queries with the SQL above.

Steps 5 and 6 need a signed-in user, a worker and real Cap credentials, so they are a manual UI run; a seeded Job never runs. The seeded Proposals use the live patch shape and can be accepted.

### Measured: the read path, below the UI

A browser session was not run for this baseline. Steps 2 to 4 were run as one script calling core's own list and search functions through `Db.layer` (`listCasesEffect`, `listRecentActivityEffect`, then `listEntities`, `listIdentifiers`, `listEdges`, `listEvidence`, `listProposals`, `listJobs`, `listTasks` and the Case's `listRecentActivityEffect` for `perf-case-1`, then `searchCaseEffect` for ten terms), against the deterministic full seed on a fresh `postgres:18-alpine` container with the dev flags above, after `pg_stat_statements_reset()`. Nothing is measured for steps 5 and 6, the web server, auth, or network. One run; an earlier run on a previous, non-deterministic version of the seed gave the same shape (searches of 5.4 s to 9.3 s), so treat the figures as the order of magnitude.

| Step | Call | Wall time |
| --- | --- | --- |
| Dashboard | list Cases | 48 ms |
| Dashboard | Recent activity (org feed) | 1,149 ms |
| Open Case | Entities / Identifiers / Edges / Evidence | 5 / 15 / 8 / 5 ms |
| Open Case | Proposals / Jobs / Tasks | 24 / 16 / 4 ms |
| Open Case | the Case's activity | 43 ms |
| Search | `synthetic`, `perf` | 27 ms, 75 ms |
| Search | the other eight terms (`entity 12`, `claim`, `evidence body`, `proposal 7`, `example`, `log line`, `Entity`, `activity`) | 5.1 s to 7.1 s each |

Top statements by `total_exec_time` (the ten searches ran each of two query shapes five times; a row's mean mixes the fast and slow terms):

| Rank | Statement | Calls | Total | Mean | Buffer blocks | Temp blocks written |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Case search over Jobs (`jobs` left join `playbook_runs`, `ilike` across capability, summary, error, status, playbook, `input::text`, plus a per-Job `exists` over Evidence and a subquery over Entities), long form | 5 | 31,168 ms | 6,234 ms | 66,495 | 0 |
| 2 | the same, short form | 5 | 19,185 ms | 3,837 ms | 40,038 | 0 |
| 3 | Recent activity (`activity` joined to `cases`, `row_number()` per `group_id`) | 1 | 1,132 ms | 1,132 ms | 19,854 | 17,820 |
| 4 | Case search over pending Proposals | 5 | 455 ms | 91 ms | 5,752 | 0 |
| 5 | the same, second form | 5 | 236 ms | 47 ms | 4,441 | 0 |
| 6 | Case search over Entities (`ilike` plus an `exists` over Edges and peer Entities) | 5 | 225 ms | 45 ms | 113,989 | 0 |
| 7 | the same, second form | 5 | 201 ms | 40 ms | 115,251 | 0 |

### Why the Jobs search is slow here

`EXPLAIN (ANALYZE, BUFFERS)` on the captured Jobs search SELECT (SELECTs only; nothing else was analyzed), Case of 1,000 Jobs and 400 Evidence rows:

- **A term that matches nothing early (`claim`): about 9.9 s under ANALYZE (6.4 s without).** The Jobs read itself is cheap (bitmap scan on `jobs_case_id_idx`, 1,000 rows, about 1 ms). The time is `SubPlan 1`, the correlated `exists (select 1 from evidence e where e.case_id = jobs.case_id and (<ilike on 7 Evidence columns>) and (e.id::text = jobs.input->>'evidenceId' or ...))`, which ran `loops=1000` (once per Job), about 9.9 ms each. Each loop reads the Case's 400 Evidence rows through `evidence_case_id_idx` and removes all 400 by filter. The planner evaluates the `ilike` group before the `e.id::text = ...` match (the cast is not indexable and is not evaluated first), so every Job re-runs seven `ilike` over every Evidence row of the Case, about 2 KB of `text` each. That is 400,000 row filters per search, and CPU-bound: the statement touches only about 13,000 buffers per call, all cache hits. The uncorrelated Entities subquery (`SubPlan 3`) is a one-off Seq Scan of the whole `entities` table (12,500 rows, about 17 ms), not filtered by Case.
- **A term that matches `capability_id` (`perf`, `synthetic`: every seeded Job has capability `perf.synthetic`): 1.3 ms.** The `OR` short-circuits on the first branch, so no Job reaches the Evidence subplan. This is the shape of the audit's "Job search 2.0 ms" figure; it measured a matching term, which hides the cost.
- **Cause: a real query defect, amplified by the seed's Evidence size.** The per-Job Evidence `exists` is O(Jobs x Evidence in the Case) for every term that does not match a Job column first, which is most searches. The seed makes it bigger than a light Case would be (the audit's own shape: 2 KB per Evidence row, 400 per Case, 1,000 Jobs per Case) but does not create it: the Evidence match does not depend on the Job except through the id comparison, so a Case with long pasted Evidence text would be worse. The buffer counts are small next to the time, which points at CPU. (The earlier run on the previous seed reported about 2 million blocks for the same statement; why that differs was not established.)
- Not fixed in this change.

The org Recent activity query still writes 17,820 temp blocks at `work_mem=16MB`, so the larger `work_mem` does not remove its spill.

## Measured: the database fixes (#257)

Same frozen seed, fresh `postgres:18-alpine` with the dev flags above, one machine, warm cache, repo functions called directly (`db.transaction` rolled back for the prune; `BEGIN ... ROLLBACK` for the deletes). Read the ratio, not the milliseconds.

| Finding | Call | Before | After |
| --- | --- | --- | --- |
| B3 | `DELETE FROM cases` (one Case: 250 Entities, 1,000 Jobs) | 2,011 ms and 1,967 ms (two Cases) | 106 ms and 89 ms |
| B3 | `DELETE FROM entities` (one Entity) | 4.2 ms and 3.8 ms | 0.5 ms and 1.1 ms |
| B3 | `DELETE FROM jobs` (one Job) | 2.5 ms | 0.13 ms |
| B4 | Recent activity, organization of 40 Cases, 800,000 entries, limit 15 | about 1,150 ms (external merge sort, 17,820 temp blocks written) | about 21 ms (quicksort in 1.4 MB, no temp blocks) |
| B4 | the same for one Case | 38 ms | 4 ms |
| B6 | one prune batch of 5,000 | first 20 candidates took 3.9 s, 194 ms per `keep_from` probe; the batch was cancelled after minutes | 62 to 142 ms |
| B7 | Proposal search, term that matches many Entities but no patch (`summary 2`) | about 390 ms | about 30 ms |
| B7 | other terms (`summary 3`, `summary 4`, `zzz`) | 150, 155, 76 ms | 22, 21, 19 ms |

Notes:

- The seed numbers differ from the audit's (Case delete 2.9 s, prune 4.9 s, search 1.5 s) because the seed shape differs: 150 pending Proposals and 250 Entities per Case here.
- **The prune "before" is worse on this seed than in the audit.** The seed gives each Case a contiguous id range, so the old probe, which walked `activity_pkey` backward and filtered by Case, crossed every later Case's rows for an early Case (980,000 rows removed by filter per probe). With interleaved ids the same plan costs about 1 ms per probe, which is the audit's 4.9 s per batch. The cause is the same in both: a bare `ORDER BY id DESC` is `NULLS FIRST`, an order that `activity_case_id_id_idx (case_id, id DESC NULLS LAST)` cannot give, so the planner never used it. Adding `NULLS LAST` and computing the boundary once per Case is what fixed it; the batch is 43 ms of plan time in `EXPLAIN ANALYZE`.
- Recent activity is measured with the clock pinned to the seed's base time (`RecentFeedOpts.now`), because the seed's entries are all in the past; against the real clock the first window is empty and the page widens to the unbounded query, as it should.
- A search that matches a Proposal's patch on its own (`entity 1`, `synthetic summary`) was 30 ms and is now 40 to 50 ms: the matching Entity ids are now collected up front, once, where the old `EXISTS` stopped at the first hit. The worst case is what the change bounds.

## Related

- [`local-dev.md`](local-dev.md): the stack, test databases, tuning.
- [`../contributing/testing/standards.md`](../contributing/testing/standards.md#query-count-budgets-and-plan-assertions): the test helpers that keep a measured fix from regressing.
