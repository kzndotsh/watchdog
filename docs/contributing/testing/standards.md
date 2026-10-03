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
| `*.test.ts` | Unit (pure, zero IO). Under `apps/web/` these files still run in the **component** (happy-dom) project: `pnpm test:component`, not `pnpm test:unit`. |
| `*.property.test.ts` | fast-check |
| `*.gate.test.ts` | Gate script run as a CLI against a temp git repo (`scripts/__tests__/`), named after the script; needs a must-fail test (enforced by `gate-coverage.gate.test.ts`) |
| `*.int.test.ts` | Postgres via `withTestTx` / `resetTestDb` |
| `*.component.test.tsx` | happy-dom + Testing Library |
| `*.spec.ts` | Playwright only, under `e2e/specs/` |

## Helpers (`@watchdog/test-kit`, `@watchdog/test-db`, `@watchdog/schemas/testing`, `packages/caps/src/testing`)

| Prefix / name | Meaning |
| --- | --- |
| `build*` | Pure in-memory value (`@watchdog/schemas/testing`) |
| `seed*` | Persist via real repos, from `@watchdog/test-db` (`seedCase`, `seedGraphWrite`, `seedFindingSuppression`, `seedPlaybookRun`, …) |
| `testId(seed)` | From `@watchdog/test-kit`: `testId(1)` → `11111111-1111-4111-8111-000000000001` |
| `withTestTx(fn)` | Always-rollback transaction |
| `resetTestDb()` | `TRUNCATE` public tables (tests that must COMMIT); keeps `auth.*` |
| `resetE2eDb()` | Playwright only: `TRUNCATE` public + `auth` so each signup bootstraps an org |
| `expect*` | Assert inside an existing `it` (Cap helpers in `packages/caps/src/testing`) |
| `it<Behavior>(…)` | Factory that calls `it()` (`itRejectsIncompleteReport`, `itRunsCollectCap`; `packages/caps/src/testing`) |
| `createCapRunHarness` | Fake `CapContext` (upload / credentials) for Cap `run()` |
| `mockServer` / `mockJson` / `http` | MSW via `@watchdog/test-kit/http` |

Cap-specific vendor fixtures stay inline in that Cap's test. Cross-cutting ids/URLs live in test-kit; helpers that need a workspace package live with it (see above).

Import `fc` from `@watchdog/test-kit/fc` (and `testId` from `@watchdog/test-kit/fixtures`) in unit/property tests so they do not load Postgres. Integration: `@watchdog/test-db` (`testDb`, seeds). Do not import `@watchdog/db` from `@watchdog/api` tests (api has no db dependency). Do not import `msw` from tools/caps tests.

Do not add tests for generated client JSON, `packages/ui` (generated primitives), ServerFn wrappers, live vendor HTTP, or a 4th-58th Collect `run()` copy. Assert behavior (rows, `DomainError` codes, CLI JSON): not mocks of internals.

## Anti-cheat

Banned: trivially-true assertions, parked `.skip`/`.todo` without a tracked follow-up, tests that only check "did not throw", expected values re-derived from the same logic as the source, snapshot-only tests with no semantic assertion, mocks that remove the behavior under test.

A test that cannot fail is not a test.

Custody-critical modules (`applyPatch`, Triage Accept, `validateIdentifierWrite`, `graph_writes`, patch gates): temporarily break the implementation once and confirm the test fails. Record that check in the PR, not as automation.

## Edge / defense checklist

Required for user/agent input and custody: empty/null/undefined, boundaries (min/max, empty string, huge string, unicode, case), duplicate/dedup, malformed-but-schema-valid, smuggled fields (`confidence` on agent patches), authorization/custody (`userOverride`, confirmed-without-evidence).

TX-guarded paths: fire two concurrent operations against the same row and assert only one wins.

No flaky-test tolerance: no `sleep()` or retry-until-green. Poll real completion (job status, DB row, resolved promise).

## Coverage

`pnpm test:coverage` is a reviewer signal, not a percentage gate to game. CI uploads `coverage/lcov.info` to Codecov (informational project/patch status only). `kzndotsh` does not require an upload token; the Unit job uses GitHub OIDC and optional `CODECOV_TOKEN` for Test Analytics.

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

