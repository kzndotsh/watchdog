# Custody contract

**What this is:** Accept confidence tiers and write gates for Graph mutations.  
**What this is not:** Triage UI chrome ([web domains](../web/domains.md)), schema Zod details ([`../platform/types.md`](../platform/types.md)).

## Accept tiers

Platform Accept tiers: **`unverified` / `possible` / `confirmed`**.

- Cap/agent output stays **`unverified`** until human Accept.
- CLI/agent graph writes land at **`unverified`** only; CLI refuses `confidence=confirmed`.
- **`confirmed`** requires human Accept (Triage) or Dossier with evidence gates: never Cap/agent alone. The rule and its message have one home, `packages/policy/src/confirmed-evidence.ts` (`confirmedNeedsEvidence`, `CONFIRMED_REQUIRES_EVIDENCE`; browser subpath `@watchdog/policy/confirmed-evidence`). Callers count the Evidence (attachments, linked job Evidence, an attestation) and pass the total; the message text is never copied (`watchdog/no-reimplemented-custody-message` fails a copy; import `CONFIRMED_REQUIRES_EVIDENCE`).

## Identifier / patch gates

- Invalid Identifier ops **block** Accept (`listInvalidIdentifierOps`).
- Identifier collisions **warn** (Alert + chip); Accept still allowed.
- Custody helpers live in `@watchdog/policy` (`assertPatchGates`, `patchNeedsConfidence`, `childWriteViolation` for the agent/CLI child-write rule shared by API and CLI): pure, DB-free. Browser UI imports `patchNeedsConfidence` from `@watchdog/policy/patch-needs-confidence` only (package root pulls Effect-tagged gates into the client).

Enforced by: the patch schema rejects `confidence` on claim/identifier/edge ops (`packages/schemas/src/patch.ts`), `assertPatchGates` in `@watchdog/policy`, the core write gate (`validateIdentifierWrite`), and CLI custody envelopes (`apps/cli`). Collisions are annotated on `ProposalRecord.identifierCollisions` by core when listing Proposals. The browser-import rule is enforced only by the package exports map; no lint rule.

## Attribution and history

Every Graph row (Entity, Edge, Claim, Identifier, Event, Question) and every Task records who created it and who last changed it, and every change is kept (issue #303).

- **Who.** `created_by` / `updated_by` on the row hold the user id (an API key's write records the key's user; the key's `api-key:...` snapshot is on the history row). `NULL` means no recorded author: a row that predates attribution with no activity entry naming its author (the backfill `backfill_graph_attribution` fills the rest from the activity log, which is pruned after 90 days), or a write with no caller. A column, not a sentinel string, so an unknown author can never read as a user.
- **History.** `graph_history` is one append-only table: Case id, row kind and id, op (`create | update | retract | delete`), channel (`dossier | triage_accept | agent_write | system`), actor id and key label, time, and full-row `before` / `after` snapshots (JSONB; a Claim, Identifier or Edge snapshot also carries its `evidenceIds`). Snapshots, not diffs: any past state reads without replaying, and the list API derives the changed fields. The link tables carry no state of their own, so they have no history; a change to a row's evidence set shows in that row's snapshots.
- **Same transaction, one function.** Every Graph write path calls `appendGraphActivityEffect` (`packages/core/src/graph/graph-activity.ts`) inside its `transact`; it appends the activity entry and the history row on the same `tx`, so a rolled-back write leaves neither. `history` is a required argument for every Graph kind, and `graph-activity-gate.test.ts` fails a mutation that does not call it. The row is locked `FOR NO KEY UPDATE` (what an UPDATE takes: not `FOR UPDATE`, which would block the foreign-key checks of rows inserted under it and can deadlock with the Case lock) and captured before the write (`captureGraphRowEffect`), so two concurrent edits chain (`v0 -> v1`, `v1 -> v2`). Deleting an Entity also records a `delete` for every Claim, Identifier, Event, Question and Edge it cascades to and an `update` for each Task it unlinks.
- **Never pruned while the Case exists.** No prune job touches it. Migration `protect_graph_history` installs a trigger that refuses `UPDATE` for every role and `DELETE` while the Case exists (the Case's own `ON DELETE CASCADE` is the only way rows leave, so a purge takes the history with it), and revokes `UPDATE` / `DELETE` from the app role `watchdog_app` where it exists (`init.sql`, `scripts/ensure-test-db.sh`, which repeats the revoke after its blanket grant). `TRUNCATE` (`just wipe`) is an operator action and is not blocked.
- **Not recorded.** Rows the demo seed and the test seeds write straight through repos; Evidence (forensic on its own: hash, source, activity entries); the link tables' own rows.
- **Read.** `history.list` (oRPC, `GET /cases/{caseId}/history`): one row's history, newest first, organization- and Case-scoped, cursor-paginated (`limit` at most 100, a larger one is rejected), with the live row's creator and last editor. The Dossier shows it per row in a popover.

## Breach caveat

Treat a breach hit as evidence that a record exists in a dump, not as proof the person controls the account. Adversarial-test every identity link before proposing it (guidance; nothing enforces it). Cap D5: [`../platform/caps-lexicon.md`](../platform/caps-lexicon.md).
