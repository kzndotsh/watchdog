# Agent ingress contract

**What this is:** how CLI/API agents propose or write Graph under explicit override.  
**What this is not:** Cap Job path ([`../platform/caps-boundary.md`](../platform/caps-boundary.md)), custody tiers ([`custody.md`](custody.md)).

## Default: propose

- `POST …/proposals` / `wd proposals create` → pending Proposal (`agentSourced` + `createdBy`).
- Shares Cap `proposeStage` + finding suppression.
- Prefer proposals when unsure.
- A Proposal leaves `pending` only by a person: `POST …/accept` and `POST …/reject` need a signed-in session and refuse an API key with `FORBIDDEN` (`sessionAuthed`); the CLI has no accept or reject verb. See [`custody`](custody.md).

## Escape hatch: graph write

- `POST …/graph/write` / `wd graph write` with body `userOverride: true` (CLI verb _is_ the hatch: no boolean flag).
- Lands Graph @ **`unverified`** + `graph_writes` row in the **same tx** as `applyPatch`. Each applied op also appends one activity entry (agent as actor) in that tx; the entry is a live-update signal and a log row (Graph entries are not shown in Recent activity), not custody: `graph_writes` stays the complete, un-pruned, idempotent record, and a replayed `idempotencyKey` appends nothing. Each applied op also lands in `graph_history` (written by the database triggers: channel `agent_write`, the acting user, the `api-key:...` display label and the key's id (`actor_key_id`; the activity entry carries it too), `created_by` / `updated_by` on the row), see [`custody`](custody.md#attribution-and-history).
- Optional `idempotencyKey` (replay returns `replayed: true`, `opCount: 0`).
- No Proposal on this path.

## Child writes

- `wd claims|identifiers|edges|events|questions …` require **`--user-override`**.
- CLI **refuses `confidence=confirmed`** (Triage Accept / Dossier may set `confirmed`). The API refuses it for API keys too. Both apply the single rule `childWriteViolation` in `@watchdog/policy` (override first, then confirmed) and only map the violation to `FORBIDDEN` (API) or a `CUSTODY` envelope (CLI).
- `caseId` must belong to the actor’s organization; foreign-org Case → **`not_found`**.

## Pure prep

- `parseAgentPatch` + `assertPatchShape` (policy). Cap Jobs still set `agentSourced=false`.
- CLI output: compact JSON by default; see [`apps/cli/AGENTS.md`](../../../apps/cli/AGENTS.md).

## Enforced by

oRPC `graphChildWrite` middleware and the CLI custody envelopes (`apps/cli`, unit-tested); `sessionAuthed` on `proposals.accept` / `proposals.reject` (key path of the isolation matrix); `graph_writes` atomicity and `idempotencyKey` replay by `packages/api` integration tests. Cap Jobs and agents share `proposeStage` finding suppression (see [`../platform/caps-boundary.md`](../platform/caps-boundary.md)). This page is the single home for these rules; other docs link here.
