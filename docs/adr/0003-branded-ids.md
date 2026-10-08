# ADR-0003: Branded IDs, starting with OrganizationId and CaseId

**Status:** accepted (2026-10-05) · closes [#50](https://github.com/kzndotsh/watchdog/issues/50) **What this is:** how identifiers become distinct types so that passing one kind where another is expected fails to compile, how branded values are created, and the order of the migration. **What this is not:** the migration itself (tickets under [#56](https://github.com/kzndotsh/watchdog/issues/56)) or a rule for how many parameters a function may take (deferred below).

## Context

Core and the API pass identifiers as plain `string`. The sharpest case is the pair `(caseId, organizationId)`: many functions take both positionally, both are `string`, and swapping them compiles. In a multi-tenant app that is a cross-tenant mix-up, not a style problem.

Measured on `main` (2026-10-05, by a throwaway prototype):

- 49 uuid columns across 17 id kinds. The organization id is **not** a uuid: it is an opaque text id from Better Auth. User and actor ids are text too. There are no per-kind id schemas today; the helpers (`uuidSchema`, `parseTrimmedCaseId`, `isUuidString`) all return plain `string`.
- In `packages/core/src`, 56 of 251 exported functions take two or more `string` parameters, 38 take two or more id-named strings, 76 take an id as the first parameter, and 33 take `organizationId: string`.
- `: string` id declarations: `caseId` 491 occurrences in 184 files, `entityId` 173 in 88, then `jobId`, `evidenceId`, `actorId`, `userId` and others; 354 files declare some `*Id: string`.
- Branding `OrganizationId` alone: the brand itself breaks 11 sites (all places that mint one). Requiring it in 32 signature files produced 398 type errors in 71 files, almost all in tests; one shared fixture fix cut that to 121. A branded value is still assignable to `string`, so migrating a package at a time stays type-safe. About 90 files for `OrganizationId`; about 350 to 400 for every id kind.
- The organization id has a single source (`actorFromSession` in `packages/auth/src/api-context.ts`). API inputs parse ids with `z.uuid()` at one layer. Drizzle `$type<...>()` on a column brands every row read at no runtime cost.

## Decision

1. **Brands are Zod brands.** Zod is the boundary schema library ([ADR-0001](0001-zod-at-the-boundary.md)), so each id kind is a schema in `@watchdog/schemas`: `caseIdSchema = z.uuid().brand<"CaseId">()`, `organizationIdSchema = z.string().min(1).brand<"OrganizationId">()` (an opaque text id, not a uuid). The branded type is the schema's output type. API inputs mint the brand at parse time; drizzle columns use `.$type<Brand>()`.
2. **Phase 1 is `OrganizationId` and `CaseId` together**, as one sweep in dependency order: schemas, db, auth, core, api, then web, cli, worker and caps. Branding `OrganizationId` alone already turns a `(caseId, organizationId)` swap into a compile error; `CaseId` is added in the same sweep because it is the id that appears next to it everywhere. About 270 files.
3. **Later phases:** `EntityId`, then the remaining kinds by usage (job, evidence, edge, identifier, proposal, task, claim, event, question, actor and user).
4. **Brands are minted only through validating constructors.** `asOrganizationId(value)` and its siblings wrap `schema.parse`. A lint rule bans bare `as <Brand>` casts outside the test fixtures, so a branded type always means the value passed validation or came from a trusted typed source (a database column, the session). The shared fixtures (`TEST_ORGANIZATION_ID`, a `testCaseId()` helper, a `testActor()` factory) live in the test kit.
5. **The object-parameter rule is deferred.** Brands already stop id swaps, so "a function with several ids takes one object" is a readability rule and can lag. Decide it after phase 1, with the real list of offenders, either as a lint rule in the local oxlint plugin with a baseline that can only shrink (like the size gate) or by leaving positional lists legal but type-checked.

## Consequences

- A branded id is assignable to `string`, but not the other way round, so each package can migrate on its own without breaking its dependents.
- JSON and SSE payloads, route params, and CLI and web strings are plain strings at the edges and must be parsed back into brands at the edge; types derived with `z.infer` will carry the brands into web and cli.
- `$type<Brand>()` on a column is a promise the database cannot check: raw `sql` results are not branded.
- The `parseTrimmedCaseId` family returns `CaseId | null` instead of `string | null`.
- `@watchdog/test-kit` needs the brand types (a type-only import from schemas, or a dependency on it).

## Phase 1 as built (2026-10-05)

Phase 1 shipped in one sweep (PR #164, 203 files). What differs from the plan above:

- **Mint points.** Actors get their organization id in one place, `resolveActorOrganizationId` in `packages/auth/src/actor.ts` (a validating `safeParse`; a blank id is treated as absent, so a user with no active organization gets a clean forbidden, not a crash). The web organization-delete hook also mints with `asOrganizationId`, because Better Auth hands it a plain id.
- **The case parser is for case ids only.** `parseTrimmedCaseId` returns `CaseId | null`; every other uuid kind (entity, job, evidence, edge, playbook run) uses `parseTrimmedUuid`, which returns a plain `string`. The first cut reused the case parser for other kinds (about 53 call sites), which typed an entity id as `CaseId` and let it pass where a case id is required; that was fixed in review and is pinned by a type test.
- **Test fixtures live in `@watchdog/schemas/testing`**, not `test-kit`: `TEST_ORGANIZATION_ID`, `TEST_OTHER_ORGANIZATION_ID`, `testCaseId(n)`, `testActor()`. Putting them in `test-kit` created a `schemas <-> test-kit` workspace cycle. `untrustedCaseId` / `untrustedOrganizationId` (stamp an unvalidated brand, for tests that feed malformed ids to runtime guards) are in the same place and importable only from tests by lint.
- **Two lint rules** in the local oxlint plugin enforce the invariant: `watchdog/no-brand-cast` bans casts to a brand anywhere inside an asserted type (unions, arrays, `Record`, generics, `as unknown as`, `BRAND<"...">`; a type alias declared in another file is not followed), and `watchdog/no-untrusted-id-import`.
- **Deliberately still plain strings in phase 1 (closed by the follow-up below):** database repo `caseId` parameters (about 90; the repos trim and validate them, and their tests pass padded ids), the result records (`CaseRecord`, `EvidenceRecord`, `EntityRecord`, `JobRecord`, `ProposalRecord`, `TaskRecord`, `GraphWriteRecord`, `JobRunOutcome`), the SSE event schema, and `z.infer` of the API output schemas. Branding the records broke about 120 web files, so that waits for the web, cli, worker and caps sweep. The guarantee today is that core and api function inputs take the brands; the layers below still accept strings, so a swapped repo call still compiles.

## Phase 1 follow-up as built (#165)

The layers phase 1 left on plain strings now carry the brands. What changed and what was decided:

- **Database repos take `CaseId`.** Every repo `caseId` parameter, the `caseId` of every `values` / input object and the Case id of `cases.repo` (`getById`, `getByIdUnchecked`, `lockById`, `update`, `delete`) is a `CaseId`; `organizationId` was already `OrganizationId`. A `CaseId` is a validated uuid, so the repos' `trimCaseId` / `trimScopedCaseIds` no longer clean up caller input; they stay as a fail-closed re-check, so a brand stamped without validation still misses instead of matching. The trimming boundary is `repos/_scoped-ids.ts` (plain string in, `CaseId | undefined` out), kept for graph resource ids, which are plain strings until their phase. Tests that pass padded or malformed Case ids on purpose parse them at the test edge with `untrustedCaseId(...)` (lint-restricted to tests); no repo signature is loosened for them.
- **Result records carry the brand.** `CaseRecord.id` and the `caseId` of `EvidenceRecord`, `EntityRecord`, `JobRecord`, `ProposalRecord`, `TaskRecord`, `GraphWriteRecord`, `JobRunOutcome` and `CapContext` are `CaseId`; the Case-id fields of `activityEntrySchema` (the SSE and replay wire shape), `activityItemSchema`, `taskSchema` and `evidenceSnapshotSchema` use `caseIdSchema`, so the SSE event type is derived from the branded schema. Other uuid kinds (entity, job, evidence, edge, proposal, task ids) stay plain `uuidSchema` until their own phase.
- **API outputs carry the brand (decision).** The output schemas in `packages/api/src/schemas.ts` use `caseIdSchema` for Case ids instead of `z.uuid()`, so `z.output` (what oRPC clients, web server functions and the CLI infer) is `CaseId`; `z.input` stays a plain string, so handlers returning core records and the OpenAPI contract are unchanged. The alternative, web and cli re-parsing at the edge, was rejected on evidence:
  - _Typecheck impact._ With branded records and plain outputs, the web's server functions (`cases`, `intake`, `tasks`, `jobs`, `entities`, `triage`) failed to typecheck at 23 source sites in 6 files (measured with the test fixtures already fixed) because an oRPC result (plain `string`) is not assignable to the branded core record the function declares; every one of them would need a parse or a cast. With branded outputs those source errors disappear and web, cli, worker and caps need no production-code change; the only fallout is test fixtures that wrote a plain string for a Case id (about 100 lines, fixed with `testCaseId` / `asCaseId`).
  - _Runtime cost._ `.brand()` is type-only: `z.uuid().brand()` parses at the same speed as `z.uuid()` (about 0.1 us per parse, 2M parses in 185 ms against 187 ms) and the server already validates outputs. Re-parsing would add a second uuid parse per row on every list response for no new guarantee.
  - _Generated client._ `pnpm generate:client` and `pnpm generate:caps` produce no diff: `.brand()` leaves the JSON Schema untouched and `packages/client/src/generated/app-router.ts` is a type-only alias of the live router, so the SDK's output types carry the brand for free.
  - _Trade-off._ A brand on an output is a promise made by the server (it validated the uuid and a drizzle `$type` column supplied it); a client that is not this repo's SDK sees a plain string on the wire, as before.
- **Still plain:** web and cli parameters and query keys that merely pass a Case id along (they accept a `CaseId`, nothing requires the brand), `@watchdog/log` field bags, the demo seed scripts and every non-case id kind.

## Considered

- **Only object parameters, no brands.** Fixes call-site readability but a function still accepts any string for any id, and nothing stops a caller passing the wrong value. Rejected as the primary fix.
- **Brand every id in one pass.** One end state, but 350 to 400 files in a single review. Rejected for the phased order above.
- **Bare casts allowed for convenience.** Fastest, but any string can be stamped as an id anywhere, which defeats the point. Rejected.

## Reopen when

- the parse-at-the-edge cost for JSON and SSE payloads proves larger than the swaps it prevents, or
- a non-SDK consumer of the generated contract needs the brand on the wire (outputs would then need a documented parse at that consumer), or
- Zod's `.brand()` changes shape in a way that breaks `z.infer` consumers in web and cli.
