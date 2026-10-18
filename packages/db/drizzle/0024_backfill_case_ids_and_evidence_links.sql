-- Custom SQL migration file, put your code below! --
-- Same-Case integrity (#302), step 2 of 4: fill the additive columns and tables from what is
-- already stored. Nothing is deleted and nothing is constrained here. Idempotent: every statement
-- only touches rows that are still empty, so a re-run changes nothing.

-- A row that hangs off an Entity takes the Entity's Case.
UPDATE "claims" AS c SET "case_id" = e."case_id"
FROM "entities" AS e WHERE e."id" = c."entity_id" AND c."case_id" IS NULL;--> statement-breakpoint
UPDATE "identifiers" AS i SET "case_id" = e."case_id"
FROM "entities" AS e WHERE e."id" = i."entity_id" AND i."case_id" IS NULL;--> statement-breakpoint
UPDATE "events" AS ev SET "case_id" = e."case_id"
FROM "entities" AS e WHERE e."id" = ev."entity_id" AND ev."case_id" IS NULL;--> statement-breakpoint
UPDATE "questions" AS q SET "case_id" = e."case_id"
FROM "entities" AS e WHERE e."id" = q."entity_id" AND q."case_id" IS NULL;--> statement-breakpoint
-- An Edge takes the Case of its `from` end. A `to` end in another Case is a violation, reported
-- (not repaired) by the next migration.
UPDATE "edges" AS ed SET "case_id" = e."case_id"
FROM "entities" AS e WHERE e."id" = ed."from_id" AND ed."case_id" IS NULL;--> statement-breakpoint

-- A link row takes the Case of its Claim, Identifier or Edge. Evidence in another Case is a
-- violation, reported (not repaired) by the next migration.
UPDATE "claim_evidence" AS l SET "case_id" = c."case_id"
FROM "claims" AS c WHERE c."id" = l."claim_id" AND l."case_id" IS NULL;--> statement-breakpoint
UPDATE "identifier_evidence" AS l SET "case_id" = i."case_id"
FROM "identifiers" AS i WHERE i."id" = l."identifier_id" AND l."case_id" IS NULL;--> statement-breakpoint
UPDATE "edge_evidence" AS l SET "case_id" = ed."case_id"
FROM "edges" AS ed WHERE ed."id" = l."edge_id" AND l."case_id" IS NULL;--> statement-breakpoint

-- The JSON Evidence-id arrays become link rows, in array order. An id is linked only when it
-- names Evidence of the Proposal's (Job's) own Case; any other entry stays in the JSON column,
-- is listed by the next migration's report, and blocks the constraints until a person decides.
-- (A NULL, a non-array, a null element, a malformed id: nothing to link here, and the report
-- lists all of them.) The id is cast to uuid, guarded by a uuid-shape test, so Evidence is found
-- by a scalar subquery, always one primary-key probe per id: comparing text, or a join the
-- planner may drive from the case_id index, can scan a Case's Evidence once per id.
INSERT INTO "proposal_evidence" ("proposal_id", "evidence_id", "case_id", "position")
SELECT r."proposal_id", r."evidence_id", r."case_id",
       (row_number() OVER (PARTITION BY r."proposal_id" ORDER BY r."ord") - 1)::integer
FROM (
  SELECT DISTINCT ON (p."id", x."evid")
         p."id" AS "proposal_id", x."evid" AS "evidence_id", p."case_id", x."ord"
  FROM "proposals" AS p
  CROSS JOIN LATERAL (
    SELECT CASE WHEN lower(btrim(t."val")) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN lower(btrim(t."val"))::uuid END AS "evid", t."ord"
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(p."evidence_ids") = 'array' THEN p."evidence_ids" ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS t("val", "ord")
  ) AS x
  WHERE x."evid" IS NOT NULL
    AND (SELECT ev."case_id" FROM "evidence" AS ev WHERE ev."id" = x."evid") = p."case_id"
  ORDER BY p."id", x."evid", x."ord"
) AS r
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "job_evidence" ("job_id", "evidence_id", "case_id", "position")
SELECT r."job_id", r."evidence_id", r."case_id",
       (row_number() OVER (PARTITION BY r."job_id" ORDER BY r."ord") - 1)::integer
FROM (
  SELECT DISTINCT ON (j."id", x."evid")
         j."id" AS "job_id", x."evid" AS "evidence_id", j."case_id", x."ord"
  FROM "jobs" AS j
  CROSS JOIN LATERAL (
    SELECT CASE WHEN lower(btrim(t."val")) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN lower(btrim(t."val"))::uuid END AS "evid", t."ord"
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(j."evidence_ids") = 'array' THEN j."evidence_ids" ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS t("val", "ord")
  ) AS x
  WHERE x."evid" IS NOT NULL
    AND (SELECT ev."case_id" FROM "evidence" AS ev WHERE ev."id" = x."evid") = j."case_id"
  ORDER BY j."id", x."evid", x."ord"
) AS r
ON CONFLICT DO NOTHING;
