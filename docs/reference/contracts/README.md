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
| `AbortedError` | `aborted` | `tools` | internal-only |
| `BenignDnsError` | `dns_benign` | `tools` | internal-only |
| `RateLimitedOutputError` | `rate_limited_output` | `ai` | internal-only |
| `InvalidOutputError` | `invalid_output` | `ai` | internal-only |

The five API-visible codes are the first table; the vendor mapping is `toDomainTag` in `packages/core/src/infra/vendor-errors.ts`.

**CLI breaking change.** The CLI JSON envelope `error.code` for tagged errors is now the stable code: `not_found`, `conflict`, `invalid`, `forbidden`, `internal`. It was `NOT_FOUND`, `CONFLICT`, `BAD_REQUEST` (and the equivalent upper-case transport codes for the others). Scripts that match on `error.code` must be updated.

The API (`toOrpcError`) returns the code in the oRPC error `data` (`{ "code": "conflict" }`) next to the safe `message`; `not_found` data also carries `entity` (a domain noun such as `Case` or `Claim`) and `id` (the value the caller sent, never another organization's record); the transport `code` (`NOT_FOUND`, ...) is unchanged. The CLI prints the stable code as `error.code` with the message; `WD_CLI_DEBUG=1` also prints the stack and, when present, the cause to stderr (local only).

## Org isolation

Cases are org-scoped. Case-child reads and writes that take `caseId` resolve against the actor's organization; a foreign-org Case is **`not_found`** (no distinct wrong-org error). Missing org context on the session or API key is **403**. Ids of another org's children (entity, claim, evidence, job, proposal) passed under your own Case are rejected too. The live-events stream re-checks membership on every heartbeat.

Enforced by `packages/api/src/__tests__/org-isolation.int.test.ts`, which attacks a hardcoded list of case-scoped procedures both ways. Guidance: add every new case-scoped procedure to that list; nothing enumerates the router to check completeness.
