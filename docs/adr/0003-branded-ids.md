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

## Considered

- **Only object parameters, no brands.** Fixes call-site readability but a function still accepts any string for any id, and nothing stops a caller passing the wrong value. Rejected as the primary fix.
- **Brand every id in one pass.** One end state, but 350 to 400 files in a single review. Rejected for the phased order above.
- **Bare casts allowed for convenience.** Fastest, but any string can be stamped as an id anywhere, which defeats the point. Rejected.

## Reopen when

- the parse-at-the-edge cost for JSON and SSE payloads proves larger than the swaps it prevents, or
- Zod's `.brand()` changes shape in a way that breaks `z.infer` consumers in web and cli.
