# Testing kit (`@watchdog/test-kit`)

> Scope: `packages/test-kit` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

Dev-only fixtures, Postgres harness, MSW, and Cap `it*` factories. Never import from production code.

## Commands

| Task | Command |
| --- | --- |
| Typecheck | `pnpm --filter @watchdog/test-kit typecheck` |
| Unit / property (import `/fc` `/fixtures`) | `pnpm test:unit` · `pnpm test:property` |
| Integration (`withTestTx` / `resetTestDb`) | `just test-db` then `pnpm test:integration` |

## Entrypoints

| Import | Purpose |
| --- | --- |
| `@watchdog/test-kit` | `testId`, `TEST_ACTOR_ID`, `build*` patch fixtures |
| `@watchdog/test-kit/fc` | fast-check (unit/property only) |
| `@watchdog/test-kit/fixtures` | ids without Postgres |
| `@watchdog/test-kit/db` | `testDb`, `resetTestDb`, `withTestTx`, `seed*` |
| `@watchdog/test-kit/http` | `http`, `HttpResponse`, `mockServer`, `mockJson` |
| `@watchdog/test-kit/it` | `itRejectsIncompleteReport`, `itRunsCollectCap`, `createCapRunHarness` |

## Boundaries

| Do | Don’t |
| --- | --- |
| `build*` for in-memory values; `seed*` via real repos | Raw SQL seeds that hide repo contract breaks |
| `withTestTx` when the code under test takes `tx` (truncates, then always rolls back `fn`) | Assume service-level `db.transaction()` sees an uncommitted test tx |
| `resetTestDb()` for Accept / job / race tests that must COMMIT | Truncate `auth.*` or drizzle migration tables |
| `itRejectsIncompleteReport` for Cap interpret shape | Copy-paste the same reject body into 58 files |
| `itRunsCollectCap` for Collect `run()` (3 Caps max unless `run()` is not `defineCollectCap`) | One MSW `run()` file per vendor Cap |
| Import `@watchdog/test-kit/db` from integration tests | Import `/db` from unit/property tests |
| Import `@watchdog/test-kit/fc` from property tests | Pull `/db` (loads Postgres) into unit tests |
| Import MSW from `@watchdog/test-kit/http` | Import `msw` from tools/caps/web tests |

## Gotchas

- `testId(1)` is `11111111-1111-4111-8111-000000000001` — UUID-v4 shaped, greppable. `TEST_ACTOR_ID` is `"test-actor"`.
- Caps `interpret` tests stay `interpret.test.ts` (pure). `run.test.ts` is still **unit** (MSW / harness) — do not rename to `.int` unless it hits Postgres.
- Seeds: `seedCase` / `seedEntity` / `seedEvidence` / `seedIdentifier` / `seedJob` / `seedProposal` / `seedGraphWrite` / `seedFindingSuppression` / `seedPlaybookRun`. `seedJob` overrides include `playbookFanIndex` and `handoff`. Playbook tests seed step 0 (optionally one historical `blocked` row for the release shim) — do not seed a full blocked recipe.
- MSW: listen/reset/close in the test file (or `src/http/msw-setup.ts`).

## See also / External References

| Need | File |
| --- | --- |
| Methodology | [`docs/contributing/testing/standards.md`](../../docs/contributing/testing/standards.md) |
| Commands / tiers | [`docs/contributing/testing/index.md`](../../docs/contributing/testing/index.md) |
