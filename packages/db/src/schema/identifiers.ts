import { pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import type {
  ConfidenceTier,
  IdentifierStatus,
  IdentifierType,
} from "@watchdog/schemas/shared";

import { timestamps } from "./_helpers";
import { entities } from "./entities";

/**
 * Identifier — binding value on an Entity.
 * Natural key: (entityId, type, platform, value). Use "" when platform unset.
 */
export const identifiers = pgTable(
  "identifiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
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
  },
  (t) => [
    uniqueIndex("identifiers_natural_uidx").on(
      t.entityId,
      t.type,
      t.platform,
      t.value
    ),
  ]
);
