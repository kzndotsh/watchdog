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
| A conditional update lost a race, a unique key is taken, the record is already in the target state | `ConflictError({ reason })` | `missedUpdateEffect` picks Conflict vs NotFound after a missed conditional update; unique violations map through `tryDb` options |
| The caller is known but the request is refused by a gate (third-party egress off, no credential for the Cap) | `ForbiddenError({ reason })` | Custody refusals reach clients as `InvalidError` (`mapCustody`), see [`custody.md`](custody.md) |
| A write that must return a row returned none, or a row just written cannot be read back | `InternalError({ reason })` | A fixed `Failed to <what>` sentence, never sent to the client (a Job failure stores it on the Job row); use the shared `requireWritten` wrapper where core provides it (see `packages/core/AGENTS.md`) instead of hand-writing it |
| The job queue, database driver, blob store or any other infrastructure failed | `InternalError({ reason, cause })` | Keep driver text in `cause`; the client always sees `Internal server error` |
| A tool failed in a way it did not classify (network, runtime) | nothing: let it throw. `mapToolsCatch` classifies by class, never by message text: abort signals are rethrown as defects, any other non-tag `Error` becomes `UnexpectedToolError`, which core maps to `InternalError` with the original as `cause` | Do not catch it to build an `InvalidError`: that would answer a server fault as a 400 |
| A tool or Cap rejected its input or an upstream answer | `ValidationVendorError({ message, cause? })` | `message` is client-visible (it becomes the `InvalidError` reason) and is stored in the Job failure text: a fixed sentence. `cause` is logged (API request log, `logJobFailureCause`), so it holds upstream diagnostics only (status, error class; `upstreamDiagnostic`), never the caller's input or free upstream text that can echo it |
| Cooperative cancellation | `AbortedError` | A defect, never a typed failure |

A new failure type needs a new tag only when callers must tell it apart by `code`: add the class (ends in `Error`, unique `code`), map it in `toOrpcError` or `toDomainTag`, and add its row to the tables here in the same change.

Every other tagged error is internal-only: it is mapped to one of the five tags above (or logged) before it can reach an API response, so its `code` is never returned to a client. The gate `check:tagged-errors` requires each class to end in `Error` and declare a unique `code`.

| Tag | `code` | Package | Reaches the client as |
| --- | --- | --- | --- |
| `CustodyViolationError` | `custody_violation` | `policy` | `InvalidError` (`mapCustody` in patch apply) |
| `VaultError` | `vault` | `core` | internal-only |
| `ExportIOError` | `export_io` | `core` | internal-only |
| `NotifyError` | `notify_failed` | `core` | internal-only |
| `ScratchIOError` | `scratch_io` | `core` | internal-only |
| `ScratchCleanupError` | `scratch_cleanup` | `core` | internal-only |
| `WorkerBossError` | `worker_boss` | `worker` | internal-only |
| `WorkerListenError` | `worker_listen` | `worker` | internal-only |
| `RateLimitedError` | `rate_limited` | `tools` | `InternalError` |
| `HttpVendorError` | `vendor_http` | `tools` | `InternalError` |
| `ParseVendorError` | `vendor_parse` | `tools` | `InternalError` |
| `MissingCredentialError` | `missing_credential` | `tools` | `InvalidError` |
| `ValidationVendorError` | `vendor_validation` | `tools` | `InvalidError` |
| `UnexpectedToolError` | `tool_unexpected` | `tools` | `InternalError` (any non-tag, non-abort `Error` thrown in a tool; the original is `cause`; the message is a fixed sentence) |
| `AbortedError` | `aborted` | `tools` | internal-only |
| `BenignDnsError` | `dns_benign` | `tools` | internal-only |
| `RateLimitedOutputError` | `rate_limited_output` | `ai` | internal-only |
| `InvalidOutputError` | `invalid_output` | `ai` | internal-only |

The five API-visible codes are the first table; the vendor mapping is `toDomainTag` in `packages/core/src/infra/vendor-errors.ts`.

**CLI breaking change.** The CLI JSON envelope `error.code` for tagged errors is now the stable code: `not_found`, `conflict`, `invalid`, `forbidden`, `internal`. It was `NOT_FOUND`, `CONFLICT`, `BAD_REQUEST` (and the equivalent upper-case transport codes for the others). Scripts that match on `error.code` must be updated.

The API (`toOrpcError`) returns the code in the oRPC error `data` (`{ "code": "conflict" }`) next to the safe `message`; `not_found` data also carries `entity` (a domain noun such as `Case` or `Claim`) and `id` (the value the caller sent, never another organization's record); the transport `code` (`NOT_FOUND`, ...) is unchanged. Every procedure declares these errors (`apiErrorMap` in `packages/api/src/error-map.ts`), so the generated OpenAPI spec lists them and the client types them: `const [error] = await safe(client.cases.get(...)); if (error && isDefinedError(error)) error.data.code` is the union `"not_found" | "conflict" | "invalid" | "forbidden" | "internal"`, and branching on `error.code` (`NOT_FOUND`, ...) narrows it to one. Mapped errors are sent `defined: true`; `withStableCode` gives the errors oRPC raises itself (input or output validation, unrecognized defects) the same `data.code` (`invalid`, `internal`), so the type holds for them too. `UNAUTHORIZED` stays outside the map. The CLI prints the stable code as `error.code` with the message; `WD_CLI_DEBUG=1` also prints the stack and, when present, the cause to stderr (local only).

## Org isolation

Cases are org-scoped. Case-child reads and writes that take `caseId` resolve against the actor's organization; a foreign-org Case is **`not_found`** (no distinct wrong-org error). Missing org context on the session or API key is **403**. Ids of another org's children (entity, claim, evidence, job, proposal) passed under your own Case are rejected too. The live-events stream re-checks membership on every heartbeat.

Enforced by `packages/api/src/__tests__/org-isolation.int.test.ts`, which attacks a hardcoded list of case-scoped procedures both ways. Guidance: add every new case-scoped procedure to that list; nothing enumerates the router to check completeness.
