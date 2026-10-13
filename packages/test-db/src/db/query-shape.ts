import { expect } from "vitest";

/**
 * Pure helpers behind `query-count.ts`: no database, so unit tests cover them.
 * `PlanNode` is the slice of `EXPLAIN (FORMAT JSON)` output the assertions read.
 */
export type PlanNode = {
  readonly "Node Type": string;
  readonly "Relation Name"?: string;
  readonly Plans?: readonly PlanNode[];
};

function isPlanNode(value: unknown): value is PlanNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "Node Type" in value &&
    typeof value["Node Type"] === "string"
  );
}

/** The root plan from the rows of `EXPLAIN (FORMAT JSON)`: `[{ "QUERY PLAN": [{ Plan }] }]`. */
export function planFromExplainRows(rows: readonly unknown[]): PlanNode {
  const row = rows[0];
  const doc =
    typeof row === "object" && row !== null && "QUERY PLAN" in row
      ? row["QUERY PLAN"]
      : undefined;
  const entry: unknown = Array.isArray(doc) ? doc[0] : undefined;
  const plan =
    typeof entry === "object" && entry !== null && "Plan" in entry
      ? entry.Plan
      : undefined;
  if (!isPlanNode(plan)) throw new Error("EXPLAIN returned no plan");
  return plan;
}

function* walk(node: PlanNode): Generator<PlanNode> {
  yield node;
  for (const child of node.Plans ?? []) yield* walk(child);
}

/** Relation names of every `Seq Scan` node in the plan, in tree order. */
export function seqScanRelations(plan: PlanNode): string[] {
  const relations: string[] = [];
  for (const node of walk(plan)) {
    const relation = node["Relation Name"];
    if (node["Node Type"] === "Seq Scan" && relation !== undefined) {
      relations.push(relation);
    }
  }
  return relations;
}

/** Fails when `table` is read by a `Seq Scan` anywhere in the plan. */
export function expectNoSeqScan(plan: PlanNode, table: string): void {
  expect(
    seqScanRelations(plan),
    `Seq Scan on "${table}" (an index should serve this query)`
  ).not.toContain(table);
}

const TRANSACTION_CONTROL = /^\s*(begin|commit|rollback|savepoint|release)\b/i;

/** BEGIN / COMMIT / ROLLBACK / SAVEPOINT / RELEASE: not counted as a statement of the code path. */
export function isTransactionControl(sql: string): boolean {
  return TRANSACTION_CONTROL.test(sql);
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** True when `sql` names `table`, bare or double-quoted (drizzle quotes every identifier). */
export function touchesTable(sql: string, table: string): boolean {
  if (!IDENTIFIER.test(table)) {
    throw new Error(`touchesTable: not a plain identifier: ${table}`);
  }
  return new RegExp(`(?<![\\w"])"?${table}"?(?![\\w"])`).test(sql);
}

/** `sql` with quoted identifiers and string literals blanked, so keywords inside them do not count. */
function withoutQuoted(sql: string): string {
  return sql.replaceAll(/"(?:[^"]|"")*"|'(?:[^']|'')*'/g, "''");
}

const WRITE_OR_BATCH = /;|\b(insert|update|delete|merge|into)\b/i;

/**
 * Only plain SELECT / WITH statements are explained, and always without ANALYZE (which would
 * execute the statement): a write is never run by a plan assertion. Plain EXPLAIN does not
 * execute its statement at all, so rejecting data-modifying CTEs (`WITH x AS (DELETE ...)`),
 * `SELECT ... INTO` and a second statement after `;` is defense in depth, in case a later change
 * adds ANALYZE or the text is not what drizzle generated. It also rejects `FOR UPDATE` reads.
 */
export function isExplainable(sql: string): boolean {
  return (
    /^\s*(select|with)\b/i.test(sql) && !WRITE_OR_BATCH.test(withoutQuoted(sql))
  );
}
