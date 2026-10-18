-- Custom SQL migration file, put your code below! --
-- Same-Case integrity (#302), step 3 of 4: REPORT every stored row that breaks a rule the next
-- migration enforces (vocabulary values, cross-Case links, Evidence ids that name nothing in the
-- Case). It changes nothing. When it finds rows it aborts with the rule, the count, a sample and
-- what to do, and, because the migrator applies every pending migration in one transaction, the
-- database stays exactly as it was: no column added, nothing constrained. Fix or remove the rows
-- (they are listed in full by packages/db/scripts/invariant-violations.ts, which reads the
-- pre-migration schema), then migrate again. Rows are never deleted or rewritten here.
DO $report$
DECLARE
  rule record;
  n bigint;
  sample text;
  report text := '';
  total bigint := 0;
BEGIN
  FOR rule IN SELECT * FROM (VALUES
    ('activity.kind', $q$SELECT "id"::text FROM "public"."activity" WHERE "kind" IS NOT NULL AND "kind" NOT IN ('task', 'job', 'proposal', 'evidence', 'entity', 'edge', 'claim', 'identifier', 'event', 'question', 'case', 'handoff')$q$, 'remap the value to one of task/job/proposal/evidence/entity/edge/claim/identifier/event/question/case/handoff (packages/schemas/src/vocab.ts); activity is an audit trail, never delete its rows'),
    ('activity.action', $q$SELECT "id"::text FROM "public"."activity" WHERE "action" IS NOT NULL AND "action" NOT IN ('created', 'status_changed', 'updated', 'reordered', 'deleted', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'accepted', 'rejected', 'captured', 'hidden', 'restored', 'attached', 'processed', 'retracted', 'resolved', 'opened')$q$, 'remap the value to one of created/status_changed/updated/reordered/deleted/queued/running/succeeded/failed/cancelled/accepted/rejected/captured/hidden/restored/attached/processed/retracted/resolved/opened (packages/schemas/src/vocab.ts); activity is an audit trail, never delete its rows'),
    ('auth_event.kind', $q$SELECT "id"::text FROM "auth"."auth_event" WHERE "kind" IS NOT NULL AND "kind" NOT IN ('session.created')$q$, 'set the value to one of session.created (packages/schemas/src/vocab.ts), or delete the row'),
    ('claims.class', $q$SELECT "id"::text FROM "public"."claims" WHERE "class" IS NOT NULL AND "class" NOT IN ('observation', 'assessment', 'allegation', 'other')$q$, 'set the value to one of observation/assessment/allegation/other (packages/schemas/src/vocab.ts), or delete the row'),
    ('claims.confidence', $q$SELECT "id"::text FROM "public"."claims" WHERE "confidence" IS NOT NULL AND "confidence" NOT IN ('unverified', 'possible', 'confirmed')$q$, 'set the value to one of unverified/possible/confirmed (packages/schemas/src/vocab.ts), or delete the row'),
    ('claims.retract_kind', $q$SELECT "id"::text FROM "public"."claims" WHERE "retract_kind" IS NOT NULL AND "retract_kind" NOT IN ('retracted', 'contested', 'disproved')$q$, 'set the value to one of retracted/contested/disproved (packages/schemas/src/vocab.ts), or delete the row'),
    ('edges.predicate', $q$SELECT "id"::text FROM "public"."edges" WHERE "predicate" IS NOT NULL AND "predicate" NOT IN ('operates', 'owns', 'hosted_on', 'leads', 'founded', 'member_of', 'employee_of', 'associate_of', 'same_as', 'suspected_as', 'resolves_to', 'dns_via', 'mail_via', 'shares_ip_with', 'primary_domain', 'parent_of', 'registers', 'related_to')$q$, 'set the value to one of operates/owns/hosted_on/leads/founded/member_of/employee_of/associate_of/same_as/suspected_as/resolves_to/dns_via/mail_via/shares_ip_with/primary_domain/parent_of/registers/related_to (packages/schemas/src/vocab.ts), or delete the row'),
    ('edges.confidence', $q$SELECT "id"::text FROM "public"."edges" WHERE "confidence" IS NOT NULL AND "confidence" NOT IN ('unverified', 'possible', 'confirmed')$q$, 'set the value to one of unverified/possible/confirmed (packages/schemas/src/vocab.ts), or delete the row'),
    ('entities.kind', $q$SELECT "id"::text FROM "public"."entities" WHERE "kind" IS NOT NULL AND "kind" NOT IN ('person', 'infra', 'org')$q$, 'set the value to one of person/infra/org (packages/schemas/src/vocab.ts), or delete the row'),
    ('evidence.kind', $q$SELECT "id"::text FROM "public"."evidence" WHERE "kind" IS NOT NULL AND "kind" NOT IN ('file', 'url_archive', 'attestation', 'other')$q$, 'set the value to one of file/url_archive/attestation/other (packages/schemas/src/vocab.ts), or delete the row'),
    ('graph_writes.channel', $q$SELECT "id"::text FROM "public"."graph_writes" WHERE "channel" IS NOT NULL AND "channel" NOT IN ('agent_write')$q$, 'set the value to one of agent_write (packages/schemas/src/vocab.ts), or delete the row'),
    ('graph_writes.confidence', $q$SELECT "id"::text FROM "public"."graph_writes" WHERE "confidence" IS NOT NULL AND "confidence" NOT IN ('unverified', 'possible', 'confirmed')$q$, 'set the value to one of unverified/possible/confirmed (packages/schemas/src/vocab.ts), or delete the row'),
    ('identifiers.type', $q$SELECT "id"::text FROM "public"."identifiers" WHERE "type" IS NOT NULL AND "type" NOT IN ('email', 'handle', 'phone', 'url', 'domain', 'ip', 'crypto', 'pgp', 'credential', 'other')$q$, 'set the value to one of email/handle/phone/url/domain/ip/crypto/pgp/credential/other (packages/schemas/src/vocab.ts), or delete the row'),
    ('identifiers.confidence', $q$SELECT "id"::text FROM "public"."identifiers" WHERE "confidence" IS NOT NULL AND "confidence" NOT IN ('unverified', 'possible', 'confirmed')$q$, 'set the value to one of unverified/possible/confirmed (packages/schemas/src/vocab.ts), or delete the row'),
    ('identifiers.status', $q$SELECT "id"::text FROM "public"."identifiers" WHERE "status" IS NOT NULL AND "status" NOT IN ('current', 'former', 'unknown')$q$, 'set the value to one of current/former/unknown (packages/schemas/src/vocab.ts), or delete the row'),
    ('jobs.status', $q$SELECT "id"::text FROM "public"."jobs" WHERE "status" IS NOT NULL AND "status" NOT IN ('queued', 'running', 'blocked', 'succeeded', 'failed', 'cancelled')$q$, 'set the value to one of queued/running/blocked/succeeded/failed/cancelled (packages/schemas/src/vocab.ts), or delete the row'),
    ('playbook_runs.status', $q$SELECT "id"::text FROM "public"."playbook_runs" WHERE "status" IS NOT NULL AND "status" NOT IN ('running', 'finished', 'cancelled')$q$, 'set the value to one of running/finished/cancelled (packages/schemas/src/vocab.ts), or delete the row'),
    ('proposals.status', $q$SELECT "id"::text FROM "public"."proposals" WHERE "status" IS NOT NULL AND "status" NOT IN ('pending', 'accepted', 'rejected')$q$, 'set the value to one of pending/accepted/rejected (packages/schemas/src/vocab.ts), or delete the row'),
    ('questions.status', $q$SELECT "id"::text FROM "public"."questions" WHERE "status" IS NOT NULL AND "status" NOT IN ('open', 'resolved')$q$, 'set the value to one of open/resolved (packages/schemas/src/vocab.ts), or delete the row'),
    ('tasks.status', $q$SELECT "id"::text FROM "public"."tasks" WHERE "status" IS NOT NULL AND "status" NOT IN ('backlog', 'in_progress', 'blocked', 'done', 'dropped')$q$, 'set the value to one of backlog/in_progress/blocked/done/dropped (packages/schemas/src/vocab.ts), or delete the row'),
    ('tasks.priority', $q$SELECT "id"::text FROM "public"."tasks" WHERE "priority" IS NOT NULL AND "priority" NOT IN ('low', 'medium', 'high')$q$, 'set the value to one of low/medium/high (packages/schemas/src/vocab.ts), or delete the row'),
    ('claim_evidence.cross_case', $q$SELECT l."claim_id"::text || '/' || l."evidence_id"::text FROM "claim_evidence" l JOIN "claims" p ON p."id" = l."claim_id" JOIN "entities" pe ON pe."id" = p."entity_id" JOIN "evidence" ev ON ev."id" = l."evidence_id" WHERE ev."case_id" <> pe."case_id"$q$, 'unlink the Evidence from the Claim, or move one of them to the other''s Case'),
    ('identifier_evidence.cross_case', $q$SELECT l."identifier_id"::text || '/' || l."evidence_id"::text FROM "identifier_evidence" l JOIN "identifiers" p ON p."id" = l."identifier_id" JOIN "entities" pe ON pe."id" = p."entity_id" JOIN "evidence" ev ON ev."id" = l."evidence_id" WHERE ev."case_id" <> pe."case_id"$q$, 'unlink the Evidence from the Identifier, or move one of them to the other''s Case'),
    ('edge_evidence.cross_case', $q$SELECT l."edge_id"::text || '/' || l."evidence_id"::text FROM "edge_evidence" l JOIN "edges" p ON p."id" = l."edge_id" JOIN "entities" pe ON pe."id" = p."from_id" JOIN "evidence" ev ON ev."id" = l."evidence_id" WHERE ev."case_id" <> pe."case_id"$q$, 'unlink the Evidence from the Edge, or move one of them to the other''s Case'),
    ('edges.cross_case', $q$SELECT ed."id"::text FROM "edges" ed JOIN "entities" f ON f."id" = ed."from_id" JOIN "entities" t ON t."id" = ed."to_id" WHERE f."case_id" <> t."case_id"$q$, 'delete the Edge, or point one end at an Entity of the other end''s Case'),
    ('evidence.entity_id', $q$SELECT ev."id"::text FROM "evidence" ev JOIN "entities" en ON en."id" = ev."entity_id" WHERE en."case_id" <> ev."case_id"$q$, 'detach the Evidence from the Entity (UPDATE evidence SET entity_id = NULL)'),
    ('tasks.entity_id', $q$SELECT tk."id"::text FROM "tasks" tk JOIN "entities" en ON en."id" = tk."entity_id" WHERE en."case_id" <> tk."case_id"$q$, 'detach the Task from the Entity (UPDATE tasks SET entity_id = NULL)'),
    ('proposals.evidence_ids', $q$SELECT p."id"::text || '/' || x."val" FROM "proposals" p CROSS JOIN LATERAL (SELECT t."val", CASE WHEN lower(btrim(t."val")) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN lower(btrim(t."val"))::uuid END AS "evid" FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p."evidence_ids") = 'array' THEN p."evidence_ids" ELSE '[]'::jsonb END) AS t("val")) AS x WHERE btrim(x."val") <> '' AND (x."evid" IS NULL OR (SELECT ev."case_id" FROM "evidence" ev WHERE ev."id" = x."evid") IS DISTINCT FROM p."case_id")$q$, 'remove the id from the Proposal''s evidence_ids (UPDATE proposals SET evidence_ids = evidence_ids - ''<id>''), or restore the Evidence it names'),
    ('proposals.evidence_ids_shape', $q$SELECT p."id"::text FROM "proposals" p WHERE p."evidence_ids" IS NOT NULL AND jsonb_typeof(p."evidence_ids") NOT IN ('array', 'null')$q$, 'replace the Proposal''s evidence_ids with a JSON array of Evidence ids (note what it held first; UPDATE proposals SET evidence_ids = ''[]'' clears it)'),
    ('proposals.evidence_ids_null_element', $q$SELECT p."id"::text FROM "proposals" p WHERE jsonb_typeof(p."evidence_ids") = 'array' AND EXISTS (SELECT 1 FROM jsonb_array_elements(p."evidence_ids") e WHERE jsonb_typeof(e) = 'null')$q$, 'rebuild the Proposal''s evidence_ids without its null entries'),
    ('jobs.evidence_ids', $q$SELECT p."id"::text || '/' || x."val" FROM "jobs" p CROSS JOIN LATERAL (SELECT t."val", CASE WHEN lower(btrim(t."val")) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN lower(btrim(t."val"))::uuid END AS "evid" FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p."evidence_ids") = 'array' THEN p."evidence_ids" ELSE '[]'::jsonb END) AS t("val")) AS x WHERE btrim(x."val") <> '' AND (x."evid" IS NULL OR (SELECT ev."case_id" FROM "evidence" ev WHERE ev."id" = x."evid") IS DISTINCT FROM p."case_id")$q$, 'remove the id from the Job''s evidence_ids (UPDATE jobs SET evidence_ids = evidence_ids - ''<id>''), or restore the Evidence it names'),
    ('jobs.evidence_ids_shape', $q$SELECT p."id"::text FROM "jobs" p WHERE p."evidence_ids" IS NOT NULL AND jsonb_typeof(p."evidence_ids") NOT IN ('array', 'null')$q$, 'replace the Job''s evidence_ids with a JSON array of Evidence ids (note what it held first; UPDATE jobs SET evidence_ids = ''[]'' clears it)'),
    ('jobs.evidence_ids_null_element', $q$SELECT p."id"::text FROM "jobs" p WHERE jsonb_typeof(p."evidence_ids") = 'array' AND EXISTS (SELECT 1 FROM jsonb_array_elements(p."evidence_ids") e WHERE jsonb_typeof(e) = 'null')$q$, 'rebuild the Job''s evidence_ids without its null entries')
  ) AS v(name, query, hint)
  LOOP
    EXECUTE format($f$SELECT count(*), string_agg(k, ', ' ORDER BY k) FILTER (WHERE rn <= 5)
      FROM (SELECT k, row_number() OVER (ORDER BY k) AS rn FROM (%s) AS q(k)) AS numbered$f$, rule.query)
      INTO n, sample;
    IF n > 0 THEN
      total := total + n;
      report := report || format(E'\n  - %s: %s row(s), e.g. %s. To fix: %s.', rule.name, n, sample, rule.hint);
    END IF;
  END LOOP;
  IF total > 0 THEN
    RAISE EXCEPTION E'Database invariants (#302): % stored row(s) break a rule the next migration enforces. Nothing was changed. Fix or remove the rows listed, then run the migrations again. Every offending row: pnpm --filter @watchdog/db exec tsx scripts/invariant-violations.ts%', total, report
      USING ERRCODE = 'check_violation';
  END IF;
END
$report$;
