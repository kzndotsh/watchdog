# Testing standards

How to write tests in this repo so they catch regressions instead of existing to pass.

Tiers, what each command runs and file layout: [`index.md`](index.md). What each tier may touch (small, medium, large): [ADR-0006](../../adr/0006-test-tiers-and-sizes.md).

**Enforcement:** unless a section says otherwise, this page is guidance enforced by review. Mechanically enforced: the three mock-policy baselines ([Mock policy](#mock-policy)), typechecked tests (`pnpm typecheck`, `check:test-coverage-guard`, `typecheck-contract.gate.test.ts`), the gate meta-test, and the shared-worker restore rule through the leak canary ([below](#test-speed-shared-workers)). The `describe`/`it`/`test` naming rules below are `guidance`: `oxlint.config.ts` has no rule for them.

## AAA, one behavior

Arrange / Act / Assert. One behavior per `it`. Names read as specs: `"rejects X when Y"`, not `"test1"`.

`describe("<exported subject>", …)` names the function, module, or component as exported. `it("<verb-s> <object> when <condition>", …)` does not repeat that subject. Race tests live in a nested `describe("concurrency")`. Always pair `describe` + `it`: never a bare `test()`.

## Contracts, not implementation

Assert on outputs, persisted state, and caller-visible side effects. Do not assert "function X was called" unless the _contract_ is that a call happens (e.g. an activity entry appended in the same transaction as the write). Prefer public contracts (module exports, API JSON, CLI JSON) over internal sequences.

## Mock policy

A mock replaces something the code under test talks to. It earns its place only when that thing is outside the code under test: slow, non-deterministic, paid, or owned by someone else. Everything else runs for real, so a refactor that breaks the wiring fails a test instead of leaving a green one that tests the mock.

**Mock these (boundaries):**

| Boundary | How | Example |
| --- | --- | --- |
| Network and vendor clients | MSW through `@watchdog/test-kit/http` (`mockServer`, `http`, `mockJson`); a vendor SDK is faked at its package edge | `packages/tools/src/http/__tests__/page-enrich.test.ts` |
| Database | A real Postgres through `@watchdog/test-db` in `*.int.test.ts`; in a unit test, the `Db` service layer (`Db.layerOf(spy)`) | `packages/core/src/cases/__tests__/cases-db-layer.int.test.ts` |
| Clock and timers | Effect `TestClock` in `it.effect`; `vi.useFakeTimers()` in a DOM test, restored in `afterEach` | `apps/worker/src/__tests__/cancel-poll.test.ts` |
| Framework seams | The router, `window`, `EventSource`, the toast and auth server modules, through the shared doubles below | `apps/web/src/testing/` |
| Server functions (`*.functions.ts`) in a web component or hook test | `vi.mock` of the one `*.functions` module: it is the network boundary of the web app | `apps/web/src/domains/dossier/components/__tests__/claims-section.component.test.tsx` |

**Do not mock these:**

- **An internal module the code under test owns** (a sibling `lib/`, a helper, a child component, `@/shared/lib/query-invalidation`). Call it. If it is slow or awkward to call, the design is the problem: move the seam to a real boundary or lift the test one tier.
- **A data-fetching hook** (`useQuery`, `useMutation`, `useSuspenseQuery`, a domain `use*` query hook). Render under a real `QueryClientProvider` (`createAppQueryClient()`) and fake only the `*.functions` call the query function makes. A faked hook cannot see a wrong key, a wrong invalidation or an optimistic-update bug.
- **A query key.** Import the key factory from the domain's `queries.ts` (`jobsKeys`, `casesKeys`, ...) and use it in the assertion. A key copied into a test or a mock factory stays green when the real key changes: that is the defect to avoid.
- **A custody or policy rule** (`@watchdog/policy`, `acceptGate`). Run the real rule; assert its outcome.

**Effect services:** prefer a test double built as a Layer (`Layer.succeed(Service, impl)`, `Db.layerOf(exec)`, `BlobStore` layers) over `vi.mock` of the module that exports the service. The layer is typed against the service interface, so a changed interface fails the typecheck instead of slipping through. Provide it with `runDomainWith(layer)(effect)` or `it.effect`.

**Budget and checks:**

- A test file that needs more than three module mocks should be split or lifted a tier.
- Assert what a user or caller sees (rendered text, persisted rows, a returned value). Assert a call on a mock only when the mock is a boundary and the call is the contract (the server function receives the form's values).
- Three lint rules hold the line, each with a shrink-only baseline in `scripts/oxlint-plugin/baselines/`: `watchdog/no-internal-module-mock` (a `vi.mock` / `vi.doMock` of a relative or `@/` module; `*.functions`, `@/auth/*` and `@/shared/ui/toast` are boundaries and stay legal), `watchdog/no-test-casts` (`as never`, `as unknown as T`) and `watchdog/no-test-sleep` (`setTimeout`, `sleep`, `delay`). A new violation fails `pnpm check`; fixing one makes its baseline entry stale until `node scripts/oxlint-baseline.mjs <rule>` lowers it. Never raise a count. An invalid-input test builds its value with an `untrusted*` helper; an absence check uses a fake clock, `TestClock` or `rendezvous`.
- Mocking a data-fetching hook or copying a query key into a mock has no lint rule yet (the hooks are package imports, so the internal-module rule cannot see them). It is reviewed by hand; the files that did it are converted as they are touched.

Before and after, for a component that lists claims:

```tsx
// Before: replaces the data library, so the test cannot see a wrong key or a missing invalidation.
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: claims, isPending: false }),
  useMutation: () => ({ mutateAsync: createClaimFn }),
}));

// After: a real QueryClient; only the network boundary is faked, and the key comes from the source.
vi.mock("@/domains/entities/claims/claims.functions", () => ({
  listClaimsFn: vi.fn(),
  createClaimFn: vi.fn(),
}));
const client = createAppQueryClient();
client.setQueryData(claimsKeys.all(caseId, entityId), claims);
render(
  <QueryClientProvider client={client}>
    <ClaimsSection entityId={entityId} />
  </QueryClientProvider>
);
```

Shared doubles for the repeated boilerplate (web): `authServerDouble` (registered for every web test by `apps/web/src/testing/mock-auth-server.setup.ts`, so a test does not mock `@/auth/server`), `toastModuleDouble` (the factory of `vi.mock("@/shared/ui/toast", ...)`, see its doc comment), and `buildEvidenceRecord` / `buildJobListRecord` / `buildJobRecord` / `buildProposalRecord` in `apps/web/src/testing/records.ts` instead of a local `evidence()` or `job()` factory.

## File suffixes

Co-located sibling `__tests__/` next to source. One suffix per file.

| Suffix | Tier |
| --- | --- |
| `*.test.ts` | Unit: small, in-process, no database or spawned process. Under `packages/*`, `apps/worker` and `apps/cli` it runs in the `unit` project; under `apps/web` in `web-unit` (node), except the hook and DOM files listed as `webDomTestGlobs` in `vitest.config.ts`, which run in `component`. `pnpm test:unit` runs `unit` and `web-unit`. |
| `*.property.test.ts` | fast-check |
| `*.gate.test.ts` | Medium: a gate script run as a CLI, or oxlint run over a fixture, in a temp git repo (`scripts/__tests__/`), named after the script; needs a must-fail test (enforced by `gate-coverage.gate.test.ts`). Never writes into the working tree |
| `*.int.test.ts` | Postgres via `withTestTx` / `resetTestDb` |
| `*.component.test.tsx` | Small: happy-dom + Testing Library (`component` project) |
| `*.compiled.test.tsx` | Small: as `*.component.test.tsx`, transformed by React Compiler (`component-compiled` project). Use it only when the bug needs the memoization; a stale cell or skipped re-render passes in `component` |
| `*.spec.ts` | Playwright only, under `e2e/specs/` |

## Helpers (`@watchdog/test-kit`, `@watchdog/test-db`, `@watchdog/schemas/testing`, `packages/caps/src/testing`)

| Prefix / name | Meaning |
| --- | --- |
| `build*` | Pure in-memory value (`@watchdog/schemas/testing`) |
| `seed*` | Persist via real repos, from `@watchdog/test-db` (`seedCase`, `seedGraphWrite`, `seedFindingSuppression`, `seedPlaybookRun`, …) |
| `testId(seed)` | From `@watchdog/test-kit`: `testId(1)` → `11111111-1111-4111-8111-000000000001` |
| `withTestTx(fn)` | Always-rollback transaction |
| `resetTestDb()` | `TRUNCATE` public tables (tests that must COMMIT); keeps `auth.*`. The integration project's `scripts/vitest/settle-export-writes.ts` waits after every test for detached Export writes, so a reset never deadlocks against their reads (#379); a test never needs its own wait |
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
- **One exception: the list plan gate on the perf seed** (`list-conformance-plans.int.test.ts`, ADR-0007). It runs `EXPLAIN (ANALYZE, BUFFERS)` through `openPlanDb(...).analyze`, which refuses the same statements, on a private `wd_perf_*` database only. It asserts the rows a plan read (`rowsReadOn`) under a derived ceiling, which is exact for the frozen seed and its plan, never a time or a planner estimate. The times it prints are a record; budgets in milliseconds are checked by hand in [`perf-baseline`](../../how-to/perf-baseline.md).
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

Dropping `evidence_case_captured_idx` from the test database fails the second test with `Seq Scan on "evidence" (an index should serve this query)`. The helpers' own tests are `packages/test-db/src/db/__tests__/query-shape.test.ts` (pure, unit) and `query-count.int.test.ts` (against Postgres).

## Anti-cheat

Banned: trivially-true assertions, parked `.skip`/`.todo` without a tracked follow-up, tests that only check "did not throw", expected values re-derived from the same logic as the source, snapshot-only tests with no semantic assertion, mocks that remove the behavior under test.

A test that cannot fail is not a test.

Custody-critical modules (`applyPatch`, Triage Accept, `validateIdentifierWrite`, `graph_writes`, patch gates): temporarily break the implementation once and confirm the test fails. Record that check in the PR, not as automation.

## Edge / defense checklist

Required for user/agent input and custody: empty/null/undefined, boundaries (min/max, empty string, huge string, unicode, case), duplicate/dedup, malformed-but-schema-valid, smuggled fields (`confidence` on agent patches), authorization/custody (`userOverride`, confirmed-without-evidence).

TX-guarded paths: run two writers against the same row with `twoWriters` (`@watchdog/test-db`): writer A parks at a named point, writer B runs (or blocks on A's lock), then A continues, so the interleaving is forced, not left to timing. Assert which writer lost, its error, and the rows and entries left. Read the activity log with `listAllActivity()` (the table), not `activityLogRepo.drain`, which withholds rows behind any open transaction of the cluster (#276).

No flaky-test tolerance: no `sleep()` or retry-until-green. Poll real completion (job status, DB row, resolved promise). A flake that happens anyway follows the [flake policy](flaky-tests.md). A new `setTimeout`, `sleep` or `delay` in a test fails `pnpm check` (`watchdog/no-test-sleep`, shrink-only baseline: 35 left in 15 files on 2026-10-14, mostly the activity tailer, consumer and retention integration tests, which assert that nothing arrived and so need a clock). Replace one with fake timers, `rendezvous` or polling when you touch the file.

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

The Case delete flow is an e2e (`cases/delete-case.spec.ts`: delete from the Cases list, the Restore toast, the Deleted Cases view, the deleted-Case URL screen) because it crosses the list, the toast, Settings and a Case URL; `CasesPage` carries its actions (`deleteCase`, `openDeletedCases`, `deletedRowFor`). Purge now and the scheduled purge are not browser specs: they erase object storage, so the integration tests (`packages/core/src/cases/__tests__/tombstone.int.test.ts`, with a fake `BlobStore`) and the component tests own them.

A declared list screen ([`lists.md`](../../reference/web/lists.md)) gets one smoke spec that drives its toolbar in a real browser and reloads to prove the view lives in the URL: `cases/identifiers-list.spec.ts` seeds Identifiers through the API (`createIdentifier`), filters by Type from the Filters popover, searches, and reloads; `IdentifiersPage` carries the toolbar actions (`filterByType`, `search`, `visibleValues`). `triage/triage-list.spec.ts` seeds Proposals (`createProposal`), opens Triage from the sidebar (the link carries `status=pending`), searches, and reloads (`TriagePage.search`, `queueRows`). Search, sort, paging and empty states are component tests, not e2e.

One behavior per spec file. Prefer `expect.poll` over sleeps. Seed graph state through the API client when UI setup is not the behavior under test. Custody gates belong in `custody/` or `triage/`, not mixed into journey specs.

Parser unit tests for the harness stay in `e2e/**/*.test.ts` (Vitest `e2e-parser` project, run by `pnpm test` and the unit-component CI job).

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
- **Fix drift in the test, not the type system.** When a test fails the typecheck, change its input to the current type. Never cast (`as`, `as unknown as`) or add `@ts-expect-error` / `@ts-ignore` to silence it. A test that asserts a removed value (a dropped enum member, a deleted field) is rewritten against a valid value, or deleted if the behavior no longer exists. If a fix needs a cast, say so in the change description so a maintainer can decide whether the test or the type is wrong. A new cast in a test fails `pnpm check` (`watchdog/no-test-casts`, shrink-only baseline: 231 left in 62 files on 2026-10-17). Remove those in a file you touch, using the `untrusted*` helpers where a test needs deliberately invalid input.

## Test speed: shared workers

Every Vitest project (unit, web-unit, property, component, integration) runs with `isolate: false` plus `scripts/vitest/reset-modules.ts`. A fresh worker per file re-evaluated `effect`, `drizzle`, and `postgres` for each file, and that import work dominated the run. Without isolation those load once per worker, and the setup file clears the module registry before every file, so `vi.mock` still applies to our own modules.

What this means when writing tests:

- **Restore what you change.** `process.env`, `globalThis`, fake timers, `window` / DOM, and module-level state outside the module registry are shared by the files that run in the same worker. Set and restore them in `beforeEach` / `afterEach` (`vi.useFakeTimers` + `vi.useRealTimers`). `vi.stubGlobal` and `vi.stubEnv` are undone after every test by `unstubGlobals` / `unstubEnvs` in `vitest.config.ts` (a leaked `fetch` stub once made msw-backed suites fail depending on file order); a direct assignment such as `globalThis.fetch = ...` or `process.env.X = ...` is not undone, so restore it yourself.
- **Tests never read `.env`.** `@watchdog/env` skips the repo `.env` under Vitest (`VITEST` is set), so a developer's `WD_*` values cannot change a result. A test that depends on a setting stubs it with `vi.stubEnv`; the default is what the schema says.
- **The leak canary fails the file that leaks.** `scripts/vitest/leak-canary.ts` is the last setup file of every `isolate: false` project. It snapshots the shared globals (`globalThis`, `console`, `Math`, `Date`, `document`, `history`, `navigator`, `location`, the DOM prototypes, `process.env`, fake timers) before a file's imports run and compares them after its last test, so a spy on `document.querySelector` that is never restored, `globalThis.fetch = ...`, a module-scope `Object.defineProperty(window, ...)` (including a getter defined over a plain property), a `process.env.X = ...` or `vi.useFakeTimers()` with no `useRealTimers` fails that file with the property named. It does not depend on file order, which is why it replaces waiting for a shuffled run to trip over the leak. Browser APIs happy-dom lacks (`getAnimations`, `scrollIntoView`) are set once in `apps/web/src/test-setup.ts`, never on the prototype from a test. A name that a library registers by itself on first import goes in the canary's tooling list with a reason; a test's own global never does. A leak the canary cannot see (a module-level store a test mutates) still shows up as an order-dependent failure.
- **Mock history is cleared before every test** (`clearMocks: true` in each project the nightly shuffle runs; integration keeps the old default). A `vi.fn()` call count therefore starts at zero in each test, repeat and shuffled order. A suite that asserts a call made at import time (a script entry, a module that registers or initializes on import) must re-run that import per test: `vi.resetModules()` in `beforeEach` plus a dynamic `await import(...)` in the test, or `vi.doMock` when the mock factory itself carries state (a `vi.mock` factory's result is cached across `resetModules`). Module-level state a test mutates (an in-memory fake, a global regex's `lastIndex`, a loader cache) is reset in `beforeEach` for the same reason: `--repeats` and `--sequence.shuffle.tests` run the same tests again in the same worker.
- **A leak that slips through shows up as an order-dependent failure.** Reproduce with `pnpm exec vitest run --project <name> --sequence.shuffle.files`, then fix the test's cleanup; do not turn isolation back on for the project.
- **Tests that spawn processes need their own timeout.** `oxlint-wrapper-lint-coverage.gate.test.ts` runs oxlint and sets `LINT_TIMEOUT_MS` (60s), because the default 5s is easy to exceed when the whole suite saturates the CPU.

### Transform cache

Vitest 5 persists transformed modules (`fsModuleCache`, on by default for every project, including `component-compiled`) in `node_modules/.vitest-cache`. An entry is keyed on the file's id and content, `NODE_ENV`, the resolved config (plugin names, `resolve`, and the content of the config file and the files it imports, such as `apps/web/react-compiler.ts`) and the coverage mode, so an edited source or config never serves a stale transform. A lockfile change makes Vitest delete the directory. Plugin options set outside the config's file graph are not in the key: after changing one, run `pnpm exec vitest --clearCache`. The cache holds transformed code only, so it carries no state between runs.

CI does not cache the directory: measured, the job time did not improve, because it is bound by imports and environment setup, and saving the cache cost about 10 s.
