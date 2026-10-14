# Testing standards

How to write tests in this repo so they catch regressions instead of existing to pass.

Tiers, what each command runs and file layout: [`index.md`](index.md). What each tier may touch (small, medium, large): [ADR-0006](../../adr/0006-test-tiers-and-sizes.md).

**Enforcement:** unless a section says otherwise, this page is guidance enforced by review. Mechanically enforced: typechecked tests (`pnpm typecheck`, `check:test-coverage-guard`, `typecheck-contract.gate.test.ts`), the gate meta-test, and the shared-worker restore rule through the leak canary ([below](#test-speed-shared-workers)). The `describe`/`it`/`test` naming rules below are `guidance`: `oxlint.config.ts` has no rule for them.

## AAA, one behavior

Arrange / Act / Assert. One behavior per `it`. Names read as specs: `"rejects X when Y"`, not `"test1"`.

`describe("<exported subject>", …)` names the function, module, or component as exported. `it("<verb-s> <object> when <condition>", …)` does not repeat that subject. Race tests live in a nested `describe("concurrency")`. Always pair `describe` + `it`: never a bare `test()`.

## Contracts, not implementation

Assert on outputs, persisted state, and caller-visible side effects. Do not assert "function X was called" unless the _contract_ is that a call happens (e.g. an activity entry appended in the same transaction as the write). Prefer public contracts (module exports, API JSON, CLI JSON) over internal sequences.

## File suffixes

Co-located sibling `__tests__/` next to source. One suffix per file.

| Suffix | Tier |
| --- | --- |
| `*.test.ts` | Unit: small, in-process, no database or spawned process. Under `packages/*`, `apps/worker` and `apps/cli` it runs in the `unit` project; under `apps/web` in `web-unit` (node), except the hook and DOM files listed as `webDomTestGlobs` in `vitest.config.ts`, which run in `component`. `pnpm test:unit` runs `unit` and `web-unit`. |
| `*.property.test.ts` | fast-check |
| `*.gate.test.ts` | Medium: a gate script run as a CLI, or oxlint run over a fixture, in a temp git repo (`scripts/__tests__/`), named after the script; needs a must-fail test (enforced by `gate-coverage.gate.test.ts`). Never writes into the working tree |
| `*.int.test.ts` | Postgres via `withTestTx` / `resetTestDb` |
| `*.component.test.tsx` | Small: happy-dom + Testing Library (`component` project) |
| `*.spec.ts` | Playwright only, under `e2e/specs/` |

## Helpers (`@watchdog/test-kit`, `@watchdog/test-db`, `@watchdog/schemas/testing`, `packages/caps/src/testing`)

| Prefix / name | Meaning |
| --- | --- |
| `build*` | Pure in-memory value (`@watchdog/schemas/testing`) |
| `seed*` | Persist via real repos, from `@watchdog/test-db` (`seedCase`, `seedGraphWrite`, `seedFindingSuppression`, `seedPlaybookRun`, …) |
| `testId(seed)` | From `@watchdog/test-kit`: `testId(1)` → `11111111-1111-4111-8111-000000000001` |
| `withTestTx(fn)` | Always-rollback transaction |
| `resetTestDb()` | `TRUNCATE` public tables (tests that must COMMIT); keeps `auth.*` |
| `expectQueries` / `captureStatements` / `expectNoSeqScanOn` | Statement-count budget and `EXPLAIN` assertions ([below](#query-count-budgets-and-plan-assertions)) |
| `resetE2eDb()` | Playwright only: `TRUNCATE` public + `auth` so each signup bootstraps an org |
| `expect*` | Assert inside an existing `it` (Cap helpers in `packages/caps/src/testing`) |
| `it<Behavior>(…)` | Factory that calls `it()` (`itRejectsIncompleteReport`, `itRunsCollectCap`; `packages/caps/src/testing`) |
| `createCapRunHarness` | Fake `CapContext` (upload / credentials) for Cap `run()` |
| `mockServer` / `mockJson` / `http` | MSW via `@watchdog/test-kit/http` |

Cap-specific vendor fixtures stay inline in that Cap's test. Cross-cutting ids/URLs live in test-kit; helpers that need a workspace package live with it (see above).

Import `fc` from `@watchdog/test-kit/fc` (and `testId` from `@watchdog/test-kit/fixtures`) in unit/property tests so they do not load Postgres. Integration: `@watchdog/test-db` (`testDb`, seeds). Do not import `@watchdog/db` from `@watchdog/api` tests (api has no db dependency). Do not import `msw` from tools/caps tests.

Do not add tests for generated client JSON, `packages/ui` (generated primitives), ServerFn wrappers, live vendor HTTP, or a 4th-58th Collect `run()` copy. Assert behavior (rows, error codes, CLI JSON): not mocks of internals.

## Query-count budgets and plan assertions

Two integration-test assertions keep a data-path change from regressing quietly: how many SQL statements a code path runs, and which plan Postgres picks. Both live in `@watchdog/test-db` and see every statement on the shared test connection, so they work through core's `tryDb` / `tryDbWith` without changing the code under test.

| Helper | Use |
| --- | --- |
| `expectQueries(n, fn)` / `expectQueries({ max }, fn)` | Runs `fn`, fails unless it ran exactly `n` statements (or at most `max`), and returns its result. The failure message lists the SQL. BEGIN / COMMIT / SAVEPOINT are not counted |
| `captureStatements(fn)` | Returns `{ result, statements }` (`{ sql, params }` each) when you need to look at the SQL or feed it to a plan assertion |
| `expectNoSeqScanOn(statements, table)` | For each captured SELECT / WITH that reads `table`, runs `EXPLAIN` and fails on a `Seq Scan` of it. Fails too when no statement read the table, so a rename cannot pass vacuously |
| `explainPlan(statement)` / `expectNoSeqScan(plan, table)` | The parts of the above, for another plan property |

Rules:

- **Budget the shape, not today's number.** Assert a count that does not grow with the data: seed 5 rows, not 1, and expect the same count (an N+1 shows up as 1 + N). Write the count you measured and a one-line comment naming the statements, so a later change that adds a query has to say why.
- **Plans use `EXPLAIN` only, never `ANALYZE`.** `ANALYZE` executes the statement; the helper refuses anything but a plain SELECT / WITH (no data-modifying CTE, `INTO`, `FOR UPDATE` or second statement) and never runs one, so a write is never run by a plan assertion. Table names given to `expectNoSeqScanOn` must be plain identifiers. Row counts and timings are not asserted: they are not stable in CI.
- **A test database is tiny, so the planner prefers a Seq Scan even with an index.** `explainPlan` therefore sets `enable_seqscan = off` for the explain only: a remaining `Seq Scan` then means no usable index, which is the property worth asserting. Pass `{ seqScan: "planner" }` to see the planner's own choice.
- **One capture at a time, and `await` everything.** The hook is global to the test client (nested captures throw); work the path starts and does not await is counted late or not at all.
- **Budget hot paths and findings, not everything.** A Case-scoped list, an Accept, a feed. Large-data plan checks (an external sort, a seq scan only at scale) need the synthetic dataset instead: [`perf-baseline`](../../how-to/perf-baseline.md).

The worked example is `packages/core/src/evidence/__tests__/evidence-list-queries.int.test.ts`, the Case-scoped Evidence list:

```ts
it("runs a fixed number of statements however many rows it returns", async () => {
  const caseId = await seedCaseWithEvidence(5); // UUID actor with an auth.user row
  // The Case guard, one Evidence read and one actor-name lookup: nothing per row.
  const rows = await expectQueries(3, () => list(caseId));
  expect(rows).toHaveLength(5);
});

it("reads Evidence and the Case guard through indexes", async () => {
  const caseId = await seedCaseWithEvidence(1);
  const { statements } = await captureStatements(() => list(caseId));
  await expectNoSeqScanOn(statements, "evidence");
  await expectNoSeqScanOn(statements, "cases");
});
```

Dropping `evidence_case_id_idx` from the test database fails the second test with `Seq Scan on "evidence" (an index should serve this query)`. The helpers' own tests are `packages/test-db/src/db/__tests__/query-shape.test.ts` (pure, unit) and `query-count.int.test.ts` (against Postgres).

## Anti-cheat

Banned: trivially-true assertions, parked `.skip`/`.todo` without a tracked follow-up, tests that only check "did not throw", expected values re-derived from the same logic as the source, snapshot-only tests with no semantic assertion, mocks that remove the behavior under test.

A test that cannot fail is not a test.

Custody-critical modules (`applyPatch`, Triage Accept, `validateIdentifierWrite`, `graph_writes`, patch gates): temporarily break the implementation once and confirm the test fails. Record that check in the PR, not as automation.

## Edge / defense checklist

Required for user/agent input and custody: empty/null/undefined, boundaries (min/max, empty string, huge string, unicode, case), duplicate/dedup, malformed-but-schema-valid, smuggled fields (`confidence` on agent patches), authorization/custody (`userOverride`, confirmed-without-evidence).

TX-guarded paths: fire two concurrent operations against the same row and assert only one wins.

No flaky-test tolerance: no `sleep()` or retry-until-green. Poll real completion (job status, DB row, resolved promise). A flake that happens anyway follows the [flake policy](flaky-tests.md). This is guidance, not a gate: the suite still holds dozens of real timer waits (the activity tailer, consumer and retention integration tests assert that nothing arrived, which needs a clock; a few unit tests wait 15 to 100 ms). Do not add one; replace one with fake timers, `rendezvous` or polling when you touch the file.

## Coverage

`pnpm test:coverage` is a reviewer signal, not a percentage gate to game. CI uploads `coverage/lcov.info` to Codecov (informational status only).

## E2E layout

Playwright specs live under `e2e/specs/` grouped by product area (`auth/`, `cases/`, `collect/`, `triage/`, `custody/`, `journeys/`, `navigation/`). Shared harness only:

| Layer | Path | Role |
| --- | --- | --- |
| Support | `e2e/support/` | env, globalSetup (env seed), hydration, db-reset, route smoke table, `request-counts` (records auth and organization-state requests) |
| API | `e2e/api/` | typed `/api/v1` client + response parsers |
| Fixtures | `e2e/fixtures/` | `test.extend`: auto `_resetDb`, `api`, `authenticatedCase`, page fixtures |
| Pages | `e2e/pages/` | role-based page objects (actions only; assert in specs) |

Two readiness flags on `<html>`: `data-hydrated` (root providers mounted, set in `providers.tsx`) and `data-page-hydrated` (the route's `Page` frame committed, set by `Page` and cleared when it unmounts). Providers mount before the lazy route, so `data-hydrated` alone leaves route content as server markup with no React props, and a click on it is dropped (no request, no Job). `BasePage.goto` waits for both (`waitForPageHydrated`); auth routes have no `Page` and use `waitForHydrated`. `clickHydrated` stays as the per-element guard for content under nested lazy or Suspense boundaries (it polls for React's `__reactProps*` key). A hydration mismatch (`Hydration failed`) regenerates the tree and drops early clicks for users too, so treat it as a product bug, not a test wait. Await the outcome through the API (`waitForPendingProposal` names the case's Jobs on timeout) rather than a bare count poll.

The route guard's request budget is a smoke spec (`navigation/gate-requests.spec.ts`): a tour of sidebar links (hover, then click) on a warm session records every `/api/auth/*` request and every `getOrganizationStateFn` server function call (found in `vite dev` by decoding the base64url id after `/_serverFn/`; a production build hashes it, so only the auth endpoints would count) and allows one session refresh per elapsed 60 s (`STALE_SESSION`), so a normal run allows none. Settings and Cases are left out of the tour because they read Better Auth data of their own.

One behavior per spec file. Prefer `expect.poll` over sleeps. Seed graph state through the API client when UI setup is not the behavior under test. Custody gates belong in `custody/` or `triage/`, not mixed into journey specs.

Parser unit tests for the harness stay in `e2e/**/*.test.ts` (Vitest `e2e-parser` project).

Each Playwright test runs after the automatic `_resetDb` fixture (`resetE2eDb()`, cookies cleared), so every signup is a first-user bootstrap. Tag specs with `@smoke`, `@custody`, or `@journey`; import `test` and `expect` from `e2e/fixtures/test.ts`.

## Adding an e2e spec

Add when the behavior crosses pages, real browser timing, or auth/session chrome that unit/integration/component tests cannot structurally cover. Put the spec in the matching `e2e/specs/<area>/` folder, reuse fixtures and page objects, and assert on persisted/API-visible outcomes: not mock internals.

## Lint rule tests

A custom oxlint rule (`scripts/oxlint-plugin/`) is tested like a gate: `scripts/__tests__/oxlint-<rule>.gate.test.ts` writes fixture files into a throwaway repo with `oxlintFixtureFactory` (`scripts/__tests__/helpers/oxlint-fixture.ts`), runs the real oxlint against the real `oxlint.config.ts`, and asserts the rule id, message and line, never the rule's internals. A rule that crashes fails the harness instead of passing vacuously. The recipe for a new rule, including its shrink-only baseline test, is in [conventions](../../reference/platform/conventions.md#adding-a-lint-rule).

## Tests are typechecked

Vitest strips types, and every package's main `tsconfig.json` excludes its tests, so a test could drift from the types it exercises and stay green. Tests are therefore typechecked, as part of the normal `pnpm typecheck` (blocking in pre-push and CI), through a separate config per package or app. That config is the one program per package: it includes source and tests together, so source is not checked a second time against the stricter `tsconfig.json`.

- **One config per package or app with tests:** `tsconfig.test.json` extends the package's `tsconfig.json`, includes source plus tests (and `scripts/` where tests live there), and turns on `allowImportingTsExtensions` with `noEmit`. Compiler options come from the source config, which in turn extends the root `tsconfig.base.json`; never copy them. The main config keeps excluding tests so build output and declarations are unaffected.
- **Run it:** `pnpm typecheck` covers everything: each package's `typecheck` script runs `tsc -p tsconfig.test.json --incremental --tsBuildInfoFile node_modules/.cache/typecheck.tsbuildinfo` once (apps/web, test-db, test-kit and ui have no separate test config in play: their main config is the program), and the root script runs the packages unordered and in parallel, in parallel with `scripts/tsconfig.test.json` and `e2e/tsconfig.test.json`, which have no package. Production code importing test-only code or a `.ts` path, which the stricter `tsconfig.json` pass used to reject, is caught by the lint rules `watchdog/no-test-imports-in-production` and `watchdog/no-ts-extension-import`. The e2e config includes all e2e TypeScript (specs, pages, fixtures, support, api), not just the `*.test.ts` parser tests. For one package: `pnpm --filter <pkg> typecheck`. A new package with tests gets a `tsconfig.test.json` and a single `tsc -p tsconfig.test.json --incremental ...` call; `scripts/__tests__/typecheck-contract.gate.test.ts` fails if it does not.
- **Coverage guard:** `pnpm check:test-coverage-guard` fails when a test file vitest discovers, or a Playwright spec listed by `playwright test --list` (so `playwright.config.ts` `testDir`/`testMatch` is the source), is not included by any `tsconfig.test.json`. Adding a test directory or a vitest project means adding its path to the owning config's `include`.
- **Fix drift in the test, not the type system.** When a test fails the typecheck, change its input to the current type. Never cast (`as`, `as unknown as`) or add `@ts-expect-error` / `@ts-ignore` to silence it. A test that asserts a removed value (a dropped enum member, a deleted field) is rewritten against a valid value, or deleted if the behavior no longer exists. If a fix needs a cast, say so in the change description so a maintainer can decide whether the test or the type is wrong. This is guidance, not a gate: the existing tests still hold about 250 such casts (76 `as unknown as`, 172 `as never`, counted 2026-10-14). Do not add one; remove those in a file you touch, using the `untrusted*` helpers where a test needs deliberately invalid input.

## Test speed: shared workers

Every Vitest project (unit, web-unit, property, component, integration) runs with `isolate: false` plus `vitest.reset-modules.ts`. A fresh worker per file re-evaluated `effect`, `drizzle`, and `postgres` for each file, and that import work dominated the run. Without isolation those load once per worker, and the setup file clears the module registry before every file, so `vi.mock` still applies to our own modules.

What this means when writing tests:

- **Restore what you change.** `process.env`, `globalThis`, fake timers, `window` / DOM, and module-level state outside the module registry are shared by the files that run in the same worker. Set and restore them in `beforeEach` / `afterEach` (`vi.useFakeTimers` + `vi.useRealTimers`). `vi.stubGlobal` and `vi.stubEnv` are undone after every test by `unstubGlobals` / `unstubEnvs` in `vitest.config.ts` (a leaked `fetch` stub once made msw-backed suites fail depending on file order); a direct assignment such as `globalThis.fetch = ...` or `process.env.X = ...` is not undone, so restore it yourself.
- **The leak canary fails the file that leaks.** `vitest.leak-canary.ts` is the last setup file of every `isolate: false` project. It snapshots the shared globals (`globalThis`, `console`, `Math`, `Date`, `document`, `history`, `navigator`, `location`, the DOM prototypes, `process.env`, fake timers) before a file's imports run and compares them after its last test, so a spy on `document.querySelector` that is never restored, `globalThis.fetch = ...`, a module-scope `Object.defineProperty(window, ...)` (including a getter defined over a plain property), a `process.env.X = ...` or `vi.useFakeTimers()` with no `useRealTimers` fails that file with the property named. It does not depend on file order, which is why it replaces waiting for a shuffled run to trip over the leak. Browser APIs happy-dom lacks (`getAnimations`, `scrollIntoView`) are set once in `apps/web/src/test-setup.ts`, never on the prototype from a test. A name that a library registers by itself on first import goes in the canary's tooling list with a reason; a test's own global never does. A leak the canary cannot see (a module-level store a test mutates) still shows up as an order-dependent failure.
- **A leak that slips through shows up as an order-dependent failure.** Reproduce with `pnpm exec vitest run --project <name> --sequence.shuffle.files`, then fix the test's cleanup; do not turn isolation back on for the project.
- **Tests that spawn processes need their own timeout.** `oxlint-wrapper-lint-coverage.gate.test.ts` runs oxlint and sets `LINT_TIMEOUT_MS` (60s), because the default 5s is easy to exceed when the whole suite saturates the CPU.
