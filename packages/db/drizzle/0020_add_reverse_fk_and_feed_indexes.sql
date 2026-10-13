DROP INDEX "tasks_case_id_idx";--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "auth"."account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_created_at_id_idx" ON "activity" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "claim_evidence_evidence_id_idx" ON "claim_evidence" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "edge_evidence_evidence_id_idx" ON "edge_evidence" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "edges_to_id_idx" ON "edges" USING btree ("to_id");--> statement-breakpoint
CREATE INDEX "events_entity_id_idx" ON "events" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "evidence_entity_id_idx" ON "evidence" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "finding_suppressions_proposal_id_idx" ON "finding_suppressions" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "graph_writes_case_id_idx" ON "graph_writes" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "identifier_evidence_evidence_id_idx" ON "identifier_evidence" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "playbook_runs_case_id_idx" ON "playbook_runs" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "proposals_job_id_idx" ON "proposals" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "questions_entity_id_idx" ON "questions" USING btree ("entity_id");