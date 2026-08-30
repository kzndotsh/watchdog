# Testing standards

How to write tests in this repo so they catch regressions instead of existing to pass.

Tiers, commands, and file layout: [`TESTING.md`](TESTING.md).

## AAA, one behavior

Arrange / Act / Assert. One behavior per `it`. Names read as specs: `"rejects X when Y"`, not `"test1"`.

`describe("<exported subject>", …)` names the function, module, or component as exported. `it("<verb-s> <object> when <condition>", …)` does not repeat that subject. Race tests live in a nested `describe("concurrency")`. Always pair `describe` + `it` — never a bare `test()`.

## Contracts, not implementation

Assert on outputs, persisted state, and caller-visible side effects. Do not assert "function X was called" unless the _contract_ is that a call happens (e.g. `notifyEvent` after commit). Prefer public contracts (module exports, API JSON, CLI JSON) over internal sequences.

## File suffixes

Co-located sibling `__tests__/` next to source. One suffix per file.

| Suffix | Tier |
| --- | --- |
| `*.test.ts` | Unit (pure, zero IO). Under `apps/web/` these files still run in the **component** (jsdom) project — `pnpm test:component`, not `pnpm test:unit`. |
| `*.property.test.ts` | fast-check |
| `*.int.test.ts` | Postgres via `withTestTx` / `resetTestDb` |
| `*.component.test.tsx` | jsdom + Testing Library |
| `*.spec.ts` | Playwright only, under top-level `e2e/` |

## Helpers (`@watchdog/test-kit`)

| Prefix / name | Meaning |
| --- | --- |
| `build*` | Pure in-memory value |
| `seed*` | Persist via real repos (`seedCase`, `seedGraphWrite`, `seedFindingSuppression`, `seedPlaybookRun`, …) |
| `testId(seed)` | `testId(1)` → `11111111-1111-4111-8111-000000000001` |
| `withTestTx(fn)` | Always-rollback transaction |
| `resetTestDb()` | `TRUNCATE` public tables (tests that must COMMIT) |
| `expect*` | Assert inside an existing `it` |
| `it<Behavior>(…)` | Factory that calls `it()` (`itRejectsIncompleteReport`, `itRunsCollectCap`) |
| `createCapRunHarness` | Fake `CapContext` (upload / credentials) for Cap `run()` |
| `mockServer` / `mockJson` / `http` | MSW via `@watchdog/test-kit/http` |

Cap-specific vendor fixtures stay inline in that Cap's test. Cross-cutting patch/ids live in test-kit.

Import `fc` from `@watchdog/test-kit/fc` (and `testId` from `@watchdog/test-kit/fixtures`) in unit/property tests so they do not load Postgres. Integration: `@watchdog/test-kit/db` (`testDb`, seeds). Do not import `@watchdog/db` from `@watchdog/api` tests (api has no db dependency). Do not import `msw` from tools/caps tests.

Do not add tests for generated client JSON, `shared/ui/shadcn/`, ServerFn wrappers, live vendor HTTP, or a 4th–58th Collect `run()` copy. Assert behavior (rows, `DomainError` codes, CLI JSON) — not mocks of internals.

## Anti-cheat

Banned: trivially-true assertions, parked `.skip`/`.todo` without a tracked follow-up, tests that only check "did not throw", expected values re-derived from the same logic as the source, snapshot-only tests with no semantic assertion, mocks that remove the behavior under test.

A test that cannot fail is not a test.

Custody-critical modules (`applyPatch`, Triage Accept, `validateIdentifierWrite`, `graph_writes`, patch gates): temporarily break the implementation once and confirm the test fails. Record that check in the PR, not as automation.

## Edge / defense checklist

Required for user/agent input and custody: empty/null/undefined, boundaries (min/max, empty string, huge string, unicode, case), duplicate/dedup, malformed-but-schema-valid, smuggled fields (`confidence` on agent patches), authorization/custody (`userOverride`, confirmed-without-evidence).

TX-guarded paths: fire two concurrent operations against the same row and assert only one wins.

No flaky-test tolerance: no `sleep()` or retry-until-green. Poll real completion (job status, DB row, resolved promise).

## Coverage

`pnpm test:coverage` is a reviewer signal, not a percentage gate to game.

## Adding a 3rd e2e flow

Only when a bug escapes that unit/integration/component tests structurally cannot catch (cross-page navigation state, real browser timing) — not for general coverage. Cap stays 2 until that bar is met.
