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
| `NotFoundError` | `not_found` | 404 | the not-found text |
| `ConflictError` | `conflict` | 409 | the reason |
| `InvalidError` | `invalid` | 400 | the reason (caller-fixable input only) |
| `ForbiddenError` | `forbidden` | 403 | the reason |
| `InternalError` | `internal` | 500 | fixed `Internal server error`; reason and cause go only to the request log |

The API (`toOrpcError`) returns the code in the oRPC error `data` (`{ "code": "not_found" }`) next to the safe `message`; the transport `code` (`NOT_FOUND`, ...) is unchanged. The CLI prints the stable code as `error.code` with the message; `WD_CLI_DEBUG=1` also prints the stack and, when present, the cause to stderr (local only).

## Org isolation

Cases are org-scoped. Case-child reads and writes that take `caseId` resolve against the actor's organization; a foreign-org Case is **`not_found`** (no distinct wrong-org error). Missing org context on the session or API key is **403**. Ids of another org's children (entity, claim, evidence, job, proposal) passed under your own Case are rejected too. The live-events stream re-checks membership on every heartbeat.

Enforced by `packages/api/src/__tests__/org-isolation.int.test.ts`, which attacks a hardcoded list of case-scoped procedures both ways. Guidance: add every new case-scoped procedure to that list; nothing enumerates the router to check completeness.
