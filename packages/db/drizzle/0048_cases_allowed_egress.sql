ALTER TABLE "cases" ADD COLUMN "allowed_egress" text[] DEFAULT '{"local","target"}' NOT NULL;--> statement-breakpoint
ALTER TABLE "cases" DROP COLUMN "allow_third_party_egress";--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_allowed_egress_classes" CHECK ("cases"."allowed_egress" <@ ARRAY['local', 'target', 'public_lookup', 'account_lookup', 'model']::text[]);--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_allowed_egress_local" CHECK ('local' = ANY("cases"."allowed_egress"));