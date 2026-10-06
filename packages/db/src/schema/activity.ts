import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  customType,
  index,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import type { ActivityEntryKind } from "@watchdog/schemas/feed";
import type { CaseId } from "@watchdog/schemas/shared";

import { createdAt, timestamptz } from "./_helpers";
import { cases } from "./cases";

/**
 * Postgres `xid8` (a 64-bit transaction id). The driver returns it as decimal
 * text, which is how the cursor carries it (it can exceed 2^53).
 */
const xid8 = customType<{ data: string; driverData: string }>({
  dataType() {
    return "xid8";
  },
});

/**
 * The activity log (ADR-0005): append-only, one row per domain change, written
 * in the same transaction as the change by `activityLogRepo.append`. The
 * `AFTER INSERT` trigger `activity_notify` sends the NOTIFY (migration
 * `activity_trigger_and_backfill`), so a rolled-back write leaves neither a
 * row nor a signal. Not a Graph audit (see `graph_writes`).
 *
 * `(xid, id)` is the commit-safe cursor: `xid` is the writing transaction, and
 * the tailer only reads rows whose xid is below every still-running transaction.
 */
export const activity = pgTable(
  "activity",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    xid: xid8("xid")
      .notNull()
      .default(sql`pg_current_xact_id()`),
    caseId: uuid("case_id")
      .$type<CaseId>()
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    /** The subject noun (`ACTIVITY_ENTRY_KINDS`). */
    kind: text("kind").$type<ActivityEntryKind>().notNull(),
    /** A verb from the closed list for the kind (`ACTIVITY_ENTRY_ACTIONS`). */
    action: text("action").notNull(),
    subjectId: uuid("subject_id"),
    /** The playbook run, so the feed can collapse step Jobs (S2). */
    groupId: uuid("group_id"),
    /** Display snapshot, at most 200 characters; never a body, patch or secret. */
    label: text("label"),
    actorId: text("actor_id"),
    actorLabel: text("actor_label"),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    createdAt,
  },
  (t) => [
    index("activity_xid_id_idx").on(t.xid, t.id),
    index("activity_case_id_id_idx").on(t.caseId, t.id.desc()),
    check("activity_label_len", sql`char_length(${t.label}) <= 200`),
  ]
);

/**
 * A durable read position in the log, one row per consumer (ADR-0005 decision
 * 4, S5): the worker export consumer resumes from it after a restart.
 * `(xid, id)` is the last entry the consumer finished handling. Not a Graph
 * table and not an audit: a consumer with no row starts at the head.
 */
export const activityCursors = pgTable("activity_cursors", {
  consumer: text("consumer").primaryKey(),
  xid: xid8("xid").notNull(),
  id: bigint("id", { mode: "number" }).notNull(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});
