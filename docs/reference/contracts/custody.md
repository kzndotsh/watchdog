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

- **Who.** `created_by` / `updated_by` on the row hold the user id (an API key's write records the key's user; the key's `api-key:...` snapshot is on the history row). `NULL` means no recorded author: a row that predates attribution with no activity entry naming its author (the backfill `backfill_graph_attribution` fills the rest from the activity log, which is pruned after 90 days; a row whose newest entry was a system write stays `NULL`), or a write with no caller. A column, not a sentinel string, so an unknown author can never read as a user.
- **History.** `graph_history` is one append-only table: Case id, row kind and id, op (`create | update | retract | delete`), channel (`dossier | triage_accept | agent_write | system`), actor id and key label, time, and full-row `before` / `after` snapshots (JSONB, the database's `to_jsonb` of the row; a Claim, Identifier or Edge snapshot also carries its `evidence_ids`). Snapshots, not diffs: any past state reads without replaying; the API derives `changedFields` and returns camelCase keys. A change to the Evidence a Claim, Identifier or Edge cites is an `update` of that row (one row per link statement).
- **Written by the database, not by the application.** AFTER INSERT / UPDATE / DELETE row triggers on the seven Graph tables (migration `graph_history_triggers`) write the history, so no write path can skip it, and a cascade (an Entity delete removing its Claims, a SET NULL on a Task) or a seed or a statement typed in psql is recorded by Postgres itself, in the same transaction as the change (a rollback leaves nothing). An UPDATE that changes only `updated_at` / `updated_by` records nothing; a Claim turning `retracted` is op `retract`.
- **Who and how: three transaction-local settings.** `setHistoryContextEffect(tx, { actorId, actorLabel, channel })` (`packages/core/src/graph/graph-activity.ts`) runs first in every Graph write transaction and sets `watchdog.actor_id`, `watchdog.actor_label`, `watchdog.channel` (`set_config(..., true)`: they end with the transaction). The triggers read them for the history row and fill `created_by` / `updated_by` from the same actor (a statement that sets an author itself, such as a data migration backfilling it, keeps what it set). A write with no settings is channel `system` with no actor: seeds, migrations and manual SQL are recorded, honestly attributed to no one. The settings are a claim by the writer, as the actor in an activity entry always was; the trigger cannot check them.
- **Never pruned while the Case exists.** No prune job touches it. `UPDATE` is refused for every role; `DELETE` is refused while the Case exists (the Case's own `ON DELETE CASCADE` is the only way rows leave, so a purge takes the history with it); `TRUNCATE` is refused unless the transaction opts in with `SET LOCAL watchdog.allow_history_truncate = 'on'` (`just wipe` does; the test resets delete Cases instead). Every function pins `search_path = pg_catalog, pg_temp` and qualifies every relation with `public.`, so a session cannot shadow `cases` with a temp table, and the functions that write the table are `SECURITY DEFINER`.
- **Roles.** Where the dev/CI app role `watchdog_app` exists (`docker/postgres/init.sql`, `scripts/ensure-test-db.sh`, which repeats it after its blanket grant) the migration leaves it `SELECT` on `graph_history` and nothing else (no INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES). **A single-superuser install is not tamper-resistant:** the role that owns the tables can drop the triggers and rewrite anything. It becomes so when the app runs as a role that owns nothing (the planned app/owner role split); the triggers, the pinned `search_path` and the revokes are already correct for both setups.
- **Not recorded.** Evidence (forensic on its own: hash, source, activity entries) and the link rows themselves; a Case update (a Case is not a Graph row). A future data migration that UPDATEs a Graph table records `system` rows and clears `updated_by` unless it sets it.
- **Read.** `history.list` (oRPC, `GET /cases/{caseId}/history`): one row's history, newest first, organization- and Case-scoped, cursor-paginated (`limit` at most 100, a larger one is rejected), with the live row's creator and last editor. The Dossier shows it per row in a popover.

## Breach caveat

Treat a breach hit as evidence that a record exists in a dump, not as proof the person controls the account. Adversarial-test every identity link before proposing it (guidance; nothing enforces it). Cap D5: [`../platform/caps-lexicon.md`](../platform/caps-lexicon.md).
