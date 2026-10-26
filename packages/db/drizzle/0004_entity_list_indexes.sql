CREATE INDEX "entities_case_updated_idx" ON "entities" USING btree ("case_id","updated_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "entities_name_trgm_idx" ON "entities" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "entities_summary_trgm_idx" ON "entities" USING gin ("summary" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "entities_notes_trgm_idx" ON "entities" USING gin ("notes" gin_trgm_ops);