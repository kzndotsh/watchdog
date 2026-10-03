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

Failures on the API, CLI and worker edges are tagged `NotFoundError` / `ConflictError` / `InvalidError` / `ForbiddenError` / `InternalError` (same codes as `DomainError`). `InvalidError` is caller-fixable input (HTTP 400). `InternalError` is a server-side failure (failed write, queue driver): HTTP 500 with a generic message, its reason and cause going only to the request log.

## Org isolation

Cases are org-scoped. Case-child reads and writes that take `caseId` resolve against the actor's organization; a foreign-org Case is **`not_found`** (no distinct wrong-org error). Missing org context on the session or API key is **403**. Ids of another org's children (entity, claim, evidence, job, proposal) passed under your own Case are rejected too. The live-events stream re-checks membership on every heartbeat.

Enforced by `packages/api/src/__tests__/org-isolation.int.test.ts`, which attacks a hardcoded list of case-scoped procedures both ways. Guidance: add every new case-scoped procedure to that list; nothing enumerates the router to check completeness.
