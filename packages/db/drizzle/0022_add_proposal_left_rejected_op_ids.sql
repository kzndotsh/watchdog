ALTER TABLE "proposals" ADD COLUMN "left_op_ids" uuid[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "rejected_op_ids" uuid[] DEFAULT '{}' NOT NULL;