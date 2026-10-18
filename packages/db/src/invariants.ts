import { sqlLiteral } from "./schema/_vocab";
import { vocabChecks } from "./schema/vocab-checks";

/**
 * The rows the database invariants of #302 would refuse (vocabulary CHECKs, same-Case foreign
 * keys, Evidence ids that name nothing in the Case). Each rule is a SELECT of one text key per
 * offending row. They read only columns that exist before migration `0023`, so they run on an
 * install that has not migrated yet: that is how an operator lists the rows after the
 * migration `0025_report_invariant_violations` refuses to go on.
 */
export type InvariantRule = {
  readonly name: string;
  /** A SELECT returning one text column: a row id, or `a/b` for a link row. */
  readonly query: string;
  /** What to do about a row the rule lists. */
  readonly hint: string;
  /** The constraints Postgres adds to enforce this rule (checked against the catalog by a test). */
  readonly enforcedBy: readonly string[];
};

/**
 * Tables created after the invariants migration, with their vocabulary CHECKs from the first
 * row: nothing in an install that has not migrated yet can violate them, and the table may not
 * exist there, so the report skips them.
 */
const CREATED_WITH_CHECKS: ReadonlySet<string> = new Set([
  "graph_history",
  "case_deletion_records",
]);

/** One rule per vocabulary column, from the same registry that builds the CHECK constraints. */
export function vocabularyRules(): InvariantRule[] {
  return vocabChecks()
    .filter(({ table }) => !CREATED_WITH_CHECKS.has(table))
    .map(({ schema, table, column, constraint, values }) => ({
      name: `${table}.${column}`,
      query: `SELECT "id"::text FROM "${schema}"."${table}" WHERE "${column}" IS NOT NULL AND "${column}" NOT IN (${values.map(sqlLiteral).join(", ")})`,
      hint:
        table === "activity"
          ? `remap the value to one of ${values.join("/")} (packages/schemas/src/vocab.ts); activity is an audit trail, never delete its rows`
          : `set the value to one of ${values.join("/")} (packages/schemas/src/vocab.ts), or delete the row`,
      enforcedBy: [constraint],
    }));
}

function linkCrossCase(
  table: string,
  parentTable: string,
  parentKey: string,
  parentName: string
): InvariantRule {
  return {
    name: `${table}.cross_case`,
    query: [
      `SELECT l."${parentKey}"::text || '/' || l."evidence_id"::text FROM "${table}" l`,
      `JOIN "${parentTable}" p ON p."id" = l."${parentKey}"`,
      `JOIN "entities" pe ON pe."id" = ${parentTable === "edges" ? 'p."from_id"' : 'p."entity_id"'}`,
      `JOIN "evidence" ev ON ev."id" = l."evidence_id"`,
      `WHERE ev."case_id" <> pe."case_id"`,
    ].join(" "),
    hint: `unlink the Evidence from the ${parentName}, or move one of them to the other's Case`,
    enforcedBy: [`${table}_evidence_id_case_id_fk`],
  };
}

/** A uuid-shaped string, case-insensitive: only these are cast, so the cast cannot fail. */
const UUID_TEXT =
  "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'";

/** The stored `evidence_ids` as an array: `[]` for a non-array or NULL. */
const idsAsArray = (alias: string) =>
  `CASE WHEN jsonb_typeof(${alias}."evidence_ids") = 'array' THEN ${alias}."evidence_ids" ELSE '[]'::jsonb END`;

/**
 * Evidence-id rules for a table whose rows carry the JSON `evidence_ids`: an id that names no
 * Evidence of the row's own Case, a value that is not an array, and a null element. The id join
 * casts to uuid (guarded by the shape test) and looks the Evidence up by a scalar subquery, which
 * is always one primary-key probe per id: a text comparison, or a join the planner may drive from
 * the `case_id` index, can scan all of a Case's Evidence for every id.
 */
function evidenceIdsRules(
  table: "proposals" | "jobs",
  name: string
): InvariantRule[] {
  const fk = `${table === "jobs" ? "job" : "proposal"}_evidence_evidence_id_case_id_fk`;
  return [
    {
      name: `${table}.evidence_ids`,
      query: [
        `SELECT p."id"::text || '/' || x."val" FROM "${table}" p`,
        `CROSS JOIN LATERAL (SELECT t."val", CASE WHEN lower(btrim(t."val")) ~ ${UUID_TEXT} THEN lower(btrim(t."val"))::uuid END AS "evid" FROM jsonb_array_elements_text(${idsAsArray("p")}) AS t("val")) AS x`,
        `WHERE btrim(x."val") <> '' AND (x."evid" IS NULL OR (SELECT ev."case_id" FROM "evidence" ev WHERE ev."id" = x."evid") IS DISTINCT FROM p."case_id")`,
      ].join(" "),
      hint: `remove the id from the ${name}'s evidence_ids (UPDATE ${table} SET evidence_ids = evidence_ids - '<id>'), or restore the Evidence it names`,
      enforcedBy: [fk],
    },
    {
      name: `${table}.evidence_ids_shape`,
      query: `SELECT p."id"::text FROM "${table}" p WHERE p."evidence_ids" IS NOT NULL AND jsonb_typeof(p."evidence_ids") NOT IN ('array', 'null')`,
      hint: `replace the ${name}'s evidence_ids with a JSON array of Evidence ids (note what it held first; UPDATE ${table} SET evidence_ids = '[]' clears it)`,
      enforcedBy: [fk],
    },
    {
      name: `${table}.evidence_ids_null_element`,
      query: `SELECT p."id"::text FROM "${table}" p WHERE jsonb_typeof(p."evidence_ids") = 'array' AND EXISTS (SELECT 1 FROM jsonb_array_elements(p."evidence_ids") e WHERE jsonb_typeof(e) = 'null')`,
      hint: `rebuild the ${name}'s evidence_ids without its null entries`,
      enforcedBy: [fk],
    },
  ];
}

