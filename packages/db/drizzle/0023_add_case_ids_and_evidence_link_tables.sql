CREATE TABLE "job_evidence" (
	"job_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "job_evidence_job_id_evidence_id_pk" PRIMARY KEY("job_id","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "proposal_evidence" (
	"proposal_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "proposal_evidence_proposal_id_evidence_id_pk" PRIMARY KEY("proposal_id","evidence_id")
);
--> statement-breakpoint
ALTER TABLE "claim_evidence" ADD COLUMN "case_id" uuid;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "case_id" uuid;--> statement-breakpoint
ALTER TABLE "edge_evidence" ADD COLUMN "case_id" uuid;--> statement-breakpoint
ALTER TABLE "edges" ADD COLUMN "case_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "case_id" uuid;--> statement-breakpoint
ALTER TABLE "identifier_evidence" ADD COLUMN "case_id" uuid;--> statement-breakpoint
ALTER TABLE "identifiers" ADD COLUMN "case_id" uuid;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "case_id" uuid;--> statement-breakpoint
CREATE INDEX "job_evidence_evidence_id_idx" ON "job_evidence" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "proposal_evidence_evidence_id_idx" ON "proposal_evidence" USING btree ("evidence_id");