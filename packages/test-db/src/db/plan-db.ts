import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import type { Pool } from "@watchdog/db";
import * as schema from "@watchdog/db/schema";

import type { CapturedStatement } from "./query-count.ts";
import {
  isExplainable,
  isTransactionControl,
  planFromExplainRows,
  type PlanNode,
} from "./query-shape.ts";

/**
 * A second database for plan assertions at audit scale (ADR-0007): the perf seed
 * (`scripts/perf-seed.sh`, a private `wd_perf_*` database), never the shared test database,
 * whose handful of rows makes the planner rightly prefer a sequential scan. Statements are
 * captured off this pool's own client, then explained on it with the planner's own choices
 * (no `enable_seqscan = off`). Only plain SELECT / WITH statements are explained.
 */
export type PlanDb = {
  /** The drizzle handle over the pool: `Db.layerOf(planDb.db)` runs core against it. */
  readonly db: Pool["db"];
  /** Runs `fn` and returns the statements this pool sent meanwhile (not reentrant). */
  readonly capture: <T>(
    fn: () => Promise<T>
  ) => Promise<{ result: T; statements: CapturedStatement[] }>;
  /** `EXPLAIN (FORMAT JSON)`: the plan, nothing executed. */
  readonly plan: (statement: CapturedStatement) => Promise<PlanNode>;
  /** `EXPLAIN (ANALYZE, TIMING OFF, FORMAT JSON)`: runs the SELECT and returns the server's execution time (no per-node timing overhead). */
  readonly executionMs: (statement: CapturedStatement) => Promise<number>;
  /** Per index of `table`: its key columns or expressions, in order. */
  readonly indexKeys: (
    table: string
  ) => Promise<Readonly<Record<string, readonly string[]>>>;
  /** The id of a Case by slug, or null. */
  readonly caseIdBySlug: (slug: string) => Promise<string | null>;
  readonly end: () => Promise<void>;
};

function explainable(statement: CapturedStatement): CapturedStatement {
  if (!isExplainable(statement.sql)) {
    throw new Error(
      `plan-db: only SELECT / WITH statements are explained, got: ${statement.sql}`
    );
  }
  return statement;
}

function executionTimeOf(rows: readonly unknown[]): number {
  const row = rows[0];
  const doc =
    typeof row === "object" && row !== null && "QUERY PLAN" in row
      ? row["QUERY PLAN"]
      : undefined;
  const entry: unknown = Array.isArray(doc) ? doc[0] : undefined;
  const time =
    typeof entry === "object" && entry !== null && "Execution Time" in entry
      ? entry["Execution Time"]
      : undefined;
  if (typeof time !== "number") throw new Error("EXPLAIN gave no time");
  return time;
}

/**
 * The planner costs of the repo's documented Postgres tuning (`docker-compose.yml`,
 * `docs/how-to/local-dev.md`), set on every session of the plan pool, so an untuned server (the
 * CI service container, image defaults `random_page_cost=4`, `work_mem=4MB`) is asked the same
 * question as the dev one.
 */
export const PLAN_SESSION_SETTINGS = {
  random_page_cost: "1.1",
  work_mem: "16MB",
} as const;

export function openPlanDb(url: string): PlanDb {
  const client = postgres(url, {
    max: 2,
    idle_timeout: 20,
    connection: PLAN_SESSION_SETTINGS,
  });
  const { options } = client;
  return {
    db: drizzle(client, { schema }),
    async capture(fn) {
      if (options.debug !== false) {
        throw new Error("plan-db: nested or concurrent capture");
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
    },
    async plan(statement) {
      const { sql, params } = explainable(statement);
      return planFromExplainRows(
        await client.unsafe(`EXPLAIN (FORMAT JSON) ${sql}`, [...params])
      );
    },
    async executionMs(statement) {
      const { sql, params } = explainable(statement);
      return executionTimeOf(
        await client.unsafe(
          `EXPLAIN (ANALYZE, TIMING OFF, FORMAT JSON) ${sql}`,
          [...params]
        )
      );
    },
    async indexKeys(table) {
      const rows = await client.unsafe<
        { index: string; position: number; key: string }[]
      >(
        `SELECT c.relname AS index, k.position, pg_get_indexdef(i.indexrelid, k.position, true) AS key
           FROM pg_index i
           JOIN pg_class c ON c.oid = i.indexrelid
           JOIN pg_class t ON t.oid = i.indrelid
           CROSS JOIN LATERAL generate_series(1, i.indnkeyatts) AS k(position)
          WHERE t.relname = $1
          ORDER BY c.relname, k.position`,
        [table]
      );
      const keys: Record<string, string[]> = {};
      for (const row of rows) (keys[row.index] ??= []).push(row.key);
      return keys;
    },
    async caseIdBySlug(slug) {
      const rows = await client.unsafe<{ id: string }[]>(
        "SELECT id FROM cases WHERE slug = $1 AND deleted_at IS NULL",
        [slug]
      );
      return rows[0]?.id ?? null;
    },
    async end() {
      await client.end({ timeout: 5 });
    },
  };
}
