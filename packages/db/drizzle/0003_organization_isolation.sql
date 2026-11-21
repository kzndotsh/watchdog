-- Organization isolation (#718): row-level security on `cases` and `claims`, keyed on the
-- transaction-local `watchdog.org_id` setting (read through `graph_history_setting`, which maps
-- '' to NULL, so a transaction with no organization reads and writes no row of either table).
--
-- The statements up to the policies are as `drizzle-kit generate` wrote them from
-- `src/schema/cases.ts` and `src/schema/claims.ts` (the snapshot `meta/0003_snapshot.json` matches
-- them). `claims.organization_id` is a copy of the Case's organization, held to it by the
-- composite foreign key, so the policy compares a column of the row (a lookup through `cases`
-- took the paged Claim list off its index order on the perf seed). Added with NOT NULL and no
-- backfill: nobody uses Watchdog yet, local data is wiped. Hand-added after the generated part:
-- `case_organization_id` and the trigger that fills `claims.organization_id`, which drizzle does
-- not model. Policies apply `TO public` without FORCE: the table owner (migrations, `just wipe`,
-- repair) is not subject to them, every other role is.
ALTER TABLE "cases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_case_organization_fk" FOREIGN KEY ("case_id","organization_id") REFERENCES "public"."cases"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "cases_organization_isolation" ON "cases" AS PERMISSIVE FOR ALL TO public USING ("cases"."organization_id" = (select public.graph_history_setting('watchdog.org_id'))) WITH CHECK ("cases"."organization_id" = (select public.graph_history_setting('watchdog.org_id')));--> statement-breakpoint
CREATE POLICY "claims_organization_isolation" ON "claims" AS PERMISSIVE FOR ALL TO public USING ("claims"."organization_id" = (select public.graph_history_setting('watchdog.org_id'))) WITH CHECK ("claims"."organization_id" = (select public.graph_history_setting('watchdog.org_id')));--> statement-breakpoint
-- The organization of a Case, for trusted paths that hold a Case id from a Job or a child row and
-- no organization yet (the worker's Job run and reconcile, the Case export) and for the copies of
-- it (`activity.organization_id`, `claims.organization_id`). SECURITY DEFINER because the policies
-- above hide every Case until an organization is set. It answers only with the organization id of
-- a Case whose id the caller already holds (NULL for a missing one), deleted Cases included (the
-- purge needs them).
CREATE FUNCTION "public"."case_organization_id"(p_case_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$ SELECT c."organization_id" FROM "public"."cases" c WHERE c."id" = p_case_id $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."case_organization_id"(uuid) FROM PUBLIC;
--> statement-breakpoint
-- BEFORE INSERT on `claims`: the organization is always the Case's, whatever the insert sent
-- (Drizzle sends NULL). The policy's WITH CHECK then refuses a Claim of a Case outside the
-- transaction's organization, and the composite foreign key refuses any other value.
CREATE FUNCTION "public"."claims_organization_from_case"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW."organization_id" := "public"."case_organization_id"(NEW."case_id");
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "claims_organization_from_case" BEFORE INSERT ON "public"."claims"
FOR EACH ROW EXECUTE FUNCTION "public"."claims_organization_from_case"();
