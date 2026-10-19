-- Issue #366: record which API key made a change.
--
-- `actor_id` stays the key owner's user id and `actor_label` the `api-key:<name>` display snapshot;
-- `actor_key_id` is the key's own id (Better Auth `apikey.id`, no foreign key: deleting a key keeps
-- the trail), null for a session or a system write. Core sends it with the history context as the
-- transaction setting `watchdog.actor_key_id`.
--
-- The generated ALTERs are followed by a hand-written CREATE OR REPLACE of `graph_history_append`
-- (migration 0031) that also stores the setting; its snapshot is unchanged by it. Same header rules
-- as 0031: pinned `search_path`, everything qualified, no access for PUBLIC.

ALTER TABLE "activity" ADD COLUMN "actor_key_id" text;--> statement-breakpoint
ALTER TABLE "graph_history" ADD COLUMN "actor_key_id" text;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."graph_history_append"(
  p_case uuid, p_kind text, p_row uuid, p_op text, p_before jsonb, p_after jsonb
) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "public"."cases" c WHERE c."id" = p_case) THEN
    RETURN;
  END IF;
  INSERT INTO "public"."graph_history" ("case_id", "kind", "row_id", "op", "channel", "actor_id", "actor_label", "actor_key_id", "before", "after")
  VALUES (
    p_case, p_kind, p_row, p_op,
    CASE WHEN "public"."graph_history_setting"('watchdog.channel') IN ('dossier', 'triage_accept', 'agent_write')
      THEN "public"."graph_history_setting"('watchdog.channel') ELSE 'system' END,
    "public"."graph_history_setting"('watchdog.actor_id'),
    "public"."graph_history_setting"('watchdog.actor_label'),
    "public"."graph_history_setting"('watchdog.actor_key_id'),
    p_before, p_after
  );
END;
$$;
