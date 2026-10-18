import { pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { ENTITY_KINDS } from "@watchdog/schemas/shared";
import type { EntityKind, CaseId } from "@watchdog/schemas/shared";

import { attribution, timestamps } from "./_helpers";
import { vocabCheck } from "./_vocab";
import { cases } from "./cases";

/** Entity — exclusive to one Case. slug unique per Case. */
export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .$type<CaseId>()
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    kind: text("kind").$type<EntityKind>().notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    summary: text("summary"),
    notes: text("notes"),
    ...timestamps,
    ...attribution,
  },
  (t) => [
    uniqueIndex("entities_case_slug_uidx").on(t.caseId, t.slug),
    // The target of the same-Case foreign keys on every row that hangs off an Entity.
    unique("entities_id_case_id_uq").on(t.id, t.caseId),
    vocabCheck(t.kind, ENTITY_KINDS),
  ]
);
