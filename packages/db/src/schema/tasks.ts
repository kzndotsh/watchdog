import {
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { TASK_PRIORITIES, TASK_STATUSES } from "@watchdog/schemas/shared";
import type {
  TaskPriority,
  TaskStatus,
  CaseId,
} from "@watchdog/schemas/shared";

import { attribution, timestamps, timestamptz } from "./_helpers";
import { vocabCheck } from "./_vocab";
import { cases } from "./cases";
import { entities } from "./entities";

/**
 * Investigator work item — case-scoped, optionally linked to an Entity.
 * Not a Graph write.
 */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .$type<CaseId>()
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    /** Optional Entity of the same Case (composite foreign key below). */
    entityId: uuid("entity_id"),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").$type<TaskStatus>().notNull().default("backlog"),
    priority: text("priority").$type<TaskPriority>(),
    dueDate: timestamptz("due_date"),
    position: integer("position").notNull().default(0),
    ...timestamps,
    ...attribution,
  },
  (t) => [
    index("tasks_entity_id_idx").on(t.entityId),
    index("tasks_case_status_position_idx").on(t.caseId, t.status, t.position),
    // The paged Task list: by position, creation time, then id.
    index("tasks_case_position_idx").on(
      t.caseId,
      t.position,
      t.createdAt,
      t.id
    ),
    // `ON DELETE SET NULL (entity_id)`: only the Entity column is cleared. HAND EDIT in the custom
    // migration (see evidence.ts); `same-case-integrity.int.test.ts` fails if a regeneration drops it.
    foreignKey({
      name: "tasks_entity_id_case_id_fk",
      columns: [t.entityId, t.caseId],
      foreignColumns: [entities.id, entities.caseId],
    }).onDelete("set null"),
    vocabCheck(t.status, TASK_STATUSES),
    vocabCheck(t.priority, TASK_PRIORITIES),
  ]
);
