DROP INDEX "jobs_playbook_run_step_fan_uq";--> statement-breakpoint
ALTER TABLE "playbook_runs" ADD COLUMN "outcome" text;--> statement-breakpoint
CREATE INDEX "jobs_playbook_run_id_idx" ON "jobs" USING btree ("playbook_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_playbook_run_step_fan_uq" ON "jobs" USING btree ("playbook_run_id","playbook_step","playbook_fan_index") WHERE "jobs"."playbook_run_id" IS NOT NULL AND "jobs"."retry_of_job_id" IS NULL;--> statement-breakpoint
ALTER TABLE "playbook_runs" ADD CONSTRAINT "playbook_runs_outcome_vocab" CHECK ("playbook_runs"."outcome" IN ('succeeded', 'partial', 'failed'));--> statement-breakpoint
-- Backfill: a finished run's outcome from its Jobs, one verdict per step that got a Job (a step
-- succeeded when any of its Jobs did). Every such step succeeded -> succeeded; none -> failed;
-- otherwise partial. Steps that never got a Job are not counted: the recipe is not in the database.
UPDATE "playbook_runs" AS r SET "outcome" = CASE
  WHEN s.succeeded = 0 THEN 'failed'
  WHEN s.succeeded = s.total THEN 'succeeded'
  ELSE 'partial'
END
FROM (
  SELECT r2."id" AS run_id,
    count(step."playbook_step") AS total,
    count(step."playbook_step") FILTER (WHERE step.ok) AS succeeded
  FROM "playbook_runs" r2
  LEFT JOIN (
    SELECT "playbook_run_id", "playbook_step", bool_or("status" = 'succeeded') AS ok
    FROM "jobs"
    WHERE "playbook_run_id" IS NOT NULL
    GROUP BY "playbook_run_id", "playbook_step"
  ) step ON step."playbook_run_id" = r2."id"
  WHERE r2."status" = 'finished'
  GROUP BY r2."id"
) s
WHERE r."id" = s.run_id;
