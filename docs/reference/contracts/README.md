# Platform contracts

Canonical platform invariants. Each rule has one home below; elsewhere, link and do not restate.

| Rule | Home |
| --- | --- |
| Collect, Evidence, Proposal, Triage Accept, Graph | [`ingress.md`](ingress.md) |
| Accept tiers, `confirmed` gates, identifier collisions and invalid values, breach caveat | [`custody.md`](custody.md) |
| CLI/API propose vs `userOverride` graph write | [`agent-ingress.md`](agent-ingress.md) |
| Process logging (evlog) | [`evlog.md`](evlog.md) |
| Error taxonomy, org isolation | this page |

Product nouns and the investigator loop: [`../../explanation/product.md`](../../explanation/product.md). Graph enums and patch shape: [`../platform/types.md`](../platform/types.md).

## Error taxonomy

Failures on the API, CLI and worker edges are tagged errors. Each tag carries a stable `code` literal, unique per tag, typed on the class so `DomainTag["code"]` is a union of distinct literals. Codes are public contract: never rename one once released.

| Tag | `code` | HTTP | Message to the client |
| --- | --- | --- | --- |
| `NotFoundError` | `not_found` | 404 | `<Entity> not found`, derived from its `{ entity, id }` fields |
| `ConflictError` | `conflict` | 409 | the reason |
| `StaleVersionError` | `stale_version` | 409 | `<Entity> changed since you opened it`; `data` also carries `entity`, `id` and `currentVersion` |
| `JobStartLimitError` | `job_start_limited` | 429 | `Job start limit reached for this <organization or API key> (<limit> per <window> s). Try again in <n> s.`; `data` also carries `scope`, `limit`, `windowSeconds` and `retryAfterSeconds`, and the response has a `Retry-After` header |
| `StaleCursorError` | `cursor_stale` | 400 | `This <list> cursor belongs to another sort, filter or search; start again from the first page`: a declared list's cursor reused for another view ([ADR-0007](../../adr/0007-list-standard.md)); a malformed cursor stays `invalid` |
| `InvalidError` | `invalid` | 400 | the reason (caller-fixable input only) |
| `ForbiddenError` | `forbidden` | 403 | the reason |
| `InternalError` | `internal` | 500 | fixed `Internal server error`; reason and cause go only to the request log |

### Which tag to raise

Pick by the situation, not by the HTTP status you want. When two rows seem to fit, the first match wins.

