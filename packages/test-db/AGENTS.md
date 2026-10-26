# Test DB (`@watchdog/test-db`)

> Scope: `packages/test-db` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

Dev-only Postgres harness and `seed*` fixtures for integration tests (`@watchdog/test-db`: `testDb`, `resetTestDb`, `resetE2eDb`, `withTestTx`, `withSystemTestTx`, `withSystemHistoryContext`, `seed*`, `backdateCaseDeletion`, `expectQueries`, `captureStatements`, `expectNoSeqScanOn`, `twoWriters`). Never import from production code.

## Commands

| Task | Command |
| --- | --- |
| Typecheck | `pnpm --filter @watchdog/test-db typecheck` |
| Integration (`withTestTx` / `resetTestDb`) | `just test-db` then `pnpm test:integration` |

## Rules

| Do | Don't |
| --- | --- |
| Seed through real repos (`seed*`); exceptions are `seedAuthUser` (writes `auth.user` directly) and `seedEntityBlankDisplayName` (a legacy row on purpose). Use `build*` from `@watchdog/schemas/testing` for in-memory values | Raw SQL seeds that hide repo contract breaks |
| `withTestTx` when the code under test takes `tx` (truncates, then always rolls back) | Assume a service-level `db.transaction()` sees an uncommitted test tx |
| `resetTestDb()` for Accept / job / race tests that must COMMIT; it keeps `auth.*` | Truncate `auth.*` or drizzle migration tables from integration tests |
| `resetE2eDb()` from Playwright only (`e2e/support/db-reset`); it wipes `public` + `auth` | Call `resetE2eDb` from `*.int.test.ts` |
| A direct Graph write (a seed, or a repo call in a repository-level test) goes through `withSystemHistoryContext(exec, fn)` (a transaction or savepoint with the explicit `system` context, restored after) or, for a whole test body, `withSystemTestTx`; the `seed*` helpers do it themselves | Set a default context in `withTestTx` or `resetTestDb`, or wrap a core write path that sets its own context: the app role is refused a Graph write with no context (#352), so a core path that forgets `setHistoryContextEffect` must fail its own test |
| `expectQueries(n, fn)` / `expectNoSeqScanOn(statements, table)` for a hot path's statement count and index use ([standards](../../docs/contributing/testing/standards.md#query-count-budgets-and-plan-assertions)); they hook the shared postgres.js client (`options.debug`), one capture at a time | `EXPLAIN ANALYZE` or any EXPLAIN of a write; asserting timings or row estimates (the one exception: `openPlanDb(...).analyze` on a private perf seed, asserting rows read, never times; [standards](../../docs/contributing/testing/standards.md#query-count-budgets-and-plan-assertions)) |
| `twoWriters({ pauseAt })` for a transition that must hold under READ COMMITTED: `pauseAfter` / `pauseBefore` wrap a repo method (or call `reach` in code you own), `run({ a, b })` parks A there, lets B finish or block on a lock, then resumes A and returns both results and `bBlocked` | `rendezvous` plus a spy that runs the rival write, or any sleep, to guess the interleaving |
| `listAllActivity()` to count or compare `activity` entries in a test | `activityLogRepo.drain`: it is commit-safe, so it withholds rows behind any open transaction of the cluster (#276) |
| Import test-db from integration tests and the e2e reset support | Import it from unit/property tests (it loads Postgres) |

For core's `Db` service use `Db.layer` (the same pool as `testDb`, borrowed: nothing ends it) or `Db.layerOf(exec)` (a `tx` or a spy) from `@watchdog/core/infra`, paired with `runDomainWith(layer)(effect)` / `runAppWith`. test-db does not depend on core: the helpers live on the service so the two packages stay acyclic.

All guidance; nothing lints these. Ids come from `@watchdog/test-kit/fixtures` (`testId`, `TEST_ACTOR_ID`) and `@watchdog/schemas/testing` (`TEST_ORGANIZATION_ID`, `testCaseId`). `db` and `test-db` are a deliberate dev-dependency cycle (db's integration tests use the harness): keep `db` from importing it outside tests. Methodology: [`standards.md`](../../docs/contributing/testing/standards.md).
