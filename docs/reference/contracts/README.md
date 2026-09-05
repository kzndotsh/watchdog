# Platform contracts

Canonical platform invariants. Elsewhere: **link only** — do not restate.

## When to read which

| You are… | Start here |
| --- | --- |
| Adding Collect / Process / Cap code | [`ingress.md`](ingress.md) |
| Setting confidence, Accept, or confirmed gates | [`custody.md`](custody.md) |
| Building CLI/API agent flows | [`agent-ingress.md`](agent-ingress.md) |
| Adding logs or debugging worker/web | [`evlog.md`](evlog.md) |

Product nouns and investigator loop: [`../../explanation/product.md`](../../explanation/product.md). Graph enums and patch shape: [`../platform/types.md`](../platform/types.md).

## Index

| Doc | Owns |
| --- | --- |
| [`ingress.md`](ingress.md) | Collect → Evidence → Proposal → Triage → Graph |
| [`custody.md`](custody.md) | Accept tiers, confirmed gates, breach caveats |
| [`agent-ingress.md`](agent-ingress.md) | CLI/API propose vs `userOverride` graph write |
| [`evlog.md`](evlog.md) | Process logging rules |

Runtime errors on the API/CLI/worker edge are tagged `NotFoundError` / `ConflictError` / `InvalidError` / `ForbiddenError` (same codes as `DomainError`). Ingress and custody contracts are unchanged.

**Org isolation:** Cases are org-scoped. Case-child reads/writes that take `caseId` must resolve against the actor’s organization; a foreign-org Case is **`not_found`** (no cross-org bleed, no distinct wrong-org error). Missing org context on session/API key is **403**. Product noun: [`../../explanation/product.md`](../../explanation/product.md).

## See also

- Documentation charter: [`../../explanation/documentation.md`](../../explanation/documentation.md)
- Tutorial: [`../../tutorials/first-investigation.md`](../../tutorials/first-investigation.md)
