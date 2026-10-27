-- Postgres owns `updated_at`: a BEFORE UPDATE trigger on every `public` table that has the column
-- sets it to `now()`, so a raw statement, a database function, another trigger or a migration can
-- never leave it stale (it used to be an app-side Drizzle `$onUpdateFn`). A statement that sets the
-- column itself wins (an explicit value differs from the old one): a seed or test backdating a row
-- keeps its value, and nothing in the application does it. The `auth` schema is Better Auth's and
-- is not touched.
CREATE FUNCTION "public"."touch_updated_at"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW."updated_at" IS NOT DISTINCT FROM OLD."updated_at" THEN
    NEW."updated_at" := now();
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- Only a trigger calls it; nobody needs EXECUTE (the trigger is created by this owner).
REVOKE ALL ON FUNCTION "public"."touch_updated_at"() FROM PUBLIC;
--> statement-breakpoint
-- Every BASE TABLE in `public` with an `updated_at` column. A table added later attaches the
-- trigger in its own migration; the classification test fails a table that forgot.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at'
      AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER "touch_updated_at_trg" BEFORE UPDATE ON "public".%I FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"()',
      t);
  END LOOP;
END $$;
