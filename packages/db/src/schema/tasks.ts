import { index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

import type { TaskPriority, TaskStatus } from "@watchdog/schemas/shared";

import { timestamps, timestamptz } from "./_helpers";
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
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id").references(() => entities.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").$type<TaskStatus>().notNull().default("backlog"),
    priority: text("priority").$type<TaskPriority>(),
    dueDate: timestamptz("due_date"),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("tasks_case_id_idx").on(t.caseId),
    index("tasks_entity_id_idx").on(t.entityId),
    index("tasks_case_status_position_idx").on(t.caseId, t.status, t.position),
  ]
);
