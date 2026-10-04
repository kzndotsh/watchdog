# Schemas package (`@watchdog/schemas`)

> Scope: `packages/schemas` (inherits root AGENTS.md)

Shared atoms: vocab, `PatchOp`, snapshots, job-artifact ids, identifier normalize + validate, and the input schemas that web, API, and CLI share. Zod + TypeScript only; a leaf dependency (no DB, Caps, or app imports, held by `package.json`). Import through a domain subpath, never the bare package: `@watchdog/schemas/{shared,cases,graph,evidence,jobs,caps,feed}` (each `src/<domain>.ts`, declared in `package.json` `exports`; `check:boundaries` rejects undeclared subpaths). `src/index.ts` is only `export * from` those domains. `feed` (`src/feed.ts`) groups the `activity`, `tasks` and `watchdog-events` modules. A new module joins the domain it belongs to; a name lives in exactly one domain. Find a schema by name with `grep`. Types contract: [`types.md`](../../docs/reference/platform/types.md).

## Commands

| Task           | Command                                     |
| -------------- | ------------------------------------------- |
| Typecheck      | `pnpm --filter @watchdog/schemas typecheck` |
| Unit tests     | `pnpm test:unit`                            |
| Property tests | `pnpm test:property`                        |

## Gotchas

- Enums and vocab live here; drizzle consumes them via `text().$type<T>()`. Extend existing primitives rather than adding parallel one-off types. Web/API/CLI create, update, and delete inputs share one schema each (for example `createIdentifierInputSchema`, `updateCaseInputSchema`): extend the shared one, do not fork it per surface.
- `src/testing/` (`@watchdog/schemas/testing`) holds `build*Op` patch fixtures: dev-only, never imported from production code.
- `api-caller.ts` (`ApiActor`, `ApiCaller`) is plain types for "who is calling", shared by `@watchdog/api` and `@watchdog/auth`; no logger or framework types here.
- Identifier validation is schemas-local (`validate-identifier.ts`, `normalize-identifier.ts`): do not import `@watchdog/tools` or `node:net`. IPv6 normalizes to lowercase RFC 5952 form when syntactically valid; malformed input is left for validate to reject.
- Job status subsets are named once in `vocab.ts` (`OPEN_` / `CANCELLABLE_` / `LIVE_` / `TERMINAL_JOB_STATUSES` plus `is*JobStatus`); cancellable is currently the open set by design. Do not repeat status arrays in repos, core, or web.
- `TASK_STATUSES.blocked` is a kanban column, not `JOB_STATUSES.blocked` (a legacy playbook Job wait kept for old rows; see [`jobs.md`](../../.agents/skills/effect/references/jobs.md)).
- SSE `caseId` and scoped ids go through `parseTrimmedCaseId` (trim + UUID, invalid → `null`); `parseSseCaseIdParam` turns that into a 400.
- Dashboard Activity wire shape (`ACTIVITY_KINDS` / `activityItemSchema`) lives in `activity.ts`; api and web import it from `@watchdog/schemas/feed`, do not fork or re-export it.
