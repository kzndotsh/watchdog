import { expect } from "vitest";

import { client } from "@watchdog/db";

import {
  expectNoSeqScan,
  isExplainable,
  isTransactionControl,
  planFromExplainRows,
  touchesTable,
  type PlanNode,
} from "./query-shape.ts";

type Param = NonNullable<Parameters<typeof client.unsafe>[1]>[number];

/** One SQL statement as postgres.js sent it: drizzle's text with `$n` placeholders, and its values. */
export type CapturedStatement = {
  readonly sql: string;
  readonly params: readonly Param[];
};

// The one seam: postgres.js calls `options.debug` for every statement it sends, on every
// connection of the shared test client, and reads it per query. Drizzle and core's `tryDb` /
// `tryDbWith` all end up on this client, so nothing in the code under test changes.
const { options } = client;

/**
 * Runs `fn` and returns its result with every SQL statement the test client executed meanwhile
 * (BEGIN / COMMIT / SAVEPOINT are left out). Statements from other work running concurrently
 * on the client are counted too, so `await` everything the path starts. Not reentrant.
 */
export async function captureStatements<T>(
  fn: () => Promise<T>
): Promise<{ result: T; statements: CapturedStatement[] }> {
  if (options.debug !== false) {
    throw new Error("captureStatements: nested or concurrent capture");
  }
  const statements: CapturedStatement[] = [];
  options.debug = (_connection, query, parameters) => {
    if (!isTransactionControl(query)) {
      statements.push({ sql: query, params: parameters });
    }
  };
  try {
    return { result: await fn(), statements };
  } finally {
    options.debug = false;
  }
}

/**
 * A query-count budget: runs `fn` and fails unless it executed exactly `budget` statements
 * (or at most `budget.max`). Returns `fn`'s result. The failure lists the SQL, so a regression
 * (an N+1, a repeated guard) shows what ran.
 */
export async function expectQueries<T>(
  budget: number | { readonly max: number },
  fn: () => Promise<T>
): Promise<T> {
  const { result, statements } = await captureStatements(fn);
  const listing = statements.map((s, i) => `  ${i + 1}. ${s.sql}`).join("\n");
  if (typeof budget === "number") {
    expect(
      statements.length,
      `expected ${budget} statement(s), ran ${statements.length}:\n${listing}`
    ).toBe(budget);
  } else {
    expect(
      statements.length,
      `expected at most ${budget.max} statement(s), ran ${statements.length}:\n${listing}`
    ).toBeLessThanOrEqual(budget.max);
  }
  return result;
}

/**
 * The plan Postgres picks for a captured SELECT / WITH statement, from plain `EXPLAIN` (never
 * `ANALYZE`, so nothing executes). By default `enable_seqscan` is off for the explain only, so
 * a test database with a handful of rows still shows whether an index CAN serve the query: a
 * remaining `Seq Scan` then means no usable index. Pass `{ seqScan: "planner" }` to see the
 * planner's own choice instead.
 */
export async function explainPlan(
  statement: CapturedStatement,
  opts?: { readonly seqScan?: "off" | "planner" }
): Promise<PlanNode> {
  if (!isExplainable(statement.sql)) {
    throw new Error(
      `explainPlan: only SELECT / WITH statements are explained, got: ${statement.sql}`
    );
  }
  const rows = await client.begin(async (tx) => {
    if (opts?.seqScan !== "planner") {
      await tx.unsafe("SET LOCAL enable_seqscan = off");
    }
    return tx.unsafe(`EXPLAIN (FORMAT JSON) ${statement.sql}`, [
      ...statement.params,
    ]);
  });
  return planFromExplainRows(rows);
}

/**
 * For every captured SELECT / WITH statement that reads `table`, fails if its plan (see
 * `explainPlan`) has a `Seq Scan` on it. Fails too when no statement touched the table, so a
 * renamed table cannot make the assertion pass vacuously.
 */
export async function expectNoSeqScanOn(
  statements: readonly CapturedStatement[],
  table: string
): Promise<void> {
  const reads = statements.filter(
    (s) => isExplainable(s.sql) && touchesTable(s.sql, table)
  );
  expect(reads, `no SELECT statement read "${table}"`).not.toHaveLength(0);
  const plans = await Promise.all(reads.map(async (s) => explainPlan(s)));
  for (const plan of plans) expectNoSeqScan(plan, table);
}
