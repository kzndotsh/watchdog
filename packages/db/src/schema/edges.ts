import {
  foreignKey,
  index,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { CONFIDENCE_TIERS, EDGE_PREDICATES } from "@watchdog/schemas/shared";
import type {
  CaseId,
  ConfidenceTier,
  EdgePredicate,
} from "@watchdog/schemas/shared";

import { attribution, rowVersion, timestamps } from "./_helpers";
import { vocabCheck } from "./_vocab";
import { entities } from "./entities";

/** Edge — directed typed relationship. One direction stored. */
export const edges = pgTable(
  "edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromId: uuid("from_id").notNull(),
    toId: uuid("to_id").notNull(),
    /** The Case of both endpoints: the two foreign keys below carry it, so an Edge cannot span Cases. */
    caseId: uuid("case_id").$type<CaseId>().notNull(),
    predicate: text("predicate").$type<EdgePredicate>().notNull(),
    confidence: text("confidence").$type<ConfidenceTier>().notNull(),
    notes: text("notes"),
    ...timestamps,
    ...attribution,
    ...rowVersion,
  },
  (t) => [
    uniqueIndex("edges_natural_uidx").on(t.fromId, t.toId, t.predicate),
    // Reverse lookup: the natural key leads with from_id, so deleting an Entity checks to_id here.
    index("edges_to_id_idx").on(t.toId),
    // The Connection list (ADR-0007): by predicate or by `updated`, then id, and `q` over the
    // notes (`pg_trgm`). An Entity's Connections (`entityId`, either end) use the two indexes
    // above, led by `from_id` and `to_id`.
    index("edges_case_predicate_idx").on(t.caseId, t.predicate, t.id),
    index("edges_case_updated_idx").on(t.caseId, t.updatedAt, t.id),
    index("edges_notes_trgm_idx").using("gin", t.notes.op("gin_trgm_ops")),
    foreignKey({
      name: "edges_from_id_case_id_fk",
      columns: [t.fromId, t.caseId],
      foreignColumns: [entities.id, entities.caseId],
    }).onDelete("cascade"),
    foreignKey({
      name: "edges_to_id_case_id_fk",
      columns: [t.toId, t.caseId],
      foreignColumns: [entities.id, entities.caseId],
    }).onDelete("cascade"),
    unique("edges_id_case_id_uq").on(t.id, t.caseId),
    vocabCheck(t.predicate, EDGE_PREDICATES),
    vocabCheck(t.confidence, CONFIDENCE_TIERS),
  ]
);
