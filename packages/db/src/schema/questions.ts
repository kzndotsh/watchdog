import { foreignKey, index, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { QUESTION_STATUSES } from "@watchdog/schemas/shared";
import type { CaseId, QuestionStatus } from "@watchdog/schemas/shared";

import { attribution, rowVersion, timestamps } from "./_helpers";
import { vocabCheck } from "./_vocab";
import { entities } from "./entities";

/** Question — light hypothesis sticky on an Entity (not a Claim). */
export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id").notNull(),
    /** The Entity's Case, held so the foreign key below can refuse a cross-Case row. */
    caseId: uuid("case_id").$type<CaseId>().notNull(),
    text: text("text").notNull(),
    status: text("status").$type<QuestionStatus>().notNull().default("open"),
    resolvedNote: text("resolved_note"),
    ...timestamps,
    ...attribution,
    ...rowVersion,
  },
  (t) => [
    index("questions_entity_id_idx").on(t.entityId),
    foreignKey({
      name: "questions_entity_id_case_id_fk",
      columns: [t.entityId, t.caseId],
      foreignColumns: [entities.id, entities.caseId],
    }).onDelete("cascade"),
    vocabCheck(t.status, QUESTION_STATUSES),
  ]
);
