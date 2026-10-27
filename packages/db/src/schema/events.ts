import { foreignKey, index, pgTable, text, uuid } from "drizzle-orm/pg-core";

import type { CaseId } from "@watchdog/schemas/shared";

import { attribution, rowVersion, timestamps } from "./_helpers";
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
    ...attribution,
    ...rowVersion,
  },
  (t) => [
    // Serves the paged list (keyset on the sort key, then id) and the foreign key's own lookup.
    index("events_entity_when_idx").on(t.entityId, t.when, t.id),
    // The Event list (ADR-0007): the Case's Events by `when` and by `created`, and `q` (`pg_trgm`).
    index("events_case_when_idx").on(t.caseId, t.when, t.id),
    index("events_case_created_idx").on(t.caseId, t.createdAt, t.id),
    index("events_what_trgm_idx").using("gin", t.what.op("gin_trgm_ops")),
    index("events_where_trgm_idx").using("gin", t.whereText.op("gin_trgm_ops")),
    index("events_when_trgm_idx").using("gin", t.when.op("gin_trgm_ops")),
    foreignKey({
      name: "events_entity_id_case_id_fk",
      columns: [t.entityId, t.caseId],
      foreignColumns: [entities.id, entities.caseId],
    }).onDelete("cascade"),
  ]
);
