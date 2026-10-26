CREATE INDEX "proposal_evidence_proposal_position_idx" ON "proposal_evidence" USING btree ("proposal_id","position");--> statement-breakpoint
CREATE INDEX "proposals_case_status_created_idx" ON "proposals" USING btree ("case_id","status","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "proposals_summary_trgm_idx" ON "proposals" USING gin ("summary" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "proposals_reject_reason_trgm_idx" ON "proposals" USING gin ("reject_reason" gin_trgm_ops);