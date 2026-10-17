ALTER TABLE "jobs" ADD COLUMN "retry_of_job_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_retry_of_job_id_jobs_id_fk" FOREIGN KEY ("retry_of_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_retry_of_job_id_idx" ON "jobs" USING btree ("retry_of_job_id");