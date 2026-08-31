# Testing standards

How to write tests in this repo so they catch regressions instead of existing to pass.

Tiers, commands, and file layout: [`TESTING.md`](index.md).

## AAA, one behavior

Arrange / Act / Assert. One behavior per `it`. Names read as specs: `"rejects X when Y"`, not `"test1"`.

`describe("<exported subject>", …)` names the function, module, or component as exported. `it("<verb-s> <object> when <condition>", …)` does not repeat that subject. Race tests live in a nested `describe("concurrency")`. Always pair `describe` + `it`: never a bare `test()`.

## Contracts, not implementation

Assert on outputs, persisted state, and caller-visible side effects. Do not assert "function X was called" unless the _contract_ is that a call happens (e.g. `notifyEvent` after commit). Prefer public contracts (module exports, API JSON, CLI JSON) over internal sequences.

## File suffixes

Co-located sibling `__tests__/` next to source. One suffix per file.

| Suffix | Tier |
| --- | --- |
| `*.test.ts` | Unit (pure, zero IO). Under `apps/web/` these files still run in the **component** (jsdom) project: `pnpm test:component`, not `pnpm test:unit`. |
| `*.property.test.ts` | fast-check |
| `*.int.test.ts` | Postgres via `withTestTx` / `resetTestDb` |
| `*.component.test.tsx` | jsdom + Testing Library |
| `*.spec.ts` | Playwright only, under `e2e/specs/` |

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

Do not add tests for generated client JSON, `shared/ui/shadcn/`, ServerFn wrappers, live vendor HTTP, or a 4th-58th Collect `run()` copy. Assert behavior (rows, `DomainError` codes, CLI JSON): not mocks of internals.

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

## E2E layout

Playwright specs live under `e2e/specs/` grouped by product area (`auth/`, `cases/`, `collect/`, `triage/`, `custody/`, `journeys/`, `navigation/`). Shared harness only:

| Layer | Path | Role |
| --- | --- | --- |
| Support | `e2e/support/` | env, globalSetup (env seed), hydration, db-reset, route smoke table |
| API | `e2e/api/` | typed `/api/v1` client + response parsers |
| Fixtures | `e2e/fixtures/` | `test.extend`: auto `_resetDb`, `api`, `authenticatedCase`, page fixtures |
| Pages | `e2e/pages/` | role-based page objects (actions only; assert in specs) |

One behavior per spec file. Prefer `expect.poll` over sleeps. Seed graph state through the API client when UI setup is not the behavior under test. Custody gates belong in `custody/` or `triage/`, not mixed into journey specs.

Parser unit tests for the harness stay in `e2e/**/*.test.ts` (Vitest `e2e-parser` project).

Each Playwright test runs after an automatic `_resetDb` fixture truncates `watchdog_e2e`. Tag specs with `@smoke`, `@custody`, or `@journey`. Import `test` and `expect` from `e2e/fixtures/test.ts`. Run `pnpm test:e2e:smoke` for the fast gate; `pnpm exec vitest run --project e2e-parser` for harness-only unit tests.

## Adding an e2e spec

Add when the behavior crosses pages, real browser timing, or auth/session chrome that unit/integration/component tests cannot structurally cover. Put the spec in the matching `e2e/specs/<area>/` folder, reuse fixtures and page objects, and assert on persisted/API-visible outcomes: not mock internals.
