# Client package (`@watchdog/client`)

> Scope: `packages/client` (inherits root AGENTS.md)

Typed HTTP SDK for `/api/v1` (generated OpenAPI via `@watchdog/contract` + `createWatchdogClient`). Used by CLI and agents.

## Commands

| Task         | Command                                    |
| ------------ | ------------------------------------------ |
| Typecheck    | `pnpm --filter @watchdog/client typecheck` |
| Regen client | `pnpm generate:client`                     |
| Unit tests   | `pnpm test:unit`                           |

## Rules

- Depend on `@watchdog/contract` only for the router artifact — never `@watchdog/api`.
- After API route/input changes: `pnpm generate:client` (commit `packages/contract/src/generated/*`).
- Prefer this client over hand-rolled `fetch`.
- Tests cover `createWatchdogClient` (base URL slash-strip + `x-api-key`). Do not unit-test contract generated JSON.
- Case Export zip/md are **not** on the oRPC contract — CLI uses authenticated file `fetch` + `x-api-key` (see `apps/cli`).
