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
| Case-id inputs use the brand schemas (`trimmedCaseIdSchema` in the shared input schemas, `optionalCaseIdSchema` for optional ones), so the id is a `CaseId` once parsed; `z.input` stays a plain string, so clients and generated types are unchanged. Procedures pass `context.actor.organizationId` (an `OrganizationId`) and `input.caseId` straight to core | `pnpm typecheck` |
| Name nested wire objects in `schemas.ts` (e.g. `identifierCollisionSchema`); no anonymous inline Zod on the wire. Do not leak DB rows or drizzle types | guidance |
| Credentials procedures expose vault **slots** only, never plaintext | guidance |

## Gotchas

- `toOrpcError` maps `DomainTag` via `Match.tagsExhaustive`; run Effects through `runApp`. `AppLive` is the live `Db` Layer plus the producer `JobQueue` Layer, the `Vault` Layer and the `BlobStore` Layer ([ADR-0002](../../docs/adr/0002-effect-services-and-layers.md) phases 2-3): `runApp` accepts `R = Db | JobQueue | BlobStore | Vault` (pg-boss starts lazily on the first enqueue; the S3 client is built once and destroyed when the runtime is disposed), and tests override with `runAppWith(layer)(effect)` (e.g. `Db.layerOf(spy)` from `@watchdog/core/infra`, `recordingJobQueue().layer` from `@watchdog/core/jobs`, `recordingBlobStore().layer` from `@watchdog/core/blob`, `fakeVault(...).layer` from `@watchdog/core/vault`). Core reaches the database only through the `Db` service, the queue only through `JobQueue` and object storage only through `BlobStore` and credentials only through `Vault`.
- Runtime lifetime: `appRuntime = makeAppRuntime(AppLive)` (`runtime.ts`) disposes the runtime (producer pg-boss stop, pool and S3 client release) on a Vite SSR full reload (`import.meta.hot.on("vite:beforeFullReload")`: the SSR module runner does not call `hot.dispose` handlers on a full reload, measured on Vite 8) and on a module-level HMR update, so `vite dev` does not accumulate producer pools; `dispose` is idempotent and a runtime that never ran builds nothing. There is deliberately no production shutdown hook: the built web server installs no signal handler and the producer holds no handlers or queued work, so adding one would only change the server's exit behavior; if the server gains a shutdown hook, call `appRuntime.dispose()` there. Dev only: after a dispose, an importer that Vite does not re-evaluate keeps the disposed runtime (its calls fail) until the dev server restarts. Tested in `__tests__/runtime-dispose.test.ts` (fake driver, `makeJobQueueLayers`).
- Logging: shared middleware stamps ids from input, so do not call `context.log?.set` per handler. `ApiContext.log` comes from `peekRequestLogger`.
- Prefer the evidence verbs (`POST …/process`, `…/enrich`) over `jobs.start` for Harvest/Extract/URL Enrich so dedupe and URL-assert stay in one place.
- Case Export zip/md are authenticated file routes on web, not oRPC; the CLI uses raw `fetch` + `x-api-key`. OpenAPI security accepts Bearer, `x-api-key`, or the session cookie.

See also: [`packages/client/AGENTS.md`](../client/AGENTS.md) · [`packages/core/AGENTS.md`](../core/AGENTS.md) · [`docs/reference/platform/README.md`](../../docs/reference/platform/README.md).
