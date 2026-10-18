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

## Database invariants

Postgres refuses these on its own, so a bug in application code cannot store them (tests: `packages/db/src/__tests__/vocabulary-checks.int.test.ts`, `same-case-integrity.int.test.ts`; migrations `0023` to `0028`):

- **Vocabulary.** Every status, kind, confidence, predicate and channel column has a `CHECK` generated from `@watchdog/schemas` (table in [`types`](../platform/types.md#vocabulary-constraints-in-postgres)). A value outside the vocabulary is a `23514` check violation.
- **Same Case.** Claims, Identifiers, Events, Questions and Edges carry `case_id`, and a composite foreign key `(entity_id, case_id)` into `entities (id, case_id)` (an Edge has one per end, `from_id` and `to_id`) means a row cannot name an Entity of another Case. Every Evidence link table (`claim_evidence`, `identifier_evidence`, `edge_evidence`, `proposal_evidence`, `job_evidence`) carries `case_id` with two composite keys, `(parent_id, case_id)` and `(evidence_id, case_id)`, so the parent and the Evidence must both be in the link's Case. `evidence.entity_id` and `tasks.entity_id` are held to the same Case the same way. A cross-Case row is a `23503` foreign key violation.
- **Evidence ids on Proposals and Jobs** are rows in `proposal_evidence` and `job_evidence` (position-ordered, real foreign keys), not JSON arrays. The API still returns `evidenceIds` arrays, read from the link tables in the same statement.
- **Deleting.** Claim, Identifier and Edge links go with either end (`on delete cascade`). Proposal and Job links go with their Proposal or Job but **restrict** the Evidence end: Evidence is forensic, so a hard delete of Evidence that a Proposal or Job still cites is refused (`23001`). The application never hard-deletes Evidence (it sets `deleted_at`). A Case delete still removes everything, Evidence included: a `BEFORE DELETE` trigger on `cases` (`evidence_links_before_case_delete`, migration 0027) removes the Case's Proposal and Job links first, because Postgres checks a restrict when the cascaded Evidence delete finishes, before the cascade reaches the Job. Deleting an Entity clears `evidence.entity_id` and `tasks.entity_id` (`ON DELETE SET NULL ("entity_id")`: the Case id stays) and removes the rows that hang off it.
- **By design still JSON, without a foreign key:** the Evidence ids inside `proposals.patch` and `graph_writes.patch` (`PatchOp.evidenceIds`). A patch is the record of what was proposed or written; Accept and the agent write path check those ids against the Case before the Graph rows and their links are created.

Not enforced by Postgres (still application rules): `confirmed` needs Evidence (above), the Entity-kind pairs an Edge predicate allows, the `(kind, verb)` pairing of the activity log, and the Case of `proposals.job_id`, `jobs.playbook_run_id`, `jobs.retry_of_job_id` and `finding_suppressions.proposal_id` (soft or single-column references). An install with rows that break a rule above stops at migration `0025`, which lists them; see [`upgrade`](../../how-to/upgrade.md#when-a-migration-refuses-database-invariants).

## Breach caveat

Treat a breach hit as evidence that a record exists in a dump, not as proof the person controls the account. Adversarial-test every identity link before proposing it (guidance; nothing enforces it). Cap D5: [`../platform/caps-lexicon.md`](../platform/caps-lexicon.md).
