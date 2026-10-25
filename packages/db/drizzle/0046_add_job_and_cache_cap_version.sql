-- Hand edit (snapshot unchanged): the cache holds results of unknown version, so it is emptied
-- before the NOT NULL column is added. A cache row is rebuilt by the next run.
DELETE FROM "cap_cache";--> statement-breakpoint
ALTER TABLE "cap_cache" ADD COLUMN "cap_version" text NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "cap_version" text;