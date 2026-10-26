# Types & schemas

Contract layer for Watchdog: shared atoms in `@watchdog/schemas`, domain inputs in `domains/*/types.ts`, package wire (oRPC / Caps / patch) at the edge.

**What this is not:** a copy of the vocabulary. Enums, predicates and validation rules live in code; this page says who owns what and which rules apply when you add a schema.

## Package ownership

```
@watchdog/schemas   atoms: vocab, JsonValue, PatchOp, EvidenceSnapshot, platforms,
                    normalize/validate-identifier, fingerprint, job-artifact ids
      ↓
@watchdog/policy    assertPatchGates / patchNeedsConfidence (pure; schemas only)
@watchdog/caps/sdk  defineCapability SPI + CapDescriptor
@watchdog/tools     fetch/parse helpers + producer Zod (dns/whois/oembed reports)
@watchdog/ai        LLM provider + structuredExtract + ProcessExtractDraft Zod
      ↓
@watchdog/db        Drizzle columns .$type<>() from schemas; imports `PatchOp` and `JobHandoff` from schemas for its column types; it does not re-export them
@watchdog/caps      Cap implementations + registry; Zod inputs; capabilities.gen.json
@watchdog/core      parsePatch / tryParsePatch; EvidenceSnapshot packing; run-job; apply-patch
@watchdog/api       oRPC procedure I/O (composes schemas atoms)
@watchdog/client    generated OpenAPI + minified router JSON + createWatchdogClient
apps/web domains    types.ts: domain mutation Zod + DTOs (import atoms; do not re-export vocab)
```

Where to find things:

| Need | File |
| --- | --- |
| Enums, confidence tiers, task/job/playbook vocab, edge predicates + metadata (`EDGE_PREDICATES`, `EDGE_PREDICATE_META`) | [`packages/schemas/src/vocab.ts`](../../../packages/schemas/src/vocab.ts), `enums.ts` |
| `PatchOp` / `patchOpSchema` (incl. the rule that claim/identifier/edge ops carry no `confidence`) | [`packages/schemas/src/patch.ts`](../../../packages/schemas/src/patch.ts) |
| Identifier value rules per type (email, phone, url, domain, ip, pgp; soft types), handle→platform | [`packages/schemas/src/validate-identifier.ts`](../../../packages/schemas/src/validate-identifier.ts), `normalize-identifier.ts`, `platforms.ts` |
| Cap/Job artifact id constants, `isJobInternalArtifact` | `packages/schemas/src/job-artifacts.ts` |
| Accept gates | `@watchdog/policy` (`assertPatchGates`, `assertPatchShape`) |
| Patch application | `packages/core/src/graph/patch/apply-*-op.ts`, `parse-agent-patch.ts` |
| Edge update validation | `packages/core/src/graph/edge-update.ts` |
| Producer report shapes | `@watchdog/tools` (`dnsRecordsSchema`, `whoisSnapshotSchema`, `oembedSnapshotSchema`); a Cap imports them from a `@watchdog/tools/<domain>` subpath directly (no Cap-local re-export) |

## Platform vocab is the only vocab here

`@watchdog/schemas` is the sole vocabulary SoT in this repo, covering Postgres, Caps, Triage and UI. Confidence is `unverified` | `possible` | `confirmed`. The separate investigation vault keeps its own markdown vocabulary in a private repo, including tiers such as `probable` that the platform deliberately does not have; overlap is intentional but not identical, so do not port values between them by assuming the names line up.

### Domain notes (rules not visible from the enums)

