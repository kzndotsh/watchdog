ALTER TABLE "cases" DROP CONSTRAINT "cases_slug_unique";--> statement-breakpoint
DROP INDEX "cases_organization_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "cases_organization_id_slug_uidx" ON "cases" USING btree ("organization_id","slug");