# Schemas package (`@watchdog/schemas`)

> Scope: `packages/schemas` (inherits root AGENTS.md)

Shared atoms: vocab, `PatchOp`, snapshots, job-artifact ids, identifier normalize + validate, and the input schemas that web, API, and CLI share. Zod + TypeScript only; a leaf dependency (no DB, Caps, or app imports, held by `package.json`). Import through a domain subpath, never the bare package: `@watchdog/schemas/{shared,cases,graph,evidence,jobs,caps,feed}` (each `src/<domain>.ts`, declared in `package.json` `exports`; `check:boundaries` rejects undeclared subpaths). There is no root import or `src/index.ts`. `feed` (`src/feed.ts`) groups the `activity`, `activity-log`, `tasks` and `watchdog-events` modules. A new module joins the domain it belongs to; a name lives in exactly one domain. Find a schema by name with `grep`. Types contract: [`types.md`](../../docs/reference/platform/types.md).

## Commands

| Task           | Command                                     |
| -------------- | ------------------------------------------- |
| Typecheck      | `pnpm --filter @watchdog/schemas typecheck` |
| Unit tests     | `pnpm test:unit`                            |
| Property tests | `pnpm test:property`                        |

## Branded ids (ADR-0003)

`OrganizationId` (opaque text, `organizationIdSchema`) and `CaseId` (uuid, `caseIdSchema`) live in `src/ids.ts` and are exported from `@watchdog/schemas/shared`; `ApiActor.organizationId` is `OrganizationId | null`. A branded value is assignable to `string`, never the other way round. Mint through `asOrganizationId(value)` / `asCaseId(value)` (they throw on invalid input), a schema parse (API inputs use `caseIdSchema`), `parseTrimmedCaseId` (`CaseId | null`, trims first) or a typed database column; never cast: any cast whose type mentions a brand (`as CaseId`, `as CaseId[]`, `as Record<string, CaseId>`, `as unknown as ...`) fails lint (`watchdog/no-brand-cast`, only `packages/schemas/src/testing` fixtures are exempt). Edges parse CASE ids with `parseTrimmedCaseId` / `caseIdSchema` and every other uuid (entity, job, evidence, edge, playbook run) with `parseTrimmedUuid` (plain `string | null`); never use the case parser for another kind, it would brand it a `CaseId` (type test: `packages/core/src/__tests__/branded-ids.types.test.ts`). Both carry a JSDoc saying so. Wire schemas that carry a Case id (`activityEntrySchema`, `activityItemSchema`, `taskSchema`, `evidenceSnapshotSchema`, the API output schemas) use `caseIdSchema`, so `z.output` / `z.infer` is `CaseId`. Brand at the edge: apps parse route, search, cookie, SSE and CLI ids with these parsers and never cast; `createAuth` mints `asOrganizationId` for Better Auth's hook ids.

## Gotchas

- Enums and vocab live here; drizzle consumes them via `text().$type<T>()`. Extend existing primitives rather than adding parallel one-off types. Web/API/CLI create, update, and delete inputs share one schema each (for example `createIdentifierInputSchema`, `updateCaseInputSchema`): extend the shared one, do not fork it per surface.
- `src/testing/` (`@watchdog/schemas/testing`) holds `build*Op` patch fixtures and the branded id fixtures (`TEST_ORGANIZATION_ID`, `testCaseId`, `testActor`, `untrusted*`; the only tree exempt from `watchdog/no-brand-cast`): dev-only, never imported from production code.
- `api-caller.ts` (`ApiActor`, `ApiCaller`) is plain types for "who is calling", shared by `@watchdog/api` and `@watchdog/auth`; no logger or framework types here.
- Identifier validation is schemas-local (`validate-identifier.ts`, `normalize-identifier.ts`): do not import `@watchdog/tools` or `node:net`. IPv6 normalizes to lowercase RFC 5952 form when syntactically valid; malformed input is left for validate to reject.
- Job status subsets are named once in `vocab.ts` (`OPEN_` / `CANCELLABLE_` / `LIVE_` / `TERMINAL_JOB_STATUSES` plus `is*JobStatus`); cancellable is currently the open set by design. Do not repeat status arrays in repos, core, or web.
- `TASK_STATUSES.blocked` is a kanban column, not `JOB_STATUSES.blocked` (a legacy playbook Job wait kept for old rows; see [`jobs.md`](../../.agents/skills/effect/references/jobs.md)).
- SSE `caseId` goes through `parseTrimmedCaseId` (trim + UUID, invalid → `null`); `parseSseCaseIdParam` turns that into a 400.
- Activity log wire shape (ADR-0005): `activity-log.ts` holds `activityEntrySchema`, the kind and per-kind action lists, the `xid:id` cursor (`parseActivityCursor`, `compareActivityCursor`; `xid` is decimal text, it exceeds 2^53), and `createActivityGate`. A domain moving onto the log adds its verbs to `ACTIVITY_ENTRY_ACTIONS` in the same change. There is no second event schema: the retired per-type event union and its adapter are gone (ADR-0005 S7).
- Dashboard Activity wire shape (`ACTIVITY_KINDS` / `activityItemSchema`) lives in `activity.ts`; api and web import it from `@watchdog/schemas/feed`, do not fork or re-export it.