| Situation | Raise | Notes |
| --- | --- | --- |
| The caller sent input it can fix: blank required field, malformed value, unparseable body field, rule it can satisfy (`confirmed` needs Evidence) | `InvalidError({ reason })` | `reason` reaches the client: fixed sentence, never upstream, driver or model text. Caller-input failures from tools are `ValidationVendorError` (maps to this) |
| The caller named a record that is missing, in another organization, or whose id does not parse | `NotFoundError({ entity, id })` | A foreign-organization Case must look exactly like a missing one. Echo the caller's id through `boundEchoedId` |
| An update or delete by caller-supplied id matched no row | `NotFoundError({ entity, id })` | Not `InternalError`: the row legitimately may not exist |
| An update named the `version` of a Graph row the caller last read and the row has moved on (`WHERE id AND version` matched nothing, the row still exists) | `StaleVersionError({ entity, id, currentVersion })` | the Graph mutation module (`graph/mutation/run-graph-mutation.ts`) picks StaleVersion vs NotFound from a re-read after the miss; see [`custody`](custody.md#optimistic-concurrency) |
| A Job start would exceed the organization's or the API key's starts for the window ([`job-start-limits`](../../how-to/job-start-limits.md)) | `JobStartLimitError({ scope, limit, windowSeconds, retryAfterSeconds })` | raised by `takeJobStartEffect` (`jobs/start-limits.ts`) inside the transaction that creates the Job, so a refusal creates and counts nothing. Not `InvalidError`: the caller sent nothing wrong |
| A conditional update lost a race, a unique key is taken, the record is already in the target state | `ConflictError({ reason })` | the Graph mutation module picks Conflict vs NotFound after a missed state-guarded update; unique violations map through `tryDb` options |
| The caller is known but the request is refused by a gate (an egress class the Case does not allow, no credential for the Cap) | `ForbiddenError({ reason })` | Custody refusals reach clients as `InvalidError` (`mapCustody`), see [`custody.md`](custody.md) |
| A write that must return a row returned none, or a row just written cannot be read back | `InternalError({ reason })` | A fixed `Failed to <what>` sentence, never sent to the client (a Job failure stores it on the Job row); use the shared `requireWritten` wrapper where core provides it (see `packages/core/AGENTS.md`) instead of hand-writing it |
| The job queue, database driver, blob store or any other infrastructure failed | `InternalError({ reason, cause })` | Keep driver text in `cause`; the client always sees `Internal server error` |
| A tool failed in a way it did not classify (network, runtime) | nothing: let it throw. `mapToolsCatch` classifies by class, never by message text: abort signals are rethrown as defects, any other non-tag `Error` becomes `UnexpectedToolError`, which core maps to `InternalError` with the original as `cause` | Do not catch it to build an `InvalidError`: that would answer a server fault as a 400 |
| A tool or Cap rejected its input or an upstream answer | `ValidationVendorError({ message, cause? })` | `message` is client-visible (it becomes the `InvalidError` reason) and is stored in the Job failure text: a fixed sentence. `cause` is logged (API request log, `logJobFailureCause`), so it holds upstream diagnostics only (status, error class; `upstreamDiagnostic`), never the caller's input or free upstream text that can echo it |
| Cooperative cancellation | `AbortedError` | A defect, never a typed failure |

A new failure type needs a new tag only when callers must tell it apart by `code`: add the class (ends in `Error`, unique `code`), map it in `toOrpcError` or `toDomainTag`, and add its row to the tables here in the same change.

Every other tagged error is internal-only: it is mapped to one of the tags above (or logged) before it can reach an API response, so its `code` is never returned to a client. The gate `check:tagged-errors` requires each class to end in `Error` and declare a unique `code`.

**Decision (#123): the gate is the uniqueness guarantee; `DomainTag` stays the API tags.** `DomainTag` is the set `toOrpcError` maps exhaustively to transport statuses, so it holds exactly the tags that can reach a client. Widening it to every tag (custody, vault, export, notify, worker, vendor) would force a transport mapping for tags that never leave the server, and a single union cannot live in `core` anyway: `tools`, `ai`, `policy` and `worker` own tags `core` must not depend on. The workspace-wide `check:tagged-errors` scan fails any class that lacks a `code` or reuses one, which covers every package at once; `DomainTag["code"]` is distinct only within the five.

**Unexpected repository failures.** A write that must return a row (or `true`, for evidence-link writes) goes through the one wrapper `requireWritten(what)` (`packages/core/src/infra/postgres-effect.ts`): a miss (`null`, `undefined` or `false`) fails with `InternalError({ reason: "Failed to <what>" })`. The reason is never sent in an API or CLI error response (the client sees the fixed `Internal server error`). It is not private everywhere: a Job that fails in a worker stores `error.message` of its failure on the Job row (`failJobEffect`), which the Jobs API returns, so an `InternalError` reason raised inside a Job (including a vendor-mapped one, whose message can carry upstream text) is visible there; keep reasons fixed sentences and put detail in `cause`. Do not hand-write that error at a call site. A caller-named row that legitimately may not exist (update or delete by id) is `NotFoundError({ entity, id })` instead. A driver exception thrown by the repository is not converted yet: it stays a defect, which the API still answers as a 500.

| Tag | `code` | Package | Reaches the client as |
| --- | --- | --- | --- |
| `CustodyViolationError` | `custody_violation` | `policy` | `InvalidError` (`mapCustody` in patch apply) |
| `VaultError` | `vault` | `core` | internal-only |
| `ExportIOError` | `export_io` | `core` | internal-only |
| `ScratchIOError` | `scratch_io` | `core` | internal-only |
| `ScratchCleanupError` | `scratch_cleanup` | `core` | internal-only |
| `WorkerBossError` | `worker_boss` | `worker` | internal-only |
| `WorkerListenError` | `worker_listen` | `worker` | internal-only |
| `RateLimitedError` | `rate_limited` | `tools` | `InternalError` |
| `HttpVendorError` | `vendor_http` | `tools` | `InternalError` |
| `ParseVendorError` | `vendor_parse` | `tools` | `InternalError` |
| `MissingCredentialError` | `missing_credential` | `tools` | `InvalidError` |
| `ValidationVendorError` | `vendor_validation` | `tools` | `InvalidError` |
| `BlockedTargetError` | `blocked_target` | `tools` | `InvalidError` for a refused caller target; `InternalError` for the server-side reasons (`resolved`, `proxy`, `unproxied`, `undeclared`, `seed`) |
| `OutboundLimitError` | `outbound_limit` | `tools` | `InternalError` |
| `UnexpectedToolError` | `tool_unexpected` | `tools` | `InternalError` (any non-tag, non-abort `Error` thrown in a tool; the original is `cause`; the message is a fixed sentence) |
| `AbortedError` | `aborted` | `tools` | internal-only |
| `RateLimitedOutputError` | `rate_limited_output` | `ai` | internal-only |
| `InvalidOutputError` | `invalid_output` | `ai` | internal-only |

The API-visible codes are the first table; the vendor mapping is `toDomainTag` in `packages/core/src/infra/vendor-errors.ts`.

**CLI breaking change.** The CLI JSON envelope `error.code` for tagged errors is now the stable code: `not_found`, `conflict`, `invalid`, `forbidden`, `internal`. It was `NOT_FOUND`, `CONFLICT`, `BAD_REQUEST` (and the equivalent upper-case transport codes for the others). Scripts that match on `error.code` must be updated.

The API (`toOrpcError`) returns the code in the oRPC error `data` (`{ "code": "conflict" }`) next to the safe `message`; `not_found` data also carries `entity` (a domain noun such as `Case` or `Claim`) and `id` (the value the caller sent, never another organization's record); the transport `code` (`NOT_FOUND`, ...) is unchanged. Every procedure declares these errors (`apiErrorMap` in `packages/api/src/error-map.ts`), so the generated OpenAPI spec lists them and the client types them: `const [error] = await safe(client.cases.get(...)); if (error && isDefinedError(error)) error.data.code` is the union `"not_found" | "conflict" | "stale_version" | "job_start_limited" | "cursor_stale" | "invalid" | "forbidden" | "insufficient_scope" | "internal"`, and branching on `error.code` (`NOT_FOUND`, ...) narrows it to one. Mapped errors are sent `defined: true`; `withStableCode` gives the errors oRPC raises itself (input or output validation, unrecognized defects) the same `data.code` (`invalid`, `internal`), so the type holds for them too. `stale_version` is a second `CONFLICT` arm (`data.entity`, `data.id`, `data.currentVersion`: a Graph update named an out-of-date row version, nothing was written). The error `data` enums that grow with new failure kinds (`entity`, `requiredScope`, `scope`) are `x-extensible-enum` in the OpenAPI contract, not `enum` (`markExtensibleEnums`, `packages/api/src/openapi.ts`), so a new value is not a breaking change: a client handles a value it does not know. `job_start_limited` is the `TOO_MANY_REQUESTS` (429) error: `data.scope` (`organization` or `key`), `data.limit`, `data.windowSeconds` and `data.retryAfterSeconds`; the HTTP response also carries `Retry-After` (the web handler adds `ResponseHeadersPlugin`; a route outside the router uses `jobStartLimitResponse`). `cursor_stale` is a second `BAD_REQUEST` arm (a list cursor issued for another sort, filter set, search or scope; nothing was read, start the view again from its first page). `insufficient_scope` is a second `FORBIDDEN` arm: an API key lacks the scope the action needs (`data.requiredScope`, [`agent-ingress`](agent-ingress.md#key-scopes)). `UNAUTHORIZED` stays outside the map. The CLI prints the stable code as `error.code` with the message; `WD_CLI_DEBUG=1` also prints the stack and, when present, the cause to stderr (local only).

## Org isolation

Cases are org-scoped. Case-child reads and writes that take `caseId` resolve against the actor's organization; a foreign-org Case is **`not_found`** (no distinct wrong-org error). Missing org context on the session or API key is **403**. Ids of another org's children (entity, claim, evidence, job, proposal) passed under your own Case are rejected too. The live-events stream re-checks membership on every heartbeat.

Enforced by `packages/api/src/__tests__/org-isolation.int.test.ts`, which attacks the case-scoped procedures both ways and asserts after each attack that the victim organization's data is unchanged. `org-isolation-coverage.test.ts` (a unit test, no database) walks the router and fails when a procedure is neither in the attack list (`org-isolation-case-attacks.ts`) nor on its allowlist with a reason.

The matrix has a second dimension, the API key scope. `scope-matrix.test.ts` (unit, no database) calls every non-public procedure as a key holding every scope but the one it declares (an empty key for `cases:read`, which any write scope implies) and expects `FORBIDDEN` / `insufficient_scope` naming that scope, and as a key holding every scope on a session-only procedure, expecting `forbidden`. `scope-matrix.int.test.ts` calls each procedure as a key holding exactly its scope (and each `cases:read` procedure as a key holding only one write scope) and expects the call to get past the scope check. Both read the declared `.meta({ scope })`, so a new procedure is covered with no edit ([`agent-ingress`](agent-ingress.md#key-scopes)).
