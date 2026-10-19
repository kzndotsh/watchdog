import {
  boolean,
  foreignKey,
  index,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import {
  CLAIM_CLASSES,
  CONFIDENCE_TIERS,
  RETRACT_KINDS,
} from "@watchdog/schemas/shared";
import type {
  CaseId,
  ClaimClass,
  ConfidenceTier,
  RetractKind,
} from "@watchdog/schemas/shared";

import { attribution, rowVersion, timestamps, timestamptz } from "./_helpers";
import { vocabCheck } from "./_vocab";
import { entities } from "./entities";

/** Claim — asserted statement on an Entity. Default views hide retracted. */
export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id").notNull(),
    /** The Entity's Case, held so the foreign key below can refuse a cross-Case row. */
    caseId: uuid("case_id").$type<CaseId>().notNull(),
    class: text("class").$type<ClaimClass>().notNull().default("observation"),
    text: text("text").notNull(),
    confidence: text("confidence").$type<ConfidenceTier>().notNull(),
    retracted: boolean("retracted").notNull().default(false),
    retractKind: text("retract_kind").$type<RetractKind>(),
    retractedReason: text("retracted_reason"),
    retractedBy: text("retracted_by"),
    retractedAt: timestamptz("retracted_at"),
    supersededByClaimId: uuid("superseded_by_claim_id"),
    ...timestamps,
    ...attribution,
    ...rowVersion,
  },
  (t) => [
    index("claims_entity_id_idx").on(t.entityId),
    foreignKey({
      name: "claims_entity_id_case_id_fk",
      columns: [t.entityId, t.caseId],
      foreignColumns: [entities.id, entities.caseId],
    }).onDelete("cascade"),
    unique("claims_id_case_id_uq").on(t.id, t.caseId),
    vocabCheck(t.class, CLAIM_CLASSES),
    vocabCheck(t.confidence, CONFIDENCE_TIERS),
    vocabCheck(t.retractKind, RETRACT_KINDS),
  ]
);