Each Playwright test runs after an automatic `_resetDb` fixture that calls `resetE2eDb()` (public + `auth` on `watchdog_e2e`) and clears cookies — so every signup is a first-user bootstrap. Tag specs with `@smoke`, `@custody`, or `@journey`. Import `test` and `expect` from `e2e/fixtures/test.ts`. Run `pnpm test:e2e:smoke` for the fast gate; `pnpm exec vitest run --project e2e-parser` for harness-only unit tests.

## Adding an e2e spec

Add when the behavior crosses pages, real browser timing, or auth/session chrome that unit/integration/component tests cannot structurally cover. Put the spec in the matching `e2e/specs/<area>/` folder, reuse fixtures and page objects, and assert on persisted/API-visible outcomes: not mock internals.

## Tests are typechecked

Vitest strips types, and every package's main `tsconfig.json` excludes its tests, so a test could drift from the types it exercises and stay green. Tests are therefore typechecked, as part of the normal `pnpm typecheck` (blocking in pre-push and CI), through a separate config per package or app.

- **One config per package or app with tests:** `tsconfig.test.json` extends the package's `tsconfig.json`, includes source plus tests (and `scripts/` where tests live there), and turns on `allowImportingTsExtensions` with `noEmit`. Compiler options come from the source config; never copy them. The main config keeps excluding tests so build output and declarations are unaffected.
- **Run it:** `pnpm typecheck` covers everything: each package's `typecheck` script runs its source config and then `tsc -p tsconfig.test.json --noEmit` (apps/web, test-db and test-kit already include their tests in the main config, so they run once), and the root script adds `scripts/tsconfig.test.json` and `e2e/tsconfig.test.json`, which have no package. The e2e config includes all e2e TypeScript (specs, pages, fixtures, support, api), not just the `*.test.ts` parser tests. For one package: `pnpm --filter <pkg> typecheck`. A new package with tests gets a `tsconfig.test.json` and the second `tsc` call; `scripts/__tests__/typecheck-contract.gate.test.ts` fails if it does not.
- **Coverage guard:** `pnpm check:test-coverage-guard` fails when a test file vitest discovers, or a Playwright spec listed by `playwright test --list` (so `playwright.config.ts` `testDir`/`testMatch` is the source), is not included by any `tsconfig.test.json`. Adding a test directory or a vitest project means adding its path to the owning config's `include`.
- **Fix drift in the test, not the type system.** When a test fails the typecheck, change its input to the current type. Never cast (`as`, `as unknown as`) or add `@ts-expect-error` / `@ts-ignore` to silence it. A test that asserts a removed value (a dropped enum member, a deleted field) is rewritten against a valid value, or deleted if the behavior no longer exists. If a fix needs a cast, say so in the change description so a maintainer can decide whether the test or the type is wrong.

## Test speed: shared workers

Every Vitest project (unit, web-unit, property, component, integration) runs with `isolate: false` plus `vitest.reset-modules.ts`. A fresh worker per file re-evaluated `effect`, `drizzle`, and `postgres` for each file, and that import work was about 75% of the run (unit 41s, component 34s, integration 79s; now about 16s, 14s, 22s). Without isolation those load once per worker, and the setup file clears the module registry before every file, so `vi.mock` still applies to our own modules.

What this means when writing tests:

- **Restore what you change.** `process.env`, `globalThis`, fake timers, `window` / DOM, and module-level state outside the module registry are shared by the files that run in the same worker. Set and restore them in `beforeEach` / `afterEach` (`vi.stubEnv` + `vi.unstubAllEnvs`, `vi.useFakeTimers` + `vi.useRealTimers`).
- **A leak shows up as an order-dependent failure.** Reproduce with `pnpm exec vitest run --project <name> --sequence.shuffle.files`, then fix the test's cleanup; do not turn isolation back on for the project.
- **Tests that spawn processes need their own timeout.** `wrapper-lint-coverage.test.ts` runs oxlint and sets 60s, because the default 5s is easy to exceed when the whole suite saturates the CPU.
