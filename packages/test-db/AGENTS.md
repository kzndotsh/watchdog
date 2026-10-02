# Test DB (`@watchdog/test-db`)

> Scope: `packages/test-db` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

Dev-only Postgres harness and `seed*` fixtures for integration tests. Split out of `@watchdog/test-kit`, which is now dependency-free. Never import from production code.

## Commands

| Task | Command |
| --- | --- |
| Typecheck | `pnpm --filter @watchdog/test-db typecheck` |
| Integration (`withTestTx` / `resetTestDb`) | `just test-db` then `pnpm test:integration` |

## Entrypoint

| Import | Purpose |
| --- | --- |
| `@watchdog/test-db` | `testDb`, `resetTestDb`, `resetE2eDb`, `withTestTx`, `seed*` |

## Boundaries

| Do | Don't |
| --- | --- |
| `seed*` via real repos (exceptions: `seedAuthUser` writes `auth.user` directly and `seedEntityBlankDisplayName` inserts a legacy row on purpose); use `build*` (`@watchdog/schemas/testing`) for in-memory values | Raw SQL seeds that hide repo contract breaks |
| `withTestTx` when the code under test takes `tx` (truncates, then always rolls back `fn`) | Assume service-level `db.transaction()` sees an uncommitted test tx |
| `resetTestDb()` for Accept / job / race tests that must COMMIT | Truncate `auth.*` or drizzle migration tables from integration tests |
| `resetE2eDb()` from Playwright only (`e2e/support/db-reset`) — wipes `public` + `auth`, including seeded users | Call `resetE2eDb` from `*.int.test.ts`; integration tests use `resetTestDb()`, which keeps `auth.*` |
| Import `@watchdog/test-db` from integration tests and the e2e DB-reset support (`e2e/support/db-reset`) | Import it from unit/property tests (loads Postgres) |

## Gotchas

- `db` ↔ `test-db` is the one remaining dev-dependency cycle: `db`'s own integration tests use this harness, and the harness needs `db`. It is inherent to a DB harness; keep `db` from importing it outside tests.
- Seeds: `seedCase` / `seedEntity` / `seedEvidence` / `seedIdentifier` / `seedJob` / `seedProposal` / `seedGraphWrite` / `seedFindingSuppression` / `seedPlaybookRun` / `seedAuthUser` (auth.user display row; not a Graph repo). `seedJob` overrides include `playbookFanIndex` and `handoff`. Playbook tests seed step 0 (optionally one historical `blocked` row for the release shim) — do not seed a full blocked recipe.
- Ids come from `@watchdog/test-kit/fixtures` (`testId`, `TEST_ACTOR_ID`, `TEST_ORGANIZATION_ID`).

## See also / External References

| Need | File |
| --- | --- |
| Methodology | [`docs/contributing/testing/standards.md`](../../docs/contributing/testing/standards.md) |
| Commands / tiers | [`docs/contributing/testing/index.md`](../../docs/contributing/testing/index.md) |
| Dependency-free helpers | [`packages/test-kit/AGENTS.md`](../test-kit/AGENTS.md) |
