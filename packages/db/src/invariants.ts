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
};

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** One rule per vocabulary column, from the same registry that builds the CHECK constraints. */
export function vocabularyRules(): InvariantRule[] {
  return vocabChecks().map(({ schema, table, column, values }) => ({
    name: `${table}.${column}`,
    query: `SELECT "id"::text FROM "${schema}"."${table}" WHERE "${column}" IS NOT NULL AND "${column}" NOT IN (${values.map(sqlLiteral).join(", ")})`,
    hint: `set the value to one of ${values.join("/")} (packages/schemas/src/vocab.ts), or delete the row`,
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
  };
}

function evidenceIdsUnresolved(
  table: "proposals" | "jobs",
  name: string
): InvariantRule {
  return {
    name: `${table}.evidence_ids`,
    query: [
      `SELECT p."id"::text || '/' || t."val" FROM "${table}" p`,
      `CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(p."evidence_ids") = 'array' THEN p."evidence_ids" ELSE '[]'::jsonb END) AS t("val")`,
      `WHERE btrim(t."val") <> '' AND NOT EXISTS (SELECT 1 FROM "evidence" ev WHERE ev."id"::text = lower(btrim(t."val")) AND ev."case_id" = p."case_id")`,
    ].join(" "),
    hint: `remove the id from the ${name}'s evidence_ids (UPDATE ${table} SET evidence_ids = evidence_ids - '<id>'), or restore the Evidence it names`,
  };
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
  },
  {
    name: "evidence.entity_id",
    query: `SELECT ev."id"::text FROM "evidence" ev JOIN "entities" en ON en."id" = ev."entity_id" WHERE en."case_id" <> ev."case_id"`,
    hint: "detach the Evidence from the Entity (UPDATE evidence SET entity_id = NULL)",
  },
  {
    name: "tasks.entity_id",
    query: `SELECT tk."id"::text FROM "tasks" tk JOIN "entities" en ON en."id" = tk."entity_id" WHERE en."case_id" <> tk."case_id"`,
    hint: "detach the Task from the Entity (UPDATE tasks SET entity_id = NULL)",
  },
  evidenceIdsUnresolved("proposals", "Proposal"),
  evidenceIdsUnresolved("jobs", "Job"),
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