/** The structural rules: same-Case links and Evidence ids that resolve to nothing. */
export const STRUCTURAL_RULES: readonly InvariantRule[] = [
  linkCrossCase("claim_evidence", "claims", "claim_id", "Claim"),
  linkCrossCase(
    "identifier_evidence",
    "identifiers",
    "identifier_id",
    "Identifier"
  ),
  linkCrossCase("edge_evidence", "edges", "edge_id", "Edge"),
  {
    name: "edges.cross_case",
    query: `SELECT ed."id"::text FROM "edges" ed JOIN "entities" f ON f."id" = ed."from_id" JOIN "entities" t ON t."id" = ed."to_id" WHERE f."case_id" <> t."case_id"`,
    hint: "delete the Edge, or point one end at an Entity of the other end's Case",
    enforcedBy: ["edges_to_id_case_id_fk"],
  },
  {
    name: "evidence.entity_id",
    query: `SELECT ev."id"::text FROM "evidence" ev JOIN "entities" en ON en."id" = ev."entity_id" WHERE en."case_id" <> ev."case_id"`,
    hint: "detach the Evidence from the Entity (UPDATE evidence SET entity_id = NULL)",
    enforcedBy: ["evidence_entity_id_case_id_fk"],
  },
  {
    name: "tasks.entity_id",
    query: `SELECT tk."id"::text FROM "tasks" tk JOIN "entities" en ON en."id" = tk."entity_id" WHERE en."case_id" <> tk."case_id"`,
    hint: "detach the Task from the Entity (UPDATE tasks SET entity_id = NULL)",
    enforcedBy: ["tasks_entity_id_case_id_fk"],
  },
  ...evidenceIdsRules("proposals", "Proposal"),
  ...evidenceIdsRules("jobs", "Job"),
];

/**
 * Same-Case foreign keys that no stored row can violate once 0024 has run, because the backfill
 * derived the row's `case_id` from the very parent the key points at. They have no rule; a test
 * checks that these plus the rules' `enforcedBy` are exactly the keys 0026 creates.
 */
export const DERIVED_CASE_FOREIGN_KEYS: readonly string[] = [
  "claims_entity_id_case_id_fk",
  "identifiers_entity_id_case_id_fk",
  "events_entity_id_case_id_fk",
  "questions_entity_id_case_id_fk",
  "edges_from_id_case_id_fk",
  "claim_evidence_claim_id_case_id_fk",
  "identifier_evidence_identifier_id_case_id_fk",
  "edge_evidence_edge_id_case_id_fk",
  "proposal_evidence_proposal_id_case_id_fk",
  "job_evidence_job_id_case_id_fk",
];

/** Every rule: vocabulary columns first, then the structural ones. */
export function invariantRules(): InvariantRule[] {
  return [...vocabularyRules(), ...STRUCTURAL_RULES];
}

/**
 * The body of migration `0025_report_invariant_violations`: a DO block that counts each rule's
 * rows and, when any exist, aborts with one message listing the rule, the count, a sample of
 * keys and the hint. It changes nothing. The migration file is this output for the rules of that
 * day (a test checks the structural rules still match it).
 */
export function renderViolationReportSql(
  rules: readonly InvariantRule[]
): string {
  const values = rules
    .map(
      (rule) =>
        `    (${sqlLiteral(rule.name)}, $q$${rule.query}$q$, ${sqlLiteral(rule.hint)})`
    )
    .join(",\n");
  return `DO $report$
DECLARE
  rule record;
  n bigint;
  sample text;
  report text := '';
  total bigint := 0;
BEGIN
  FOR rule IN SELECT * FROM (VALUES
${values}
  ) AS v(name, query, hint)
  LOOP
    EXECUTE format($f$SELECT count(*), string_agg(k, ', ' ORDER BY k) FILTER (WHERE rn <= 5)
      FROM (SELECT k, row_number() OVER (ORDER BY k) AS rn FROM (%s) AS q(k)) AS numbered$f$, rule.query)
      INTO n, sample;
    IF n > 0 THEN
      total := total + n;
      report := report || format(E'\\n  - %s: %s row(s), e.g. %s. To fix: %s.', rule.name, n, sample, rule.hint);
    END IF;
  END LOOP;
  IF total > 0 THEN
    RAISE EXCEPTION E'Database invariants (#302): % stored row(s) break a rule the next migration enforces. Nothing was changed. Fix or remove the rows listed, then run the migrations again. Every offending row: pnpm --filter @watchdog/db exec tsx scripts/invariant-violations.ts%', total, report
      USING ERRCODE = 'check_violation';
  END IF;
END
$report$;
`;
}
