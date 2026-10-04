import { boolean, index, pgTable, text, uuid } from "drizzle-orm/pg-core";

import type {
  ClaimClass,
  ConfidenceTier,
  RetractKind,
} from "@watchdog/schemas/shared";

import { timestamps, timestamptz } from "./_helpers";
import { entities } from "./entities";

/** Claim — asserted statement on an Entity. Default views hide retracted. */
export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
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
  },
  (t) => [index("claims_entity_id_idx").on(t.entityId)]
);
