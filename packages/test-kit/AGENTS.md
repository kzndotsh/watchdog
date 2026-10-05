# Testing kit (`@watchdog/test-kit`)

> Scope: `packages/test-kit` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

Dev-only test helpers: ids, URLs, fast-check, MSW. The only `@watchdog/*` dependency is `@watchdog/schemas` (the id brands; `schemas` lists test-kit as a dev dependency for its `testing/` builders, so keep this one edge to `@watchdog/schemas/shared`; do not import `db`, `caps`, `core`, … here). Never import from production code. Helpers that need a workspace package live with it: Postgres harness in [`@watchdog/test-db`](../test-db/AGENTS.md), patch `build*` in `@watchdog/schemas/testing`, Cap helpers in `packages/caps/src/testing/`.

## Commands

| Task            | Command                                      |
| --------------- | -------------------------------------------- |
| Typecheck       | `pnpm --filter @watchdog/test-kit typecheck` |
| Unit / property | `pnpm test:unit` · `pnpm test:property`      |

## Gotchas

- Entrypoints (see `package.json` `exports`): `/fc` is fast-check (unit/property only), `/fixtures` is ids + URLs without fast-check or MSW, `/http` is MSW. Import MSW only via `@watchdog/test-kit/http`; call listen/reset/close in the test file (or `src/http/msw-setup.ts`). Guidance.
- Use extensionless relative imports: consumers typecheck these files with stricter tsconfigs that reject `.ts` extensions.
- `testId(1)` is a greppable UUID-v4-shaped id; `testCaseId(1)` is the same value as a branded `CaseId`; `TEST_ACTOR_ID` is `"test-actor"`; `TEST_ORGANIZATION_ID` / `TEST_OTHER_ORGANIZATION_ID` are branded `OrganizationId`s; `testActor(overrides?)` is the shared `ApiActor` in `TEST_ORGANIZATION_ID` (do not hand-write actor literals). Fixtures mint brands through the schema constructors; `packages/test-kit` is the only tree exempt from the `watchdog/no-brand-cast` lint rule.
- Effect programs that need `TestClock` or scoped Layers use `it.effect` from `@effect/vitest`; do not return a bare Effect from a plain `it()`. Shared-worker restore rules: [`standards.md`](../../docs/contributing/testing/standards.md).
- `untrustedCaseId` / `untrustedOrganizationId` stamp a brand on unvalidated text so a test can feed malformed ids to code that must reject them. Importing them outside tests, `packages/test-kit`, `testing/` helper dirs and `packages/test-db/src` fails lint (`watchdog/no-untrusted-id-import`).
