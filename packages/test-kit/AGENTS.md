# Testing kit (`@watchdog/test-kit`)

> Scope: `packages/test-kit` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

Dev-only, **dependency-free** test helpers: ids, URLs, fast-check, MSW. No `@watchdog/*` dependencies, so every package can use it without a dependency cycle. Never import from production code.

Helpers that need a workspace package live with that package instead: Postgres harness + seeds in [`@watchdog/test-db`](../test-db/AGENTS.md), patch `build*` fixtures in `@watchdog/schemas/testing`, Cap test helpers in `packages/caps/src/testing/`.

## Commands

| Task | Command |
| --- | --- |
| Typecheck | `pnpm --filter @watchdog/test-kit typecheck` |
| Unit / property (import `/fc` `/fixtures`) | `pnpm test:unit` · `pnpm test:property` |

## Entrypoints

| Import | Purpose |
| --- | --- |
| `@watchdog/test-kit` | `testId`, `TEST_ACTOR_ID`, `TEST_ORGANIZATION_ID`, `testHttpUrl` / `testHttpOrigin` / `testUrlBase`, `fc` |
| `@watchdog/test-kit/fc` | fast-check (unit/property only) |
| `@watchdog/test-kit/fixtures` | ids + URLs only (no fast-check, no MSW) |
| `@watchdog/test-kit/http` | `http`, `HttpResponse`, `mockServer`, `mockJson` |

## Boundaries

| Do | Don't |
| --- | --- |
| Keep this package free of `@watchdog/*` dependencies | Import `schemas`, `db`, `caps`, … here (that recreates the cycles) |
| Import MSW from `@watchdog/test-kit/http` | Import `msw` from tools/caps/web tests |
| Import `@watchdog/test-kit/fc` from property tests | Pull Postgres helpers into unit tests |
| Use extensionless relative imports (consumers typecheck these files) | `.ts` import extensions: they break stricter consumer tsconfigs |

## Gotchas

- `testId(1)` is `11111111-1111-4111-8111-000000000001` — UUID-v4 shaped, greppable. `TEST_ACTOR_ID` is `"test-actor"`.
- MSW: listen/reset/close in the test file (or `src/http/msw-setup.ts`). Vitest workers are shared across files (`isolate:false` + `vitest.reset-modules.ts`): restore `process.env`, `globalThis`, fake timers, and DOM in `afterEach`, and `close()` MSW in `afterAll` — see `docs/contributing/testing/standards.md`.
- Effect programs that need `TestClock` or scoped Layers: `it.effect` from `@effect/vitest` (provides `TestClock`). Do not return a bare Effect from a plain vitest `it()`.

## See also / External References

| Need | File |
| --- | --- |
| Methodology | [`docs/contributing/testing/standards.md`](../../docs/contributing/testing/standards.md) |
| Commands / tiers | [`docs/contributing/testing/index.md`](../../docs/contributing/testing/index.md) |
| DB harness + seeds | [`packages/test-db/AGENTS.md`](../test-db/AGENTS.md) |