- **Edges:** one directed Postgres row (`from_id` → `to_id`). Inverse labels (`inverseLabel`) are display metadata, not a second stored predicate. Prefer **dependent → provider** for infra topology (`hosted_on`, `dns_via`, `mail_via`, `resolves_to`). `registers` means registrant registered domain (person/org → infra), not registrar-as-company. Both create and update send absolute `fromId`/`toId`; core rejects kind pairs outside `validKinds`; `related_to` requires notes.
- **Identifiers:** values are normalized then validated by `validateIdentifierWrite`; invalid values block Accept and core create/update, collisions only warn ([`../contracts/custody.md`](../contracts/custody.md)). `handle` requires a non-empty `platform`. `domain` and `ip` are Identifiers on the seed Entity, not Entities; Caps do not auto-create infra Entities or `resolves_to` edges; `ip` is syntax-checked only (no public-range enforcement). DNS NS/MX stay in the observation Claim.
- **`EdgeRecord` list DTOs** carry ego-relative `direction`, `peerId`, `peerName`, `peerSlug` and `peerKind`.

### Vocabulary constraints in Postgres

The database enforces the vocabulary, not only the code. Every column typed from a vocabulary tuple (`text().$type<T>()`) has a `CHECK (col IN (...))` constraint named `<table>_<column>_vocab`, **generated from that same tuple** by `vocabCheck(column, TUPLE)` in `packages/db/src/schema/_vocab.ts`, so the schema and Postgres cannot drift. A nullable column (`claims.retract_kind`, `tasks.priority`) keeps NULL.

| Table | Columns checked |
| --- | --- |
| `entities` | `kind` |
| `claims` | `class`, `confidence`, `retract_kind` |
| `identifiers` | `type`, `confidence`, `status` |
| `edges` | `predicate`, `confidence` |
| `evidence` | `kind` |
| `jobs` | `status`, `error_code`, `provenance_state` (`PROVENANCE_STATES`: `complete`, `incomplete`) |
| `proposals` | `status` |
| `questions` | `status` |
| `tasks` | `status`, `priority` |
| `graph_writes` | `channel`, `confidence` |
| `case_deletion_records` | `event` (`CASE_DELETION_EVENTS`: `deleted`, `restored`, `purged`) |
| `provider_calls` | `transport`, `body_kind`, `request_body_state` (`PROVIDER_CALL_TRANSPORTS`, `PROVIDER_BODY_KINDS`, `PROVIDER_REQUEST_BODY_STATES`) |
| `provider_call_outcomes` | `outcome`, `body_state`, `body_reason` (`PROVIDER_CALL_OUTCOMES`, `PROVIDER_BODY_STATES`, `PROVIDER_BODY_REASONS`) |
| `playbook_runs` | `status` |
| `activity` | `kind`, `action` (any verb of any kind; the kind-to-verb pairing stays in `appendActivityEffect`) |
| `auth.auth_event` | `kind` (`AUTH_EVENT_KINDS`, owned by the db schema) |

**Adding a vocabulary value** is two edits: the tuple in `packages/schemas/src/vocab.ts`, then `pnpm db:generate --name=<what_changed>` for the migration that replaces the constraint. Forgetting the migration fails `pnpm check:migrations` and `packages/db/src/__tests__/vocabulary-checks.int.test.ts` (it reads the constraints back from the migrated database and compares them with the tuples). A **new** vocabulary column needs a `vocabCheck` in its table; the same test lists the columns it expects, so a missing one is a review and test edit, not a silent gap.

