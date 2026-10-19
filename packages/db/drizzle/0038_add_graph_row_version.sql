-- Issue #307: optimistic concurrency on Graph edits.
--
-- `version` is a per-row integer: 1 on insert, +1 on every UPDATE of the six Graph tables a person or
-- agent edits (entities, edges, identifiers, claims, events, questions; `tasks` are case work items,
-- not Graph rows, and keep last-write-wins). A caller reads the version with the row and sends it
-- back; the repo's UPDATE adds `AND version = $n`, so of two writers holding the same version exactly
-- one matches. `updated_at` is not the token: two statements in one transaction share `now()`, and
-- the Evidence-link touch rewrites it.
--
-- A BEFORE UPDATE trigger owns the increment (never the repo, never a caller): it also bumps on a
-- cascade or the Evidence-link touch of `graph_history_link_changed` (migration 0031), so a change
-- of a Claim's Evidence is a change of the Claim. The generated ALTERs are followed by hand-written
-- SQL (its snapshot is unchanged): the bump trigger, and a CREATE OR REPLACE of `graph_history_row`
-- (0031) that ignores `version` beside `updated_at` / `updated_by`, so an UPDATE that moves nothing
-- else still records no history. Same header rules as 0031: pinned `search_path`, everything
-- qualified, no access for PUBLIC.

ALTER TABLE "claims" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "edges" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "identifiers" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."graph_version_bump"() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  NEW."version" := OLD."version" + 1;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['entities', 'edges', 'identifiers', 'claims', 'events', 'questions']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS "graph_version_trg" ON "public".%I', t);
    EXECUTE format(
      'CREATE TRIGGER "graph_version_trg" BEFORE UPDATE ON "public".%I FOR EACH ROW EXECUTE FUNCTION "public"."graph_version_bump"()',
      t);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."graph_history_row"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_kind text := TG_ARGV[0];
  v_op text;
  v_before jsonb;
  v_after jsonb;
  v_row jsonb;
  v_case uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_op := 'create';
    v_after := to_jsonb(NEW);
    v_row := v_after;
  ELSIF TG_OP = 'UPDATE' THEN
    v_op := 'update';
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_row := v_after;
    IF (v_before - 'updated_at' - 'updated_by' - 'version') = (v_after - 'updated_at' - 'updated_by' - 'version') THEN
      RETURN NULL;
    END IF;
    -- a Claim that turns retracted is a retract, not an edit
    IF (v_before->>'retracted') IS DISTINCT FROM 'true' AND (v_after->>'retracted') = 'true' THEN
      v_op := 'retract';
    END IF;
  ELSE
    v_op := 'delete';
    v_before := to_jsonb(OLD);
    v_row := v_before;
  END IF;
  v_case := (v_row->>'case_id')::uuid;
  IF v_case IS NULL AND v_op = 'delete' THEN
    RETURN NULL;
  END IF;
  IF v_case IS NULL THEN
    RAISE EXCEPTION 'graph_history: no Case for % %', v_kind, v_row->>'id';
  END IF;
  PERFORM "public"."graph_history_append"(
    v_case, v_kind, (v_row->>'id')::uuid, v_op,
    "public"."graph_history_snapshot"(v_kind, v_before),
    "public"."graph_history_snapshot"(v_kind, v_after)
  );
  RETURN NULL;
END;
$$;
