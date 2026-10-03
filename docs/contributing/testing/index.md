# Testing: platform index

**What this is:** where tests live, what each tier needs, and the non-obvious runner facts. Commands are the `test*` scripts in `package.json`.  
**What this is not:** how to write a good test ([`standards.md`](standards.md)) or web design-system gates (`pnpm --filter @watchdog/web ds:check`, [`ci-gates.md`](../ci-gates.md)).

Run order that matters: `pnpm test` runs unit + property + gate (no Postgres). `just test-db` creates and migrates `watchdog_test` / `watchdog_e2e` before `pnpm test:integration` or `pnpm test:e2e`. `pnpm test:e2e:smoke` is `@smoke` + `@custody`; `pnpm test:e2e:journey` is `@journey` only. `pnpm exec vitest run --project e2e-parser` runs the harness unit tests under `e2e/`. `pnpm test:coverage` writes a v8 report (a reviewer signal, not a percentage gate).

## Tiers

| Tier | Where | Isolation |
| --- | --- | --- |
| Unit | `packages/*/src/**/__tests__/**/*.test.ts` + `apps/worker` + `apps/cli` | Pure; `SKIP_ENV_VALIDATION=1` |
| Property | `*.property.test.ts` under `packages/*` or `apps/*` | fast-check via `@watchdog/test-kit/fc` |
| Gate | `scripts/__tests__/*.gate.test.ts` | Runs a gate script as a CLI in a temp git repo; asserts exit code + output ([`ci-gates.md`](../ci-gates.md#gate-tests)) |
| Component | `apps/web/src/**/__tests__/**` (`*.test.ts` + `*.component.test.tsx`) | happy-dom + Testing Library |
| Integration | `*.int.test.ts` under `packages/*` or `apps/*` | `watchdog_test`; `withTestTx` or `resetTestDb` |
| E2E parser | `e2e/**/*.test.ts` (not under `specs/`) | Pure; guards the E2E harness itself |
| E2E | `e2e/specs/**/*.spec.ts` | `watchdog_e2e` + web + worker; tags `@smoke`, `@custody`, `@journey`; no retries |

Sibling `__tests__/` next to source. Shared helpers: `@watchdog/test-kit` (`/fc`, `/fixtures`, `/http`; dependency-free), `@watchdog/test-db` (Postgres harness + seeds), `@watchdog/schemas/testing` (`build*`), `packages/caps/src/testing` (Cap `it*` / `expect*`). Naming of helpers and suffixes: [`standards.md`](standards.md).

## Runner facts

- **E2E prereqs:** Postgres + S3 (`just up`, or `just test-db` + `just docker-up`). Integration and e2e read `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` when set (defaults `http://127.0.0.1:9100`, `watchdog`, `watchdog-dev-secret`; e2e also takes `E2E_S3_PORT`). Playwright starts web on port **3300** (it does not reuse `:3000`) and the worker with `pnpm --filter @watchdog/worker start`, not `dev`/`tsx watch`, which would kill a daily worker watching the same files. An auto `_resetDb` fixture wipes `watchdog_e2e` public + `auth` and cookies before every browser test. On NixOS enter `nix develop` so Chromium comes from the flake; CI installs Playwright's own Chromium.
- **Shared workers:** all Vitest projects use `isolate: false` + `vitest.reset-modules.ts`; tests must restore any `process.env`, `globalThis`, fake timers or DOM they change ([`standards.md`](standards.md#test-speed-shared-workers)).
- **Web lib tests run in the component project** (happy-dom), not `pnpm test:unit`; unit is packages + worker + CLI. Vitest clears mock call history before each test; `vitest.config.ts` sets `clearMocks: false` so assertions on calls made at import time or in `beforeAll` still see that history.
- **Tenant isolation:** every new case-scoped API procedure belongs in `packages/api/src/__tests__/org-isolation.int.test.ts` (guidance; nothing enumerates the router, see [`../../reference/contracts/README.md`](../../reference/contracts/README.md#org-isolation)).
- **Collect Caps** ship `__tests__/interpret.test.ts`. Do not add a `run()` file per Cap: prove `report.json` + interpret with `itRunsCollectCap` (`packages/caps/src/testing`), used on three Caps today (`network.dns.lookup`, `web.url.unshorten`, `threat.virustotal.lookup`). Caps with a hand-written `run()` (not `defineCollectCap`) carry their own tests. Web does not re-test Cap handlers: fix and test `@watchdog/core` / `@watchdog/policy` / the Cap, then check the page. Guidance.
- **MSW:** import `http` / `HttpResponse` / `mockServer` / `mockJson` from `@watchdog/test-kit/http`, not `msw`. Effect tests that sleep or use Layers use `it.effect` from `@effect/vitest` (TestClock provided); see `apps/worker/src/__tests__/cancel-poll.test.ts`, `packages/policy/src/__tests__/patch-gates.test.ts`. Guidance.
- CLI unit tests live under `apps/cli/src/**/__tests__/` and cover `--help`, custody envelopes and `loadPatch`. Generated `packages/client/src/generated/` is CI regen, not a test target.
- **Playwright layout:** specs under `e2e/specs/<area>/`; harness in `e2e/support/`, `e2e/api/`, `e2e/pages/`; import `test` / `expect` from `e2e/fixtures/test.ts`, not `@playwright/test` (guidance).

## See also

- Methodology and anti-cheat: [`standards.md`](standards.md)
- Package harnesses: [`packages/test-kit/AGENTS.md`](../../../packages/test-kit/AGENTS.md) · [`packages/test-db/AGENTS.md`](../../../packages/test-db/AGENTS.md)
