# Contract package (`@watchdog/contract`)

> Scope: `packages/contract` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

Generated OpenAPI / oRPC contract for HTTP clients. Runtime SoT remains the API router; this package is the client-facing artifact so `@watchdog/client` never lists `@watchdog/api` in `package.json`.

## Commands

| Task             | Command                                      |
| ---------------- | -------------------------------------------- |
| Regen (from API) | `pnpm generate:client`                       |
| Typecheck        | `pnpm --filter @watchdog/contract typecheck` |

## Boundaries

| Do | Don’t |
| --- | --- |
| Commit `src/generated/*` after API route/input changes | Hand-edit generated JSON or `app-router.ts` |
| Runtime export: contract JSON only (no workspace deps) | Import `@watchdog/core`, `@watchdog/db`, apps |
| Type export: `@watchdog/contract/app-router` for OpenAPILink | Re-introduce `@watchdog/api` as a **client** dependency |

## Gotchas

- `contract.json` is minified route metadata (schemas stripped).
- `app-router.ts` aliases the live API `AppRouter` for client typing (monorepo relative). It is excluded from this package’s `tsc` so typecheck stays isolated; `@watchdog/client` resolves it when typechecking.
- CI drifts if `pnpm generate:client` is skipped after API changes.

## See also

| Need | File |
| --- | --- |
| Export script | [`packages/api/scripts/export-contract.ts`](../api/scripts/export-contract.ts) |
| HTTP client | [`packages/client/AGENTS.md`](../client/AGENTS.md) |
| Import matrix | [`docs/reference/platform/packages.md`](../../docs/reference/platform/packages.md) |
