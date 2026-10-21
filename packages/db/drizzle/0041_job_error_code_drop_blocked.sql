ALTER TABLE "jobs" DROP CONSTRAINT "jobs_status_vocab";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "error_code" text;--> statement-breakpoint
UPDATE "jobs" SET "status" = 'failed', "error_code" = 'legacy_blocked', "finished_at" = COALESCE("finished_at", now()) WHERE "status" = 'blocked';--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_status_vocab" CHECK ("jobs"."status" IN ('queued', 'running', 'succeeded', 'failed', 'cancelled'));
