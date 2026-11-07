DROP INDEX "graph_history_case_row_idx";--> statement-breakpoint
CREATE INDEX "graph_history_case_row_idx" ON "graph_history" USING btree ("case_id","kind","row_id","id" DESC NULLS FIRST);