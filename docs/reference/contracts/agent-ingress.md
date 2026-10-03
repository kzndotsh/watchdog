# Agent ingress contract

**What this is:** how CLI/API agents propose or write Graph under explicit override.  
**What this is not:** Cap Job path ([`../platform/caps-boundary.md`](../platform/caps-boundary.md)), custody tiers ([`custody.md`](custody.md)).

## Default: propose

- `POST …/proposals` / `wd proposals create` → pending Proposal (`agentSourced` + `createdBy`).
- Shares Cap `proposeStage` + finding suppression.
- Prefer proposals when unsure.

## Escape hatch: graph write

- `POST …/graph/write` / `wd graph write` with body `userOverride: true` (CLI verb _is_ the hatch: no boolean flag).
- Lands Graph @ **`unverified`** + `graph_writes` row in the **same tx** as `applyPatch`.
- Optional `idempotencyKey` (replay returns `replayed: true`, `opCount: 0`).
- No Proposal on this path.

## Child writes

- `wd claims|identifiers|edges|events|questions …` require **`--user-override`**.
- CLI **refuses `confidence=confirmed`** (Triage Accept / Dossier may set `confirmed`).
- `caseId` must belong to the actor’s organization; foreign-org Case → **`not_found`**.

## Pure prep

- `parseAgentPatch` + `assertPatchShape` (policy). Cap Jobs still set `agentSourced=false`.
- CLI output: compact JSON by default; see [`apps/cli/AGENTS.md`](../../../apps/cli/AGENTS.md).

## Enforced by

oRPC `graphChildWrite` middleware and the CLI custody envelopes (`apps/cli`, unit-tested); `graph_writes` atomicity and `idempotencyKey` replay by `packages/api` integration tests. Cap Jobs and agents share `proposeStage` finding suppression (see [`../platform/caps-boundary.md`](../platform/caps-boundary.md)). This page is the single home for these rules; other docs link here.
