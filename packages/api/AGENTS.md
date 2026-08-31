# API package (`@watchdog/api`)

> Scope: `packages/api` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

oRPC procedures + OpenAPI contract for `/api/v1`. Controllers call `@watchdog/core`; no SQL here.

## Commands

| Task                    | Command                                       |
| ----------------------- | --------------------------------------------- |
| Typecheck               | `pnpm --filter @watchdog/api typecheck`       |
| Integration tests       | `pnpm test:integration`                       |
| Export OpenAPI contract | `pnpm --filter @watchdog/api export-contract` |
| Regen HTTP client       | `pnpm generate:client`                        |

## Boundaries

| Do | Don’t |
| --- | --- |
| Map `DomainError` → HTTP in procedure layer | Leak raw DB rows / drizzle types on the wire |
| Keep Zod inputs next to procedures | Hand-edit `packages/client/src/generated/` |
| Call core services | Import `@watchdog/db` repos from procedures |

## Gotchas

- After route/input changes: export contract → `pnpm generate:client` (CI drifts if skipped). Named nested objects (e.g. `identifierCollisionSchema` on `proposalSchema`) stay in `schemas.ts` — don’t inline anonymous Zod on the wire.
- Playbook run (`POST …/playbooks/{playbookId}/run`): seeds `host|url|evidence|ip|email|hash|handle`; only step 0 is queued at start. `jobSchema` carries `playbookFanIndex` + `playbookRunStatus`. Capabilities list uses `PLAYBOOK_SEED_KINDS` for playbook `seedKinds`.
- Tasks: `POST /cases/{caseId}/tasks/reorder` (`status` + `orderedIds`); `taskSchema.position`. Regen client after this route/input change.
- Intake Process/Enrich are evidence verbs (`POST …/process`, `…/enrich`) wrapping core glue — prefer those over `jobs.start` for Harvest/Extract/URL Enrich so dedupe + URL-assert stay in one place.
- OpenAPI: `search.case` (`GET /cases/{caseId}/search`) is Active Case `searchCase` — keep hit DTOs named in `schemas.ts`.
- OpenAPI security: Bearer + **`apiKeyAuth` (`x-api-key`)** + session cookie — `@watchdog/client` / `wd` send `x-api-key`.
- Credentials procedures expose vault **slots** only (never plaintext); Cap secrets stay in core vault.
- Case Export zip/md are authenticated **file routes** on web (not oRPC) — CLI uses raw `fetch` + `x-api-key`.
- Activity: `GET`-style recent feed procedure is read-only (core `listRecentActivity`); no SSE type for it.
- Unknown errors must be 500, not 400.
- Optional `ApiContext.log` — Start ALS via `peekRequestLogger` on HTTP + ServerFn. `evlog()` sets `operation`; shared middleware lifts ids from input — do not stamp `context.log?.set` per handler. Never `withEvlog` on handlers.
- Integration tests call **core services** (not HTTP) with `@watchdog/test-kit/db`. Do not import `@watchdog/db` from this package's tests.

## See also / External References

| Need | File |
| --- | --- |
| Generated client | [`packages/client/AGENTS.md`](../client/AGENTS.md) |
| Core services | [`packages/core/AGENTS.md`](../core/AGENTS.md) |
| Playbooks | [`docs/reference/platform/caps-lexicon.md`](../../docs/reference/platform/caps-lexicon.md) |
| Process logging | [`packages/log/AGENTS.md`](../log/AGENTS.md) · [`docs/reference/platform/README.md`](../../docs/reference/platform/README.md) |
