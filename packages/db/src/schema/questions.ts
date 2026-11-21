import { foreignKey, index, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { QUESTION_STATUSES } from "@watchdog/domain/schemas/shared";
import type { CaseId, QuestionStatus } from "@watchdog/domain/schemas/shared";

import { attribution, rowVersion, timestamps } from "./_helpers";
import {
  caseOrganizationId,
  organizationIsolation,
} from "./_organization-policy";
import { vocabCheck } from "./_vocab";
import { cases } from "./cases";
import { entities } from "./entities";

/** Question — light hypothesis sticky on an Entity (not a Claim). */
export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id").notNull(),
    /** The Entity's Case, held so the foreign key below can refuse a cross-Case row. */
    caseId: uuid("case_id").$type<CaseId>().notNull(),
    /** The Case's organization, for row-level security (#719): `caseOrganizationId`. */
    organizationId: caseOrganizationId(),
    text: text("text").notNull(),
    status: text("status").$type<QuestionStatus>().notNull().default("open"),
    resolvedNote: text("resolved_note"),
    ...timestamps,
    ...attribution,
    ...rowVersion,
  },
  (t) => [
    // Organization isolation (row-level security, #719): the copied organization must be the
    // Case's own, and a row is visible and writable in its organization's transactions only.
    foreignKey({
      name: "questions_case_organization_fk",
      columns: [t.caseId, t.organizationId],
      foreignColumns: [cases.id, cases.organizationId],
    }).onDelete("cascade"),
    organizationIsolation("questions", t.organizationId),
    // Serves the paged list (keyset on the sort key, then id) and the foreign key's own lookup.
    index("questions_entity_created_idx").on(t.entityId, t.createdAt, t.id),
    // The Question list (ADR-0007): the Case's Questions by `created`, and `q` (`pg_trgm`).
    index("questions_case_created_idx").on(t.caseId, t.createdAt, t.id),
    index("questions_text_trgm_idx").using("gin", t.text.op("gin_trgm_ops")),
    index("questions_resolved_note_trgm_idx").using(
      "gin",
      t.resolvedNote.op("gin_trgm_ops")
    ),
    foreignKey({
      name: "questions_entity_id_case_id_fk",
      columns: [t.entityId, t.caseId],
      foreignColumns: [entities.id, entities.caseId],
    }).onDelete("cascade"),
    vocabCheck(t.status, QUESTION_STATUSES),
  ]
);
