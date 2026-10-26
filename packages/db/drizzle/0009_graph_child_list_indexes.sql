CREATE INDEX "claims_case_created_idx" ON "claims" USING btree ("case_id","created_at","id");--> statement-breakpoint
CREATE INDEX "claims_text_trgm_idx" ON "claims" USING gin ("text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "edges_case_updated_idx" ON "edges" USING btree ("case_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "edges_notes_trgm_idx" ON "edges" USING gin ("notes" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "events_case_when_idx" ON "events" USING btree ("case_id","when","id");--> statement-breakpoint
CREATE INDEX "events_case_created_idx" ON "events" USING btree ("case_id","created_at","id");--> statement-breakpoint
CREATE INDEX "events_what_trgm_idx" ON "events" USING gin ("what" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "events_where_trgm_idx" ON "events" USING gin ("where" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "events_when_trgm_idx" ON "events" USING gin ("when" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "questions_case_created_idx" ON "questions" USING btree ("case_id","created_at","id");--> statement-breakpoint
CREATE INDEX "questions_text_trgm_idx" ON "questions" USING gin ("text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "questions_resolved_note_trgm_idx" ON "questions" USING gin ("resolved_note" gin_trgm_ops);