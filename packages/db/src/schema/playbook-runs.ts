import { jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import type { JsonObject, PlaybookRunStatus } from "@watchdog/schemas";

import { createdAt, timestamptz } from "./_helpers";
import { cases } from "./cases";

export const playbookRuns = pgTable("playbook_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  playbookId: text("playbook_id").notNull(),
  seed: jsonb("seed").$type<JsonObject>().notNull(),
  status: text("status")
    .$type<PlaybookRunStatus>()
    .notNull()
    .default("running"),
  actorId: text("actor_id").notNull(),
  actorLabel: text("actor_label"),
  createdAt,
  finishedAt: timestamptz("finished_at"),
});
