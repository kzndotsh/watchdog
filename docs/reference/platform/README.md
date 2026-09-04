# Platform architecture

Hub for package layout, jobs/oRPC/evlog, and Caps/Intake/Export. Split leaves below are SoT.

| Doc | Owns |
| --- | --- |
| [`packages.md`](packages.md) | Import direction / package matrix |
| [`jobs-orpc.md`](jobs-orpc.md) | Jobs path, oRPC, process logging |
| [`caps-boundary.md`](caps-boundary.md) | Caps SPI, credentials, Intake, Export, vocab pointer |
| [`types.md`](types.md) | Schema / Zod ownership |
| [`caps-lexicon.md`](caps-lexicon.md) | Cap id/title/kind, D1-D5 |
| [`graph-model.md`](graph-model.md) | Entity / evidence / patch model |
| [`../contracts/`](../contracts/README.md) | Ingress, custody, agent writes, evlog contracts |

Runtime failures on API/CLI/worker edges use tagged `NotFoundError` / `ConflictError` / `InvalidError` / `ForbiddenError` (same codes as `DomainError`). Ingress and custody contracts are unchanged.

**Not:** TanStack Start chrome or Query/SSE. That lives under [`docs/reference/web/`](../web/README.md).
