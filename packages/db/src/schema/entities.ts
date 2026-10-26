import {
  index,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { ENTITY_KINDS } from "@watchdog/schemas/shared";
import type { EntityKind, CaseId } from "@watchdog/schemas/shared";

import { attribution, rowVersion, timestamps } from "./_helpers";
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
    ...rowVersion,
  },
  (t) => [
    uniqueIndex("entities_case_slug_uidx").on(t.caseId, t.slug),
    // The paged Entity list: by name, then id.
    index("entities_case_name_idx").on(t.caseId, t.name, t.id),
    // The Entity list's `updated` sort (`entity-list.repo.ts`, ADR-0007): the pickers' recent view.
    index("entities_case_updated_idx").on(
      t.caseId,
      t.updatedAt.desc().nullsFirst(),
      t.id.desc().nullsFirst()
    ),
    // `q`: trigram indexes over the Entity list's search fields (`pg_trgm`, migration 0002).
    index("entities_name_trgm_idx").using("gin", t.name.op("gin_trgm_ops")),
    index("entities_summary_trgm_idx").using(
      "gin",
      t.summary.op("gin_trgm_ops")
    ),
    index("entities_notes_trgm_idx").using("gin", t.notes.op("gin_trgm_ops")),
    // The target of the same-Case foreign keys on every row that hangs off an Entity.
    unique("entities_id_case_id_uq").on(t.id, t.caseId),
    vocabCheck(t.kind, ENTITY_KINDS),
  ]
);
