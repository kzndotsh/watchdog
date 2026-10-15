# Testing: platform index

**What this is:** where tests live, what each tier needs, and the non-obvious runner facts. Commands are the `test*` scripts in `package.json`.  
**What this is not:** how to write a good test ([`standards.md`](standards.md)) or web design-system bans (oxlint `watchdog/*` rules, [`ci-gates.md`](../ci-gates.md)).

Run order that matters: `just test-db` creates and migrates `watchdog_test` / `watchdog_e2e` before `pnpm test:integration` or `pnpm test:e2e`. `pnpm test:e2e:smoke` is `@smoke` + `@custody`; `pnpm test:e2e:journey` is `@journey` only. `pnpm test:coverage` writes a v8 report (a reviewer signal, not a percentage gate). Tiers map to test size (small, medium, large) in [ADR-0006](../../adr/0006-test-tiers-and-sizes.md).

## What runs where

Each Vitest project is one row. The file globs are `vitest.config.ts`, which wins over this page.

| Project | Files | Environment | Size | Command |
| --- | --- | --- | --- | --- |
| `unit` | `*.test.ts` under `packages/*/src`, `packages/*/scripts`, `apps/worker`, `apps/cli` | node | small | `pnpm test:unit` |
| `web-unit` | `*.test.ts` under `apps/web/src`, except the DOM files below and `*.int.test.ts` | node | small | `pnpm test:unit` |
| `property` | `*.property.test.ts` under `packages/*` or `apps/*` | node | small | `pnpm test:property` |
| `component` | `*.component.test.tsx` under `apps/web/src`, plus the hook and DOM `*.test.ts` files listed as `webDomTestGlobs` in `vitest.config.ts` | happy-dom | small | `pnpm test:component` |
| `gate` | `scripts/__tests__/*.gate.test.ts` | node, spawns scripts and oxlint in temp repos | medium | `pnpm test:gate` |
| `integration` | `*.int.test.ts` under `packages/*` or `apps/*` | node, `watchdog_test` Postgres (and S3 for blob and export) | medium | `pnpm test:integration` |
| `e2e-parser` | `e2e/**/*.test.ts` (not `specs/`): the harness's own tests | node | small | `pnpm exec vitest run --project e2e-parser` |
| Playwright | `e2e/specs/**/*.spec.ts` (not a Vitest project) | browser, `watchdog_e2e`, web, worker | large | `pnpm test:e2e` |

**What `pnpm test` runs:** `pnpm test:unit && pnpm test:property && pnpm test:gate`, that is the `unit`, `web-unit`, `property` and `gate` projects. It does **not** run `component`, `integration`, `e2e-parser` or Playwright, and it needs no Postgres. A local green from `pnpm test` says nothing about the component files; run `pnpm test:component` for them.

**What the pre-push hook runs** (`lefthook.yml`): `pnpm typecheck` when the push contains code, and `pnpm test:gate` only when the push touches `scripts/**`, `packages/db/scripts/**`, `lefthook.yml`, `.github/workflows/**`, `skills-lock.json` or `vitest.config.ts`. It never runs the unit, web-unit, property or component projects, so for every other change those tiers are first run by CI. `pnpm changed --run` is the quick local check for them.

