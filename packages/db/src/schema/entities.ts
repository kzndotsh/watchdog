import { pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import type { EntityKind, CaseId } from "@watchdog/schemas/shared";

import { timestamps } from "./_helpers";
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
  },
  (t) => [uniqueIndex("entities_case_slug_uidx").on(t.caseId, t.slug)]
);
