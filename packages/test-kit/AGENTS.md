# Testing kit (`@watchdog/test-kit`)

> Scope: `packages/test-kit` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

Dev-only, **dependency-free** test helpers: ids, URLs, fast-check, MSW. No `@watchdog/*` dependencies, so every package can use it without a dependency cycle (do not import `schemas`, `db`, `caps`, … here). Never import from production code. Helpers that need a workspace package live with it: Postgres harness in [`@watchdog/test-db`](../test-db/AGENTS.md), patch `build*` in `@watchdog/schemas/testing`, Cap helpers in `packages/caps/src/testing/`.

## Commands

| Task            | Command                                      |
| --------------- | -------------------------------------------- |
| Typecheck       | `pnpm --filter @watchdog/test-kit typecheck` |
| Unit / property | `pnpm test:unit` · `pnpm test:property`      |

## Gotchas

- Entrypoints (see `package.json` `exports`): `/fc` is fast-check (unit/property only), `/fixtures` is ids + URLs without fast-check or MSW, `/http` is MSW. Import MSW only via `@watchdog/test-kit/http`; call listen/reset/close in the test file (or `src/http/msw-setup.ts`). Guidance.
- Use extensionless relative imports: consumers typecheck these files with stricter tsconfigs that reject `.ts` extensions.
- `testId(1)` is a greppable UUID-v4-shaped id; `TEST_ACTOR_ID` is `"test-actor"`.
- Effect programs that need `TestClock` or scoped Layers use `it.effect` from `@effect/vitest`; do not return a bare Effect from a plain `it()`. Shared-worker restore rules: [`standards.md`](../../docs/contributing/testing/standards.md).