**What CI runs:** the job **Unit, property and component tests** runs `pnpm test:coverage` (`unit`, `web-unit`, `property` and `component`); **Gate tests** runs the `gate` project; **Integration** and **Playwright e2e** run their own. `e2e-parser` is run by the nightly shuffle workflow only, not by a pull request job. See [`ci-gates.md`](../ci-gates.md#github-ci-summary).

## Tiers

| Tier | Where | Isolation |
| --- | --- | --- |
| Unit | `packages/*/src/**/__tests__/**/*.test.ts` + `apps/worker` + `apps/cli` (`unit`), and `apps/web/src/**/__tests__/**/*.test.ts` without a DOM (`web-unit`) | In-process, no network or database; `SKIP_ENV_VALIDATION=1`. A few read source or fixtures from disk |
| Property | `*.property.test.ts` under `packages/*` or `apps/*` | fast-check via `@watchdog/test-kit/fc` |
| Gate | `scripts/__tests__/*.gate.test.ts` | Runs a gate script as a CLI, or oxlint over a fixture, in a temp git repo; asserts exit code + output ([`ci-gates.md`](../ci-gates.md#gate-tests)). Nothing is written into the working tree |
| Component | `apps/web/src/**/__tests__/**/*.component.test.tsx` and the DOM `*.test.ts` (hooks, stores, query client) | happy-dom + Testing Library |
| Integration | `*.int.test.ts` under `packages/*` or `apps/*` | `watchdog_test`; `withTestTx` or `resetTestDb` |
| E2E parser | `e2e/**/*.test.ts` (not under `specs/`) | Pure; guards the E2E harness itself |
| E2E | `e2e/specs/**/*.spec.ts` | `watchdog_e2e` + web + worker; tags `@smoke`, `@custody`, `@journey`; no retries |

Sibling `__tests__/` next to source. Shared helpers: `@watchdog/test-kit` (`/fc`, `/fixtures`, `/http`; dependency-free), `@watchdog/test-db` (Postgres harness + seeds), `@watchdog/schemas/testing` (`build*`), `packages/caps/src/testing` (Cap `it*` / `expect*`). Naming of helpers and suffixes: [`standards.md`](standards.md).

## Runner facts

- **E2E prereqs:** Postgres + S3 (`just up`, or `just test-db` + `just docker-up`). Integration and e2e read `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` when set (defaults `http://127.0.0.1:9100`, `watchdog`, `watchdog-dev-secret`; e2e also takes `E2E_S3_PORT`). Playwright starts web on port **3300** (it does not reuse `:3000`) and the worker with `pnpm --filter @watchdog/worker start`, not `dev`/`tsx watch`, which would kill a daily worker watching the same files. An auto `_resetDb` fixture wipes `watchdog_e2e` public + `auth` and cookies before every browser test. On NixOS enter `nix develop` so Chromium comes from the flake; CI installs Playwright's own Chromium.
- **Shared workers:** all Vitest projects use `isolate: false` + `vitest.reset-modules.ts`; tests must restore any `process.env`, `globalThis`, fake timers or DOM they change ([`standards.md`](standards.md#test-speed-shared-workers)).
- **Web `*.test.ts` files split by DOM need:** most run in `web-unit` (node, with `pnpm test:unit`); the ones that need a DOM (hooks, the display-scale and hotkey stores, the query client) are the `webDomTestGlobs` in `vitest.config.ts` and run in `component`. A new web test that touches `window` or renders a hook belongs there. Vitest clears mock call history before each test; `vitest.config.ts` sets `clearMocks: false` so assertions on calls made at import time or in `beforeAll` still see that history.
- **Tenant isolation:** every router procedure is attacked in the matrix behind `packages/api/src/__tests__/org-isolation.int.test.ts` or listed with a reason; `org-isolation-coverage.test.ts` enumerates the router and fails otherwise (see [`../../reference/contracts/README.md`](../../reference/contracts/README.md#org-isolation)).
- **Route handlers against real core:** `apps/web/src/routes/api/__tests__/org-scoping-routes.int.test.ts` imports the export and `/api/events` routes and calls their handlers over the test database; only the session lookup (`createApiContext`) and `createFileRoute` are replaced, so Case visibility is the real core check. The integration project resolves `@` for it, and `web-unit` excludes `*.int.test.ts` so the file runs only there. CI sets `BETTER_AUTH_ALLOW_SIGNUP=1` for every job: a test that needs a closed install stubs it to `0` with `vi.hoisted(() => vi.stubEnv(...))` before the first import (see `packages/auth/src/__tests__/create-auth.int.test.ts`). Guidance for new route-level scoping tests.
- **Collect Caps** ship `__tests__/interpret.test.ts`. Do not add a `run()` file per Cap: prove `report.json` + interpret with `itRunsCollectCap` (`packages/caps/src/testing`), used on three Caps today (`network.dns.lookup`, `web.url.unshorten`, `threat.virustotal.lookup`). Caps with a hand-written `run()` (not `defineCollectCap`) carry their own tests. Web does not re-test Cap handlers: fix and test `@watchdog/core` / `@watchdog/policy` / the Cap, then check the page. Guidance.
- **MSW:** import `http` / `HttpResponse` / `mockServer` / `mockJson` from `@watchdog/test-kit/http`, not `msw`. Effect tests that sleep or use Layers use `it.effect` from `@effect/vitest` (TestClock provided); see `apps/worker/src/__tests__/cancel-poll.test.ts`, `packages/policy/src/__tests__/patch-gates.test.ts`. Guidance.
- CLI unit tests live under `apps/cli/src/**/__tests__/` and cover `--help`, custody envelopes and `loadPatch`. They run in-process through `runWd` (`run-wd.ts`), which calls `boot()` with stubbed `process.exit`, console and env; one test in `smoke.test.ts` spawns the real entry point to prove exit codes. Generated `packages/client/src/generated/` is CI regen, not a test target.
- **Accessibility smoke:** routes in `e2e/support/navigation-routes.ts` with `axe: true` (`/`, `/cases`, `/collect`, `/triage`, `/settings`) plus `/auth/sign-in` are scanned with `@axe-core/playwright` (WCAG 2 A and AA tags) after they load. Only serious and critical violations fail. Existing ones are listed with a reason in `e2e/support/axe-known-violations.ts`; the list is shrink-only: an entry whose rule no longer occurs on its route fails too, so delete it when you fix the page. The filter is unit-tested in `e2e/support/axe-known-violations.test.ts`. Enforced.
- **Playwright layout:** specs under `e2e/specs/<area>/`; harness in `e2e/support/`, `e2e/api/`, `e2e/pages/`; import `test` / `expect` from `e2e/fixtures/test.ts`, not `@playwright/test` (guidance).

## See also

- Methodology and anti-cheat: [`standards.md`](standards.md)
- Package harnesses: [`packages/test-kit/AGENTS.md`](../../../packages/test-kit/AGENTS.md) · [`packages/test-db/AGENTS.md`](../../../packages/test-db/AGENTS.md)
