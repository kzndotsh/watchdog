ALTER TABLE "cases" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "cases" SET "organization_id" = (SELECT "id" FROM "auth"."organization" ORDER BY "created_at" LIMIT 1) WHERE "organization_id" IS NULL;--> statement-breakpoint
ALTER TABLE "cases" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "cases_organization_id_idx" ON "cases" USING btree ("organization_id");
