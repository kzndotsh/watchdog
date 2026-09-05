import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";

import type { ActivityKind } from "@watchdog/schemas";

import { createdAt } from "./_helpers";
import { cases } from "./cases";

/**
 * Append-only activity events for workspace Recent activity.
 * Task status transitions live here so the feed can show from → to diffs.
 * Not a Graph audit (see graph_writes).
 */
export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    /** Record kind — task today; evidence/job/proposal may join later. */
    kind: text("kind").$type<ActivityKind>().notNull(),
    /**
     * Event verb code: created | status_changed | updated | deleted
     * Display labels are derived in core.
     */
    action: text("action").notNull(),
    /** Source row id (e.g. task id). */
    subjectId: uuid("subject_id").notNull(),
    label: text("label").notNull(),
    actorId: text("actor_id"),
    /** Previous status (status_changed). */
    fromValue: text("from_value"),
    /** New status (created / status_changed). */
    toValue: text("to_value"),
    createdAt,
  },
  (t) => [
    index("activity_events_case_id_created_at_idx").on(t.caseId, t.createdAt),
    index("activity_events_created_at_idx").on(t.createdAt),
  ]
);
