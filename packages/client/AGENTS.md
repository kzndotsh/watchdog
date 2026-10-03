# Client package (`@watchdog/client`)

> Scope: `packages/client` (inherits root AGENTS.md)

Typed HTTP SDK for `/api/v1`: the generated OpenAPI contract in `src/generated/` plus `createWatchdogClient`. Used by the CLI and agents; prefer it over hand-rolled `fetch`. Case Export zip/md are not on the contract (the CLI uses authenticated `fetch`).

## Commands

| Task         | Command                                    |
| ------------ | ------------------------------------------ |
| Typecheck    | `pnpm --filter @watchdog/client typecheck` |
| Regen client | `pnpm generate:client`                     |
| Unit tests   | `pnpm test:unit`                           |

## Rules

- Never hand-edit `src/generated/` (`contract.json`, `openapi.json`, `app-router.ts`); after API route/input changes run `pnpm generate:client` and commit the output. Enforced by the CI drift job.
- Never list `@watchdog/api` in this `package.json`: `app-router.ts` is a type-only alias of the live API `AppRouter` by relative path.
