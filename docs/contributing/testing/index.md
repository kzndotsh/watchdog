# Testing: platform index

**What this is:** where tests live and which command runs which tier.  
**Not:** how to write a good test. See [`TESTING_STANDARDS.md`](standards.md).  
**Not:** web DS gates. See [`docs/contributing/testing/web.md`](../../../docs/contributing/testing/web.md).

## Commands

```bash
pnpm test                 # unit + property (no Postgres)
pnpm test:unit
pnpm test:property
pnpm test:component       # jsdom + Testing Library
just test-db              # create + migrate watchdog_test / watchdog_e2e
pnpm test:integration     # real Postgres, rollback-per-test
pnpm test:e2e             # full Playwright suite
pnpm test:e2e:smoke       # @smoke + @custody (fast gate)
pnpm test:e2e:journey     # @journey only (core loop)
pnpm exec vitest run --project e2e-parser  # pure harness unit tests under e2e/
pnpm test:coverage        # v8 report under coverage/ (not a %)
pnpm test:watch
pnpm --filter @watchdog/web ds:check
pnpm --filter @watchdog/db check:repos
```

## Tiers

| Tier | Where | Isolation |
| --- | --- | --- |
| Unit | `packages/*/src/**/__tests__/**/*.test.ts` + `apps/worker` + `apps/cli` | Pure; `SKIP_ENV_VALIDATION=1` |
| Property | `*.property.test.ts` under `packages/*` or `apps/*` | fast-check via `@watchdog/test-kit/fc` |
| Component | `apps/web/src/**/__tests__/**` (`*.test.ts` + `*.component.test.tsx`) | jsdom + Testing Library |
| Integration | `*.int.test.ts` under `packages/*` or `apps/*` | `watchdog_test`; `withTestTx` or `resetTestDb` |
| E2E parser | `e2e/**/*.test.ts` (not under `specs/`) | Pure; guards the E2E harness itself |
| E2E | `e2e/specs/**/*.spec.ts` | `watchdog_e2e` + web + worker; tags `@smoke`, `@custody`, `@journey`; CI retries ×2 |

Sibling `__tests__/` next to source. Shared builders/harness: `@watchdog/test-kit` (`/fc`, `/fixtures`, `/db`, `/http`, `/it`). **E2E prereqs:** Postgres + MinIO (`just up` or `just test-db` + `just docker-up`). Playwright starts web on port **3300** (does not reuse `:3000`) and the worker with `pnpm --filter @watchdog/worker start`: not `dev`/`tsx watch`, which would kill a daily worker watching the same files. Each browser test wipes `watchdog_e2e` public + `auth` (and cookies) via the auto `_resetDb` fixture before running. NixOS: enter `nix develop` so Chromium comes from the flake; CI installs Playwright's own Chromium.

**Web lib tests run in the component project** (jsdom), not `pnpm test:unit`. Unit is packages + worker + CLI.

Collect Caps ship `__tests__/interpret.test.ts`. Do not add a `run()` file per Cap: prove `report.json` + interpret via `itRunsCollectCap` (`@watchdog/test-kit/it`) on **three** Caps (`network.dns.lookup`, `web.url.unshorten`, `threat.virustotal.lookup`). Special `run()` (not `defineCollectCap`): `evidence.harvest`, `evidence.extract.ai`, `network.url.enrich`, `evidence.file.analyze`, `evidence.eml.analyze`. Web does not re-test Cap handlers. MSW: import `http` / `HttpResponse` / `mockServer` / `mockJson` from `@watchdog/test-kit/http`, not `msw`. Effect unit tests that sleep or use Layers: `it.effect` from `@effect/vitest` (TestClock is provided). Examples: `apps/worker/src/__tests__/cancel-poll.test.ts`, `packages/policy/src/__tests__/patch-gates.test.ts`.

CLI unit tests live under `apps/cli/src/**/__tests__/` and cover `--help`, custody envelopes (`CUSTODY` without `--user-override` on identifier/edge/event/question writes), and `loadPatch`. Generated `packages/contract/src/generated/` is CI regen, not a test target.

Playwright suite under `e2e/specs/` (**9 files**): `@journey` core loop; `@custody` Accept gates; `@smoke` auth (sign-up, invite accept, instance-admin Users), cases, Collect paste, Triage reject, and per-route navigation smoke (+ dossier). Harness: `e2e/support/`, `e2e/api/`, `e2e/fixtures/test.ts` (import `test`/`expect` here: not `@playwright/test`), `e2e/pages/`.

## See also

| Need | Doc |
| --- | --- |
| Methodology / anti-cheat | [`TESTING_STANDARDS.md`](standards.md) |
| Web gates + remaining manual smoke | [`docs/contributing/testing/web.md`](../../../docs/contributing/testing/web.md) |
| Day-0 journeys | [`SCENARIOS.md`](../../explanation/scenarios.md) |
| test-kit | [`packages/test-kit/AGENTS.md`](../../../packages/test-kit/AGENTS.md) |
