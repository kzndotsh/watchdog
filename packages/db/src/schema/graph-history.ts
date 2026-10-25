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

import {
  GRAPH_HISTORY_CHANNELS,
  GRAPH_HISTORY_KINDS,
  GRAPH_HISTORY_OPS,
  type CaseId,
  type GraphHistoryChannel,
  type GraphHistoryKind,
  type GraphHistoryOp,
} from "@watchdog/schemas/shared";

import { timestamptz } from "./_helpers";
import { vocabCheck } from "./_vocab";
import { cases } from "./cases";

/** A Graph row as JSON at one moment (dates as ISO text). */
export type GraphHistorySnapshotJson = Record<string, unknown>;

/**
 * Append-only history of every Graph row (issue #303): one row per create,
 * update, retract and delete, written by database triggers on the seven Graph
 * tables (`0001_database_logic`) in the change's own transaction,
 * so no write path can skip it. `before` / `after` are full-row snapshots (the
 * database's `to_jsonb`, snake_case; null on the missing side of a create or
 * delete; a Claim, Identifier or Edge also carries `evidence_ids`).
 *
 * Never updated, never pruned while the Case exists: a trigger refuses UPDATE,
 * a DELETE whose Case still exists, and TRUNCATE, and the app role has SELECT
 * only. `row_id` is a soft reference: the row may be deleted, its history stays.
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
    /** The API key (Better Auth `apikey.id`, no FK: a deleted key keeps its history) that made the change; null for a session or a system write. */
    actorKeyId: text("actor_key_id"),
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
    vocabCheck(t.kind, GRAPH_HISTORY_KINDS),
    vocabCheck(t.op, GRAPH_HISTORY_OPS),
    vocabCheck(t.channel, GRAPH_HISTORY_CHANNELS),
    check(
      "graph_history_op_shape",
      sql`(${t.op} = 'create' AND ${t.before} IS NULL AND ${t.after} IS NOT NULL)
        OR (${t.op} = 'delete' AND ${t.before} IS NOT NULL AND ${t.after} IS NULL)
        OR (${t.op} IN ('update', 'retract') AND ${t.before} IS NOT NULL AND ${t.after} IS NOT NULL)`
    ),
  ]
);
