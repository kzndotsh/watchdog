-- #302: the JSON Evidence-id arrays are gone. 0024 copied every resolvable id into
-- job_evidence / proposal_evidence, 0025 refused to continue while any id was left over, and the
-- code reads and writes the link tables since the same release, so nothing is lost here.
ALTER TABLE "jobs" DROP COLUMN "evidence_ids";--> statement-breakpoint
ALTER TABLE "proposals" DROP COLUMN "evidence_ids";