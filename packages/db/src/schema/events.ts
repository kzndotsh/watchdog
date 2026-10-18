import { foreignKey, index, pgTable, text, uuid } from "drizzle-orm/pg-core";

import type { CaseId } from "@watchdog/schemas/shared";

import { timestamps } from "./_helpers";
import { entities } from "./entities";

/**
 * Event — dated happening on an Entity (fuzzy `when` OK as text).
 * Subject = parent entityId (no separate who).
 */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id").notNull(),
    /** The Entity's Case, held so the foreign key below can refuse a cross-Case row. */
    caseId: uuid("case_id").$type<CaseId>().notNull(),
    when: text("when").notNull(),
    what: text("what").notNull(),
    /** Optional prose place. */
    whereText: text("where"),
    ...timestamps,
  },
  (t) => [
    index("events_entity_id_idx").on(t.entityId),
    foreignKey({
      name: "events_entity_id_case_id_fk",
      columns: [t.entityId, t.caseId],
      foreignColumns: [entities.id, entities.caseId],
    }).onDelete("cascade"),
  ]
);
