-- ADR-0005 S6: Recent activity reads only the log, so the Evidence, Proposals
-- and Jobs that existed before their slices shipped (S2, S3) need entries or
-- they would vanish from the feed. This is the partial backfill of ADR decision
-- 9, in SQL: the last 90 days (ACTIVITY_RETENTION_DAYS) of the rows the feed
-- showed, as the entries their own write paths append today.
--
-- Backfilled rows carry xid 0: readable immediately and below every live
-- cursor (a transaction id is never 0), so no tailer or replay treats them as
-- new. The trigger is off for the copy so it does not send one NOTIFY per row
-- (nothing needs waking: no consumer reads xid 0). Idempotent: a row is only
-- inserted when the log has no entry with the same kind, subject and action,
-- so a re-run, or a row that already appended its own entry, adds nothing.
-- Not backfilled (not reconstructable, ADR decision 9): Evidence restore and
-- attach, hidden Evidence (it was never in the feed), Graph rows, Task edits.
ALTER TABLE "activity" DISABLE TRIGGER "activity_notify_trg";
--> statement-breakpoint
-- Evidence: `captured` at captured_at. The label is evidenceDisplayLabel in SQL:
-- the user label, else the source URL's host (the raw URL when it has none),
-- else the kind's display label.
INSERT INTO "activity" ("xid", "case_id", "kind", "action", "subject_id", "label", "actor_id", "actor_label", "created_at")
SELECT '0'::xid8, e."case_id", 'evidence', 'captured', e."id",
  left(
    coalesce(
      nullif(btrim(e."label"), ''),
      lower(substring(btrim(e."source_url") from '^[A-Za-z][A-Za-z0-9+.-]*://(?:[^/?#@]*@)?([^/?#:]+)')),
      nullif(btrim(e."source_url"), ''),
      CASE e."kind"
        WHEN 'file' THEN 'File'
        WHEN 'url_archive' THEN 'URL Archive'
        WHEN 'attestation' THEN 'Attestation'
        ELSE 'Other'
      END
    ),
    200
  ),
  e."actor_id", e."actor_label", e."captured_at"
FROM "evidence" e
WHERE e."deleted_at" IS NULL
  AND e."captured_at" > now() - interval '90 days'
  AND NOT EXISTS (
    SELECT 1 FROM "activity" a
    WHERE a."kind" = 'evidence' AND a."action" = 'captured' AND a."subject_id" = e."id"
  )
ORDER BY e."captured_at", e."id";
--> statement-breakpoint
-- Proposals: `created` at created_at (the actor is the agent for an agent
-- Proposal and null for a Cap Job, as the write path records it), then
-- `accepted` / `rejected` at decided_at. Labels stay null: they are resolved
-- on read from the Proposal.
INSERT INTO "activity" ("xid", "case_id", "kind", "action", "subject_id", "actor_id", "created_at")
SELECT '0'::xid8, p."case_id", 'proposal', 'created', p."id",
  CASE WHEN p."agent_sourced" THEN p."created_by" END, p."created_at"
FROM "proposals" p
WHERE p."created_at" > now() - interval '90 days'
  AND NOT EXISTS (
    SELECT 1 FROM "activity" a
    WHERE a."kind" = 'proposal' AND a."action" = 'created' AND a."subject_id" = p."id"
  )
ORDER BY p."created_at", p."id";
--> statement-breakpoint
INSERT INTO "activity" ("xid", "case_id", "kind", "action", "subject_id", "actor_id", "from_value", "to_value", "created_at")
SELECT '0'::xid8, p."case_id", 'proposal', p."status", p."id", p."decided_by", 'pending', p."status", p."decided_at"
FROM "proposals" p
WHERE p."status" IN ('accepted', 'rejected')
  AND p."decided_at" IS NOT NULL
  AND p."decided_at" > now() - interval '90 days'
  AND NOT EXISTS (
    SELECT 1 FROM "activity" a
    WHERE a."kind" = 'proposal' AND a."action" = p."status" AND a."subject_id" = p."id"
  )
ORDER BY p."decided_at", p."id";
--> statement-breakpoint
-- Jobs: `queued` at created_at, `running` at started_at, the terminal status at
-- finished_at (updated_at when a cancelled Job never got one). The group is the
-- playbook run, so a run collapses to one row as it does for live entries; the
-- label is null (resolved on read from the Job).
INSERT INTO "activity" ("xid", "case_id", "kind", "action", "subject_id", "group_id", "actor_id", "actor_label", "to_value", "created_at")
SELECT '0'::xid8, j."case_id", 'job', 'queued', j."id", j."playbook_run_id", j."actor_id", j."actor_label", 'queued', j."created_at"
FROM "jobs" j
WHERE j."created_at" > now() - interval '90 days'
  AND NOT EXISTS (
    SELECT 1 FROM "activity" a
    WHERE a."kind" = 'job' AND a."action" = 'queued' AND a."subject_id" = j."id"
  )
ORDER BY j."created_at", j."id";
--> statement-breakpoint
INSERT INTO "activity" ("xid", "case_id", "kind", "action", "subject_id", "group_id", "actor_id", "actor_label", "to_value", "created_at")
SELECT '0'::xid8, j."case_id", 'job', 'running', j."id", j."playbook_run_id", j."actor_id", j."actor_label", 'running', j."started_at"
FROM "jobs" j
WHERE j."started_at" IS NOT NULL
  AND j."started_at" > now() - interval '90 days'
  AND NOT EXISTS (
    SELECT 1 FROM "activity" a
    WHERE a."kind" = 'job' AND a."action" = 'running' AND a."subject_id" = j."id"
  )
ORDER BY j."started_at", j."id";
--> statement-breakpoint
INSERT INTO "activity" ("xid", "case_id", "kind", "action", "subject_id", "group_id", "actor_id", "actor_label", "to_value", "created_at")
SELECT '0'::xid8, j."case_id", 'job', j."status", j."id", j."playbook_run_id", j."actor_id", j."actor_label", j."status", coalesce(j."finished_at", j."updated_at")
FROM "jobs" j
WHERE j."status" IN ('succeeded', 'failed', 'cancelled')
  AND coalesce(j."finished_at", j."updated_at") > now() - interval '90 days'
  AND NOT EXISTS (
    SELECT 1 FROM "activity" a
    WHERE a."kind" = 'job' AND a."action" = j."status" AND a."subject_id" = j."id"
  )
ORDER BY coalesce(j."finished_at", j."updated_at"), j."id";
--> statement-breakpoint
ALTER TABLE "activity" ENABLE TRIGGER "activity_notify_trg";
