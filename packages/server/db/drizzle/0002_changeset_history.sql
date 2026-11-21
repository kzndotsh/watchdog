-- #724: every graph_history row names its changeset (`changesets`, 0001_changesets), the one
-- provenance row of the write transaction that made it.
--
-- The history context (`setGraphHistoryContext`, packages/server/db/src/history-context.ts) inserts the
-- transaction's changeset in its first statement and stores the id in the transaction-local
-- setting `watchdog.changeset_id`. The history writer reads it here. A write with no changeset of
-- the row's Case in that setting (the owner role, a seed, a repository test, a transaction that
-- touches a second Case) gets one now, from the same settings the history row reads (channel,
-- actor), and the setting moves to it: one changeset per transaction and Case.
--
-- Like the other history functions: pinned search_path, every relation qualified, callable only
-- by the owner (the SECURITY DEFINER trigger functions run as the owner).
CREATE FUNCTION "public"."graph_history_changeset"(p_case uuid) RETURNS uuid
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_id uuid := "public"."graph_history_setting"('watchdog.changeset_id')::uuid;
  v_channel text := "public"."graph_history_setting"('watchdog.channel');
BEGIN
  IF v_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM "public"."changesets" c WHERE c."id" = v_id AND c."case_id" = p_case
  ) THEN
    RETURN v_id;
  END IF;
  INSERT INTO "public"."changesets" ("case_id", "channel", "actor_id", "actor_label", "actor_key_id")
  VALUES (
    p_case,
    CASE WHEN v_channel IN ('dossier', 'triage_accept', 'agent_write') THEN v_channel ELSE 'system' END,
    "public"."graph_history_setting"('watchdog.actor_id'),
    "public"."graph_history_setting"('watchdog.actor_label'),
    "public"."graph_history_setting"('watchdog.actor_key_id')
  )
  RETURNING "id" INTO v_id;
  PERFORM pg_catalog.set_config('watchdog.changeset_id', v_id::text, true);
  RETURN v_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."graph_history_changeset"(uuid) FROM PUBLIC;
--> statement-breakpoint
-- The one writer of graph_history (0000_baseline), now with the changeset.
CREATE OR REPLACE FUNCTION "public"."graph_history_append"(
  p_case uuid, p_kind text, p_row uuid, p_op text, p_before jsonb, p_after jsonb
) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "public"."cases" c WHERE c."id" = p_case) THEN
    RETURN;
  END IF;
  INSERT INTO "public"."graph_history" ("case_id", "kind", "row_id", "op", "changeset_id", "channel", "actor_id", "actor_label", "actor_key_id", "before", "after")
  VALUES (
    p_case, p_kind, p_row, p_op,
    "public"."graph_history_changeset"(p_case),
    CASE WHEN "public"."graph_history_setting"('watchdog.channel') IN ('dossier', 'triage_accept', 'agent_write')
      THEN "public"."graph_history_setting"('watchdog.channel') ELSE 'system' END,
    "public"."graph_history_setting"('watchdog.actor_id'),
    "public"."graph_history_setting"('watchdog.actor_label'),
    "public"."graph_history_setting"('watchdog.actor_key_id'),
    p_before, p_after
  );
END;
$$;