Evidence ids inside `proposals.patch` and `graph_writes.patch` (`PatchOp.evidenceIds`) stay JSON without a foreign key, by design ([`custody`](../contracts/custody.md#database-invariants)).

Not constrained, on purpose: Better Auth's own columns (`member.role`, `invitation.role`, `user.role`: the auth library owns that vocabulary and may add roles), `finding_suppressions.reason` (free text today, not in the vocabulary module), and any column that holds prose.

## Input limits

Every free-text field and array in an input schema takes a maximum from one named set in [`packages/schemas/src/limits.ts`](../../../packages/schemas/src/limits.ts) (`INPUT_LIMITS`, exported from `@watchdog/schemas/shared`). A schema picks the limit that names what the field holds; it never writes a bare number. Lengths are UTF-16 code units, counted after trimming. A value over its limit is a validation error (400, `data.code` `invalid`), not a silent cut.

| Limit | Value | Holds |
| --- | --- | --- |
| `NAME_MAX` | 256 | Names, labels, platforms, handles, hosts, emails, ids, cursors, MIME types |
| `SLUG_MAX` | 64 | A Case or Entity slug (`slugifyName` cuts at the same length) |
| `TITLE_MAX` | 500 | A Task title |
| `NOTES_MAX` | 20 000 | Notes, descriptions, summaries, Claim text, reasons |
| `BODY_MAX` | 200 000 | A pasted Evidence body, and any string inside a JSON payload (patch op data, Job input) |
| `URL_MAX` | 2048 | A URL, or an Identifier value that may hold one |
| `SECRET_MAX` | 16 384 | A credential secret |
| `ARRAY_MAX` | 1000 | Items in one list input: ids, patch ops, JSON arrays |
| `CURSOR_MAX` | 24 576 | A pagination cursor (sized for the largest sort key, an Identifier list's) |

Use `requiredText(max)`, `optionalText(max)` and `nullableTextPatch(max)` (`primitives.ts`) for trimmed text fields; `httpUrlSchema`, `uuidListSchema`, `inputJsonValueSchema` and the id schemas are already bounded. The values sit above what real data needs and well under the request body limit, so one request cannot carry more than a few of them. The lint rule `watchdog/bounded-input-schema` fails a `z.string()`, `z.array()`, `z.url()` or `z.email()` with no `.max()` or `.length()` in an input schema (`packages/schemas/src/*.ts`: declarations named `*Input`, `*Fields`, `*Filters` or `*Params`, plus all of `primitives.ts`, `ids.ts`, `lists/filter-kinds.ts` and `lists/build-list-api.ts`; and `.input(...)` in `packages/api/src/procedures`; `.output(...)` and tests are exempt; a bound belongs to the segment it follows, so `z.string().array().max(n)` still leaves the strings unbounded). `packages/schemas/src/__tests__/input-limits.test.ts` proves each limit accepts its maximum and rejects one more. The limits are for INPUT only: what is stored or returned is read with unbounded schemas (`jsonValueSchema`, `jsonObjectSchema` in `json-wire.ts`, `patchOpSchema`/`patchSchema` for stored patches; the bounded twins are `inputJsonValueSchema`, `patchOpInputSchema`, `patchInputSchema`), so a row saved before a limit still reads.

## Pagination

Every procedure that lists rows takes `{ cursor?, limit }` and answers `{ items, nextCursor }` (`pageInputFields` and `pageSchema`, `packages/schemas/src/pagination.ts`). `limit` defaults to `PAGE_LIMIT_DEFAULT` (50) and is at most `PAGE_LIMIT_MAX` (200; a larger value is a 400, not a silent cut); the recent-activity feed has its own 15 and 50, row history keeps its 25 and 100 defaults. `items` come in a stable order that ends with the row id, so the order is total: Cases by name, Evidence, Jobs, Proposals and graph writes newest first, a declared list (Evidence, Identifiers, Entities, Claims, Events, Questions, Connections) by its chosen sort (Claims and Questions oldest first, Events by `when`, Connections by predicate, by default), then the id. A page is found by keyset, not offset: the cursor carries the sort key of the last row, so a page costs the same on page 500 as on page 1, and rows inserted between two page requests never repeat or skip a row already passed. The cursor is opaque (base64url of `[list, id, ...sort-key values]`): treat it as a token and send it back unchanged. It names its list and the type of every part, so a cursor from another list, or a malformed one, is `400` (`data.code: "invalid"`) and never reaches the database. A timestamp sort key travels in the cursor as ISO text at full (microsecond) precision, read in the same statement as the page (`timeKey`, `packages/db/src/repos/_keyset.ts`); a JavaScript date keeps only milliseconds, so rows created in one transaction or one millisecond would otherwise repeat or be skipped. The next page compares against that value, never a re-read of the row, so a row updated between two pages does not move the cursor (a row that is updated moves in the order, as it would on a fresh read) and a row deleted between pages does not break it. The only lists that stay bare are static or bounded by their input: `capabilities.list`, `capabilities.listPlaybooks`, `credentials.list`, `tasks.reorder`, `identifiers.getMany`, `evidence.getMany`, `entities.getMany`, `edges.getMany`, each with its reason in `packages/api/src/__tests__/pagination-coverage.test.ts`, which fails for any other list the router adds. These reads answer a capped envelope with no cursor, each listed with its reason in the same test (`CAPPED_ENVELOPES`, which also catches any unlisted output carrying `isTruncated`): `graph.snapshot` (`{ entities, edges, isTruncated }`, the Graph page: the Case's `GRAPH_SNAPSHOT_ENTITY_MAX` (150) most connected Entities, by Connection count then most recently updated, and at most `GRAPH_SNAPSHOT_EDGE_MAX` (600) Connections between them, most recently updated first, `packages/schemas/src/graph-snapshot.ts`), `graph.ego` (`{ edges, isTruncated }`, the Dossier ego graph: one Entity's at most `GRAPH_EGO_EDGE_MAX` (60) Connections at either end, most recently updated first, each with its peer's label), `evidence.listProviderCalls` and `jobs.listProviderCalls` (at most `PROVIDER_CALL_LIST_MAX`, 200, with `isTruncated`), `tasks.board` (`{ items, isTruncated }`, the board's open Tasks, at most `TASK_BOARD_MAX`, 500, in position order, because its screen needs the whole set at once) and `tasks.due` (`{ items, total }`, the Dashboard's first `TASK_DUE_LIST_LIMIT`, 8, open Tasks overdue or due soon, by due date then id, and their capped total; it takes `cases.counts`'s `dayStart`, so the list and the tiles share one window). A list moving to the list standard ([ADR-0007](../../adr/0007-list-standard.md)) is declared with `defineList` (`packages/schemas/src/lists/`): its input adds flat filters, `sort` and a `q` of at least `LIST_SEARCH_MIN_LENGTH` (3) characters, and its output is `ListPage<T>`, a `Page<T>` with a capped `total` on the first page. Its cursor (v2, `packages/core/src/infra/list-cursor.ts`) is base64url of `[list, sort, fingerprint, id, value]`, the fingerprint being 12 hex characters of sha256 over the scope and `def.keyOf(query)`: the same list's cursor reused for another sort, filter set, search or scope is `400` with `data.code: "cursor_stale"` (`StaleCursorError`), told apart from a malformed one (`invalid`). The SQL side is a typed binding (`defineListRepo`, `packages/db/src/repos/_list-query.ts`) whose WHERE, ORDER BY and cursor value all read one `KeysetOrder` (`_keyset.ts`), and the service body is `listPageEffect`, which asks for the count only after a full first page. `evidence.list`, `identifiers.list`, `entities.list`, `cases.listDeleted`, `tasks.list`, `claims.list`, `events.list`, `questions.list`, `edges.list` and `collect.list` are declared lists: each takes its declaration's `input` (Evidence: `hidden`, `unprocessed`, `unattached`, `kind`, `entityId`, `q`, `sort`; Identifiers: `type`, `status`, `confidence`, `entityId`, `q`, `sort`; Entities: `kind`, `q` over name, summary and notes, `sort` by `name` or `updated`; Deleted Cases: `purging`, `q` over name, link and description, `sort` by `deleted` or `name`, no scope param: the organization is the caller's, an owner or admin only; Tasks: `status`, `priority`, `entityId`, `q` over title and description, `sort` by `updated`, `title` or `position`; Claims: `retracted` (on: only retracted, contested or disproved; absent: the live ones), `class`, `confidence`, `entityId`, `q` over text, `sort` by `added`; Events: `entityId`, `q` over what, where and when, `sort` by `when` or `added`; Questions: `status`, `entityId`, `q` over text and the resolution note, `sort` by `added`; Connections: `predicate`, `confidence`, `entityId` (either end), `q` over notes, `sort` by `predicate` or `updated`, each row with both ends' labels; Collect's queue: `hidden`, `state`, `kind`, `unprocessed`, `unattached`, `capability`, `entityId`, `q` over the row's `search_text`, `sort` by `activity` (the default, descending only: a moving key) or `started`, each row an Evidence row, a playbook run or a lone Job with its member Jobs and Evidence in one statement; `collect.get` finds the row of a row id, a member Job id or a run whose steps all attached, with the Job to focus) and is the only procedure for its list, so one Entity's Identifiers, Claims, Events, Questions or Connections are that list with `entityId` (an id outside the Case matches nothing; there is no per-Entity list route). `entities.pickerPage` is the Entity list a second time for the pickers (#573): the same `input`, binding (`entityPickerListRepo` shares `entityListBinding`) and paging, answering `{ id, kind, name, slug }` with no Connection counts. `entities.matchNames` answers the Entities (`{ id, kind, name, slug }`) that at most `ENTITY_NAME_LOOKUP_MAX` pasted names may mean (name equal ignoring case, or slug equal to the slugified name; the Identifiers bulk add). `evidence.pickerPage` is the Evidence list a second time for the pickers: the same `input`, binding (`evidencePickerListRepo` shares `evidenceListBinding`) and paging, answering `{ id, kind, label, sourceUrl, sha256, capturedAt }` per item, no body. `proposals.queuePage` does the same for the Proposal list (#580): `proposals.listForCase` keeps the record, patch included, for `wd proposals list`, and the queue's page answers `{ id, status, summary, capabilityId, playbookId, createdAt, opCounts, evidenceCount }`, the op counts and the cited-Evidence count computed in the database (`proposalQueueListRepo` shares `proposalListBinding`), so a page never reads a patch and costs no Entity-name or collision lookup. Rows by id, filters aside: `evidence.get` (`not_found` outside the Case), and `evidence.getMany` (the picker's item, not the record), `identifiers.getMany`, `entities.getMany` and `edges.getMany` (at most `ARRAY_MAX` ids; ids outside the Case are left out).

---

## Foundations

1. **Schema is SoT**: define `fooSchema`, then `type Foo = z.infer<typeof fooSchema>` (or `z.output`). Never twin a hand-written `interface` that can drift.
2. **`z.input` when input ≠ output** (`.default()`, `.transform()`, `.coerce`): forms and wire use input; handlers after `.validator` see output.
3. **Validate once** at the trust edge: `createServerFn().validator(schema)`, oRPC `.input`, Cap `input`, `parsePatch`. No re-parse inside helpers.
4. **Closed sets**: `z.enum(CONST)` over `as const` arrays from `@watchdog/schemas`. Never copy string literals into a second `z.enum([...])`.
5. **Compose atoms**: domain/api objects import shared fields; use `.pick` / `.omit` / `.partial` / spread. Avoid deprecated `.merge()`.
6. **No `z.any()`**; coerce only at form/query edges.
7. **Outputs** (server-built rows): plain TS types are fine; Zod-parse responses only when data is untrusted.
8. **`type`, not `interface`**: object shapes are `type X = { ... }` and `extends` becomes `&`. Only a `declare module` or global augmentation that must merge keeps `interface`, with an inline `oxlint-disable-next-line typescript/consistent-type-definitions -- <reason>`. `apps/web/src/auth/ui` (vendored upstream) is the one exempt tree.

Enforced: one Zod version via the `zod` entry in the pnpm catalog and `overrides` in `pnpm-workspace.yaml`. Rule 8 is enforced by oxlint `typescript/consistent-type-definitions`. Rules 1-7 and the naming/import rules below are **guidance** (review); oxlint's typescript rules catch some but no gate checks them.

### Branded ids

`OrganizationId` and `CaseId` (ADR-0003) are Zod brands in `packages/schemas/src/ids.ts`, so passing an organization id where a Case id is expected fails to compile. Mint them only through `asOrganizationId` / `asCaseId`, a schema parse (`caseIdSchema` in API inputs) or a typed source (a drizzle column with `.$type<Brand>()`, the session actor); a bare `as` cast is a lint error outside `packages/schemas/src/testing`. Edges parse a CASE id with `parseTrimmedCaseId` / `caseIdSchema` and every other uuid (entity, job, evidence, edge, run) with `parseTrimmedUuid` (plain string); never use the case parser for another kind. Brand at the edge: route params (a bad id is a 404), `validateSearch` (`optionalCaseIdSchema`), the active-Case cookie, SSE ids, CLI `--case` (`requireCaseId`: a bad id is a `USAGE` error) and Better Auth hook ids (`createAuth` mints `asOrganizationId` before calling `beforeDeleteOrganization`) are parsed by the validating parsers, never cast. Database repos take `CaseId`, the core result records and the SSE/activity and API output schemas carry it (`z.output` is branded, `z.input` stays a plain string), so a record's Case id flows into a repo or web helper without a re-parse. Later phases brand the remaining id kinds.

### Zod package rules

- `@watchdog/schemas` lists `zod` as a **peerDependency** (+ devDependency for typecheck); consumers depend on `zod` themselves.
- One Zod version workspace-wide (dual instances break `instanceof` / registry).
- Author with `import { z } from "zod"` (Classic), not `zod/v4/core`.
- Naming: `fooSchema` + `Foo` / `FooInput`; const arrays `SCREAMING_SNAKE`.

### File map (web)

| File | Contents |
| --- | --- |
| `domains/{noun}/types.ts` | DTOs + input Zod schemas (may import atoms; do **not** re-export vocab) |
| `domains/{noun}/*.functions.ts` | `createServerFn` + `.validator(schema)`: no hand `parse*`, no vocab re-exports |
| `domains/{noun}/*.server.ts` | DB / secrets; business rules |

Import DTOs/schemas from `@/domains/{noun}/types`; import product vocab from a `@watchdog/schemas/<domain>` subpath (for example `@watchdog/schemas/shared`).

---

## Anti-patterns

- Importing product enums from `@watchdog/db`
- Treating `PatchOp` / `EvidenceSnapshot` as owned by `db` or `ai` (schemas is SoT; importers use a `@watchdog/schemas/<domain>` subpath)
- Hand-rolled `z.enum(["queued", …])` that drifts from `JOB_STATUSES`
- `parse*` / `assertConfidence` in `*.functions.ts` instead of Zod
- Freestyle confidence/predicate strings in dossier pickers
- Re-exporting product vocab from domain `types.ts` / `*.functions.ts`
- Dumping every procedure DTO into `@watchdog/schemas` (atoms only)
- A second Zod copy inside `@watchdog/schemas` `dependencies`
- Duplicating Collect Cap report shapes as TS interfaces when tools already exports the producer Zod
- Syncing vault `probable` into the platform without an explicit product decision

---

## Quick example

```ts
// domains/entities/claims/types.ts
import { z } from "zod";

import {
  claimClassSchema,
  confidenceTierSchema,
  nonEmptyTrimmed,
  uuidListSchema,
  uuidSchema,
} from "@watchdog/schemas/shared";

export const createClaimInputSchema = z.object({
  caseId: uuidSchema,
  entityId: uuidSchema,
  text: nonEmptyTrimmed,
  confidence: confidenceTierSchema,
  class: claimClassSchema.default("observation"),
  evidenceIds: uuidListSchema.optional(),
});
/** Wire / form payload (class optional before default). */
export type CreateClaimInput = z.input<typeof createClaimInputSchema>;
/** After validator parse (class always present). */
export type CreateClaimParsed = z.output<typeof createClaimInputSchema>;
```

```ts
// claims.functions.ts
.validator(createClaimInputSchema)
// handler data: CreateClaimParsed → createClaim(data)
```
