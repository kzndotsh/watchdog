DROP INDEX "activity_created_at_id_idx";--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "activity" SET "organization_id" = "cases"."organization_id" FROM "cases" WHERE "cases"."id" = "activity"."case_id";--> statement-breakpoint
ALTER TABLE "activity" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cases_id_organization_uidx" ON "cases" USING btree ("id","organization_id");--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_case_organization_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."cases"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_org_created_idx" ON "activity" USING btree ("organization_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "activity_org_case_created_idx" ON "activity" USING btree ("organization_id","case_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "activity_group_created_idx" ON "activity" USING btree ("group_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "activity"."group_id" IS NOT NULL;