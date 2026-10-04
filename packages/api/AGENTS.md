# API package (`@watchdog/api`)

> Scope: `packages/api` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

oRPC procedures + OpenAPI contract for `/api/v1`. Procedures call `@watchdog/core`; there is no SQL here (api has no `@watchdog/db` dependency, so its integration tests call core services and seed through `@watchdog/test-db`).

## Commands

| Task                    | Command                                       |
| ----------------------- | --------------------------------------------- |
| Typecheck               | `pnpm --filter @watchdog/api typecheck`       |
| Integration tests       | `pnpm test:integration`                       |
| Export OpenAPI contract | `pnpm --filter @watchdog/api export-contract` |
| Regen HTTP client       | `pnpm generate:client`                        |

## Rules

| Rule | Enforced by |
| --- | --- |
| After any route/input change: export contract → `pnpm generate:client`, commit `packages/client/src/generated/*` | CI drift job (`ci.yml`) |
| Procedures taking `caseId` pass the actor's `organizationId` into core; a foreign or missing Case is `not_found`, with no distinct "wrong org" signal. Org resolution lives in `@watchdog/auth` (`createApiContext`); `authed` throws FORBIDDEN without an organization, so procedures never resolve org themselves | `src/__tests__/org-isolation.int.test.ts` (hand-enumerated: add every new case-scoped procedure) |
| Unknown errors are 500, not 400. `InternalError` maps to `INTERNAL_SERVER_ERROR` with the fixed message `"Internal server error"`; its `reason`/`cause` go only to the request log (`peekRequestLogger`). `InvalidError` stays 400 for caller-fixable input; `graph.write` id/slug collisions are `ConflictError` (409) | `map-domain-error.test.ts` |
| Name nested wire objects in `schemas.ts` (e.g. `identifierCollisionSchema`); no anonymous inline Zod on the wire. Do not leak DB rows or drizzle types | guidance |
| Credentials procedures expose vault **slots** only, never plaintext | guidance |

## Gotchas

- `toOrpcError` maps `DomainTag` via `Match.tagsExhaustive`; run Effects through `runApp`. `AppLive` is `Layer.empty` until the phases in [ADR-0002](../../docs/adr/0002-effect-services-and-layers.md) land.
- Logging: shared middleware stamps ids from input, so do not call `context.log?.set` per handler. `ApiContext.log` comes from `peekRequestLogger`.
- Prefer the evidence verbs (`POST …/process`, `…/enrich`) over `jobs.start` for Harvest/Extract/URL Enrich so dedupe and URL-assert stay in one place.
- Case Export zip/md are authenticated file routes on web, not oRPC; the CLI uses raw `fetch` + `x-api-key`. OpenAPI security accepts Bearer, `x-api-key`, or the session cookie.

See also: [`packages/client/AGENTS.md`](../client/AGENTS.md) · [`packages/core/AGENTS.md`](../core/AGENTS.md) · [`docs/reference/platform/README.md`](../../docs/reference/platform/README.md).
