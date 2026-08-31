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

## See also

- Documentation charter: [`../../explanation/documentation.md`](../../explanation/documentation.md)
- Tutorial: [`../../tutorials/first-investigation.md`](../../tutorials/first-investigation.md)
