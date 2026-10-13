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

A browser session was not run for this baseline. Steps 2 to 4 were run as one script calling core's own list and search functions through `Db.layer` (`listCasesEffect`, `listRecentActivityEffect`, then `listEntities`, `listIdentifiers`, `listEdges`, `listEvidence`, `listProposals`, `listJobs`, `listTasks` and the Case's `listRecentActivityEffect` for `perf-case-1`, then `searchCaseEffect` for ten terms), against the full seed on a fresh `postgres:18-alpine` container with the dev flags above, after `pg_stat_statements_reset()`. Nothing is measured for steps 5 and 6, the web server, auth, or network. One run; treat the figures as the order of magnitude.

| Step | Call | Wall time |
| --- | --- | --- |
| Dashboard | list Cases | 45 ms |
| Dashboard | Recent activity (org feed) | 1,341 ms |
| Open Case | Entities / Identifiers / Edges / Evidence | 7 / 27 / 10 / 9 ms |
| Open Case | Proposals / Jobs / Tasks | 28 / 23 / 6 ms |
| Open Case | the Case's activity | 109 ms |
| Search | 10 terms, per term | 42 ms to 9,254 ms (two terms under 100 ms, eight between 5.4 s and 9.3 s) |

Top statements by `total_exec_time` (the ten searches ran each of two query shapes five times):

| Rank | Statement | Calls | Total | Mean | Blocks | Temp blocks written |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Case search over Jobs (`jobs` left join `playbook_runs`, `ilike` across capability, summary, error, status and playbook columns), long form | 5 | 35,996 ms | 7,199 ms | 2,016,163 | 0 |
| 2 | the same, short form | 5 | 23,054 ms | 4,611 ms | 1,211,703 | 0 |
| 3 | Recent activity (`activity` joined to `cases`, `row_number()` per `group_id`) | 1 | 1,316 ms | 1,316 ms | 19,948 | 17,819 |
| 4 | Case search over pending Proposals (`proposals` left join `jobs`, `playbook_runs`) | 5 | 602 ms | 120 ms | 141,758 | 0 |
| 5 | the same, second form | 5 | 310 ms | 62 ms | 106,819 | 0 |
| 6 | Case search over Entities (`ilike` plus an `exists` over Edges and peer Entities) | 5 | 256 ms | 51 ms | 145,298 | 0 |
| 7 | the same, second form | 5 | 226 ms | 45 ms | 146,903 | 0 |

What it shows: search over Jobs touches about 403,000 buffer blocks per call (long form; about 242,000 for the short form) on a Case of 1,000 Jobs, and is most of the session's database time. The org feed writes 17,819 temp blocks even at `work_mem=16MB`, so it spills with the tuned setting. Entity and Proposal search touch roughly 21,000 to 29,000 blocks per call. Why each one reads that much is not diagnosed here: this is the baseline to move, and the backend audit's findings on search and Recent activity are the starting point.

## Related

- [`local-dev.md`](local-dev.md): the stack, test databases, tuning.
- [`../contributing/testing/standards.md`](../contributing/testing/standards.md#query-count-budgets-and-plan-assertions): the test helpers that keep a measured fix from regressing.
