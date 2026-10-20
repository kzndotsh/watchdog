import {
  foreignKey,
  index,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  CONFIDENCE_TIERS,
  IDENTIFIER_STATUSES,
  IDENTIFIER_TYPES,
} from "@watchdog/schemas/shared";
import type {
  CaseId,
  ConfidenceTier,
  IdentifierStatus,
  IdentifierType,
} from "@watchdog/schemas/shared";

import { attribution, rowVersion, timestamps } from "./_helpers";
import { vocabCheck } from "./_vocab";
import { entities } from "./entities";

/**
 * Identifier — binding value on an Entity.
 * Natural key: (entityId, type, platform, value). Use "" when platform unset.
 */
export const identifiers = pgTable(
  "identifiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id").notNull(),
    /** The Entity's Case, held so the foreign key below can refuse a cross-Case row. */
    caseId: uuid("case_id").$type<CaseId>().notNull(),
    type: text("type").$type<IdentifierType>().notNull(),
    /** Required when type=handle; empty string when unset (unique-friendly). */
    platform: text("platform").notNull().default(""),
    value: text("value").notNull(),
    confidence: text("confidence").$type<ConfidenceTier>().notNull(),
    status: text("status")
      .$type<IdentifierStatus>()
      .notNull()
      .default("unknown"),
    notes: text("notes"),
    ...timestamps,
    ...attribution,
    ...rowVersion,
  },
  (t) => [
    uniqueIndex("identifiers_natural_uidx").on(
      t.entityId,
      t.type,
      t.platform,
      t.value
    ),
    // The paged Identifier list of an Entity: by type, value, then id.
    index("identifiers_entity_type_value_idx").on(
      t.entityId,
      t.type,
      t.value,
      t.id
    ),
    foreignKey({
      name: "identifiers_entity_id_case_id_fk",
      columns: [t.entityId, t.caseId],
      foreignColumns: [entities.id, entities.caseId],
    }).onDelete("cascade"),
    unique("identifiers_id_case_id_uq").on(t.id, t.caseId),
    vocabCheck(t.type, IDENTIFIER_TYPES),
    vocabCheck(t.confidence, CONFIDENCE_TIERS),
    vocabCheck(t.status, IDENTIFIER_STATUSES),
  ]
);
