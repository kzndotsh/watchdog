# Test DB (`@watchdog/test-db`)

> Scope: `packages/test-db` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

Dev-only Postgres harness and `seed*` fixtures for integration tests (`@watchdog/test-db`: `testDb`, `resetTestDb`, `resetE2eDb`, `withTestTx`, `seed*`). Never import from production code.

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
| Import test-db from integration tests and the e2e reset support | Import it from unit/property tests (it loads Postgres) |

`TestDbLayer` / `testDbLayerOf(exec)` provide core's `Db` service over the test connection (or a `tx`, or a spy): pair with `runDomainWith(layer)(effect)` / `runAppWith`. test-db depends on `@watchdog/core/infra` for the tag, a dev-only cycle like `db`.

All guidance; nothing lints these. Ids come from `@watchdog/test-kit/fixtures` (`testId`, `TEST_ACTOR_ID`, `TEST_ORGANIZATION_ID`). `db` and `test-db` are a deliberate dev-dependency cycle (db's integration tests use the harness): keep `db` from importing it outside tests. Methodology: [`standards.md`](../../docs/contributing/testing/standards.md).
