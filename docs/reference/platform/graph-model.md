# Graph model

**What this is:** entity kinds, evidence lifecycle, patch atoms, edge vocab — Case Graph SoT in Postgres.  
**Not this doc:** full enum tables ([`types.md`](types.md)), ingress/custody contracts ([`../contracts/`](../contracts/README.md)).

## SoT and projections

- **Postgres Case Graph** is the source of truth (entities, identifiers, edges, claims, events, questions).
- **Evidence** (MinIO bytes + metadata) is custody input, not Graph. Collect and file dumps create Evidence; Process/interpret creates **Proposals**; **Triage Accept** applies patch ops to Graph.
- **Case Export** (`export/<case-slug>/`) is a regenerable markdown projection — never edit it as a second SoT. See [`../contracts/ingress.md`](../contracts/ingress.md).

## Entity kinds

Three kinds (`ENTITY_KINDS` in `@watchdog/schemas`):

| Kind     | Typical use                                                  |
| -------- | ------------------------------------------------------------ |
| `person` | Individual subjects                                          |
| `org`    | Companies, groups, registrants                               |
| `infra`  | Domains, hosts, services (as entities, not bare identifiers) |

Entity create seeds default **questions** by kind (today: person). Dossier is the human Graph editor; Cap/Agent paths propose or write under contract.

## Patch atoms

Graph mutations are arrays of **`PatchOp`** (`packages/schemas/src/patch.ts`):

| Field | Meaning |
| --- | --- |
| `op` | `create` · `upsert` · `update` |
| `resource` | `entity` · `identifier` · `edge` · `claim` · `event` · `question` |
| `id` | UUID for the row being created or updated |
| `data` | Resource-specific JSON (no `confidence` on gated resources) |
| `evidenceIds?` | Optional Evidence links on accept |

**Confidence** (`unverified` · `possible` · `confirmed`) is chosen at **Triage Accept** or Dossier write — never in `op.data` for `claim`, `identifier`, or `edge`. `@watchdog/policy` enforces gates; see [`../contracts/custody.md`](../contracts/custody.md).

Parse at the trust edge: `parsePatch` / `tryParsePatch` in `@watchdog/core`. Apply pipeline: `graph/patch/apply-*-op.ts` (one module per resource).

## Identifiers and edges

- **Identifiers** attach to an entity (`type` + `value`, optional `platform` for handles). Values normalize and validate via `validateIdentifierWrite` before Graph write.
- **Edges** use closed **predicates** (`parent_of`, `operates`, `primary_domain`, …) with kind-pair validation in core. UI phrase picker maps to predicate + orientation; Caps send explicit endpoints.
- **Identifier collisions** (same type+value on another entity) warn in Triage but do not block Accept. **Invalid identifier values** block Accept.

Full predicate tables, identifier rules, and vault→platform mapping: [`types.md`](types.md).

## Ingress paths (summary)

| Path | Lands on Graph |
| --- | --- |
| Triage Accept | `@` chosen confidence tier |
| Dossier edit | Human-chosen tier (incl. `confirmed` where allowed) |
| Agent `proposals create` | Pending Proposal only |
| Agent `graph write` + `userOverride` | `@ unverified` + `graph_writes` audit row |

Details: [`../contracts/ingress.md`](../contracts/ingress.md) · [`../contracts/agent-ingress.md`](../contracts/agent-ingress.md).

## Core layout

| Path under `packages/core/src/graph/` | Role |
| --- | --- |
| `entities.ts`, `identifiers.ts`, `edges.ts`, … | Per-resource services |
| `patch/apply-*-op.ts` | Patch apply dispatch |
| `edge-update.ts` | Dossier edge edit validation |
| `apply-identifier-op.ts` | Triage identifier ops |

Worker imports `@watchdog/core/worker`; web/API use the main barrel. See [`packages/core/AGENTS.md`](../../../packages/core/AGENTS.md).
