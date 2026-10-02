# Client package (`@watchdog/client`)

> Scope: `packages/client` (inherits root AGENTS.md)

Typed HTTP SDK for `/api/v1` (generated OpenAPI contract in `src/generated/` + `createWatchdogClient`). Used by CLI and agents.

## Commands

| Task         | Command                                    |
| ------------ | ------------------------------------------ |
| Typecheck    | `pnpm --filter @watchdog/client typecheck` |
| Regen client | `pnpm generate:client`                     |
| Unit tests   | `pnpm test:unit`                           |

## Rules

- `src/generated/` (`contract.json`, `openapi.json`, `app-router.ts`) is the router artifact — never list `@watchdog/api` in this `package.json`. `app-router.ts` is a type-only alias of the live API `AppRouter` by relative path (monorepo-local until a contract-first router becomes the type SoT); `contract.json` is minified route metadata with schemas stripped. Never hand-edit `src/generated/`.
- After API route/input changes: `pnpm generate:client` (commit `packages/client/src/generated/*`).
- Prefer this client over hand-rolled `fetch`.
- Tests cover `createWatchdogClient` (base URL slash-strip + `x-api-key`). Do not unit-test contract generated JSON.
- Case Export zip/md are **not** on the oRPC contract — CLI uses authenticated file `fetch` + `x-api-key` (see `apps/cli`).
