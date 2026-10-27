-- Hand-written rename (custom migration, snapshot edited to match): the Dossier
-- "AI handoff" becomes Open in, and a Job's "handoff" becomes its pivots.
ALTER TABLE "organization_settings" RENAME COLUMN "external_ai_handoff" TO "open_in_external_tools";--> statement-breakpoint
ALTER TABLE "jobs" RENAME COLUMN "handoff" TO "pivots";--> statement-breakpoint
ALTER TABLE "activity" DROP CONSTRAINT "activity_kind_vocab";--> statement-breakpoint
UPDATE "activity" SET "kind" = 'open_in' WHERE "kind" = 'handoff';--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_kind_vocab" CHECK ("activity"."kind" IN ('task', 'job', 'playbook_run', 'proposal', 'evidence', 'entity', 'edge', 'claim', 'identifier', 'event', 'question', 'case', 'open_in'));
