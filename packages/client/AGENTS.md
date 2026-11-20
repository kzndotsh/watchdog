# Client package (`@watchdog/client`)

> Scope: `packages/client` (inherits root AGENTS.md)

Typed HTTP SDK for `/api/v1`: the generated OpenAPI contract in `src/generated/` (gitignored build output) plus `createWatchdogClient`. Used by the CLI and agents; prefer it over hand-rolled `fetch`. Case Export zip/md are not on the contract (the CLI uses authenticated `fetch`).

## Commands

| Task         | Command                                    |
| ------------ | ------------------------------------------ |
| Typecheck    | `pnpm --filter @watchdog/client typecheck` |
| Regen client | `pnpm generate:client`                     |
| Unit tests   | `pnpm test:unit`                           |

## Rules

- `src/generated/` (`contract.json`, `openapi.json`, `app-router.ts`) is gitignored build output, never edited or committed. `pnpm generate:client` writes it; this package's `prepare` runs it on `pnpm install` (before the CLI's `prepare` build), and root `pnpm typecheck` and `pnpm build:cli` run it first. The generator sets `SKIP_ENV_VALIDATION=1` itself, so it needs no `.env`.
- Never list `@watchdog/api` in this `package.json`: `app-router.ts` is a type-only alias of the live API `AppRouter` by relative path.
