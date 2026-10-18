import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  jsonb,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  CaseId,
  GraphHistoryChannel,
  GraphHistoryKind,
  GraphHistoryOp,
} from "@watchdog/schemas/shared";

import { timestamptz } from "./_helpers";
import { cases } from "./cases";

/** A Graph row as JSON at one moment (dates as ISO text). */
export type GraphHistorySnapshotJson = Record<string, unknown>;

/**
 * Append-only history of every Graph row (issue #303): one row per create,
 * update, retract and delete, written in the change's own transaction by
 * `appendGraphActivityEffect` (core), the one function every Graph write path
 * calls. `before` / `after` are full-row snapshots (null on the missing side
 * of a create or delete), so any past state reads without replaying diffs.
 *
 * Never updated, never pruned while the Case exists: the migration
 * `protect_graph_history` installs a trigger that refuses UPDATE and refuses a
 * DELETE whose Case still exists (the Case's own cascade is the only purge), and
 * revokes UPDATE/DELETE from the app role where it exists. `row_id` is a soft
 * reference: the row may be deleted, its history stays.
 */
export const graphHistory = pgTable(
  "graph_history",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    caseId: uuid("case_id")
      .$type<CaseId>()
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    kind: text("kind").$type<GraphHistoryKind>().notNull(),
    rowId: uuid("row_id").notNull(),
    op: text("op").$type<GraphHistoryOp>().notNull(),
    channel: text("channel").$type<GraphHistoryChannel>().notNull(),
    /** The user; null for a system write. A key's user is recorded here, the key in `actorLabel`. */
    actorId: text("actor_id"),
    /** API-key display snapshot (`api-key:...`), never a user name. */
    actorLabel: text("actor_label"),
    before: jsonb("before").$type<GraphHistorySnapshotJson>(),
    after: jsonb("after").$type<GraphHistorySnapshotJson>(),
    at: timestamptz("at").notNull().defaultNow(),
  },
  (t) => [
    // The read path (one row's history, newest first) and the Case FK check.
    index("graph_history_case_row_idx").on(
      t.caseId,
      t.kind,
      t.rowId,
      t.id.desc()
    ),
    check(
      "graph_history_op_shape",
      sql`(${t.op} = 'create' AND ${t.before} IS NULL AND ${t.after} IS NOT NULL)
        OR (${t.op} = 'delete' AND ${t.before} IS NOT NULL AND ${t.after} IS NULL)
        OR (${t.op} IN ('update', 'retract') AND ${t.before} IS NOT NULL AND ${t.after} IS NOT NULL)`
    ),
  ]
);
