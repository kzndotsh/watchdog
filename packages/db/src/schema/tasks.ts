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
    // The Task list's `entityId` filter (selective: the Dossier tab) under the default sort; it
    // also serves the Entity foreign key.
    index("tasks_entity_updated_idx").on(
      t.entityId,
      t.updatedAt.desc().nullsFirst(),
      t.id.desc().nullsFirst()
    ),
    // A column's next position and its reorder.
    index("tasks_case_status_position_idx").on(t.caseId, t.status, t.position),
    // The Task list's `status` filter (selective: the board's Done and Dropped columns) under the
    // default sort.
    index("tasks_case_status_updated_idx").on(
      t.caseId,
      t.status,
      t.updatedAt.desc().nullsFirst(),
      t.id.desc().nullsFirst()
    ),
    // The Task list's sorts (ADR-0007), each led by the Case and ending in the id. `position`
    // is also the board's order (`tasks.board`).
    index("tasks_case_updated_idx").on(
      t.caseId,
      t.updatedAt.desc().nullsFirst(),
      t.id.desc().nullsFirst()
    ),
    index("tasks_case_title_idx").on(t.caseId, t.title, t.id),
    index("tasks_case_position_idx").on(t.caseId, t.position, t.id),
    // `q`: trigram indexes over the Task list's search fields (`pg_trgm`, migration 0002).
    index("tasks_title_trgm_idx").using("gin", t.title.op("gin_trgm_ops")),
    index("tasks_description_trgm_idx").using(
      "gin",
      t.description.op("gin_trgm_ops")
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
