# Documentation charter

**What this is:** how Watchdog docs are organized (Diátaxis), page shape, and update rules.  
**What this is not:** product doctrine ([`product.md`](product.md)) or CI gate commands ([`../contributing/ci-gates.md`](../contributing/ci-gates.md)).

## Diátaxis map

| Quadrant | Folder | Purpose | Example |
| --- | --- | --- | --- |
| **Tutorial** | [`../tutorials/`](../tutorials/) | Learning path; guaranteed checkpoints | [`first-investigation.md`](../tutorials/first-investigation.md) |
| **How-to** | [`../how-to/`](../how-to/) | Solve a specific task when you already know the product | [`vault-setup.md`](../how-to/vault-setup.md) |
| **Reference** | [`../reference/`](../reference/) | Facts: APIs, types, UI atoms, contracts | [`../reference/platform/types.md`](../reference/platform/types.md) |
| **Explanation** | [`explanation/`](./) | Why and context; IA and journeys | [`product.md`](product.md), [`ux.md`](ux.md), [`scenarios.md`](scenarios.md) |

**Contributing** (`contributing/`) is how-to for repo contributors (tests, gates).

Do not mix quadrants on one page. Move explanation out of reference; move step lists out of explanation.

## Page template

Every durable leaf should include:

1. **Scope** — `What this is` / `What this is not` (one line each).
2. **Body** — content for that quadrant only.
3. **Next steps** — 2–4 links forward (tutorial → how-to → reference).
4. **See also** — related explanation or contracts.

Hub pages (`README.md` indexes) may omit Next steps if the table is the router.

## When to update which doc

| Change | Touch |
| --- | --- |
| New/changed product route or journey | [`scenarios.md`](scenarios.md) + [`ux.md`](ux.md) if IA/copy shifts |
| Platform invariant (ingress, custody, agent write) | [`../reference/contracts/`](../reference/contracts/README.md) only; link elsewhere |
| Cap id / D1–D5 / ship gate | [`../reference/platform/caps-lexicon.md`](../reference/platform/caps-lexicon.md) |
| Web UI atom / loading / DS ban | [`../reference/web/`](../reference/web/README.md) |
| OpenAPI / `wd` verb | [`../how-to/agent-cli.md`](../how-to/agent-cli.md) + regen client |
| Code change under doc-affect map | Mapped doc(s) in same commit or `docs:allow-affect — reason` |

`scenarios.md` is the honesty index for end-to-end journeys (`shipped` / `partial` / `missing` / `lying`). Walk the path before marking `shipped`.

## Gates

| Command                           | Role                               |
| --------------------------------- | ---------------------------------- |
| `pnpm check:docs:strict`          | Links, index coverage, leaf length |
| `pnpm check:docs-affected:strict` | Code ↔ doc coupling                |

See [`../contributing/ci-gates.md`](../contributing/ci-gates.md).

## See also

- Docs index: [`../README.md`](../README.md)
- Agent/CLI hub: [`../how-to/agent-cli.md`](../how-to/agent-cli.md)
- Troubleshooting: [`../how-to/troubleshooting.md`](../how-to/troubleshooting.md)
