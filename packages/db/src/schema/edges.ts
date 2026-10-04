import { pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import type { ConfidenceTier, EdgePredicate } from "@watchdog/schemas/shared";

import { timestamps } from "./_helpers";
import { entities } from "./entities";

/** Edge — directed typed relationship. One direction stored. */
export const edges = pgTable(
  "edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromId: uuid("from_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    toId: uuid("to_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    predicate: text("predicate").$type<EdgePredicate>().notNull(),
    confidence: text("confidence").$type<ConfidenceTier>().notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [uniqueIndex("edges_natural_uidx").on(t.fromId, t.toId, t.predicate)]
);
