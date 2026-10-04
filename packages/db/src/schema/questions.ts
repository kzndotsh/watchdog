import { pgTable, text, uuid } from "drizzle-orm/pg-core";

import type { QuestionStatus } from "@watchdog/schemas/shared";

import { timestamps } from "./_helpers";
import { entities } from "./entities";

/** Question — light hypothesis sticky on an Entity (not a Claim). */
export const questions = pgTable("questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityId: uuid("entity_id")
    .notNull()
    .references(() => entities.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  status: text("status").$type<QuestionStatus>().notNull().default("open"),
  resolvedNote: text("resolved_note"),
  ...timestamps,
});
