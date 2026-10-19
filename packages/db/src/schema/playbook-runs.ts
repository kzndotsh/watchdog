import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { PLAYBOOK_RUN_STATUSES } from "@watchdog/schemas/shared";
import type {
  JsonObject,
  PlaybookRunStatus,
  CaseId,
} from "@watchdog/schemas/shared";

import { createdAt, timestamptz } from "./_helpers";
import { vocabCheck } from "./_vocab";
import { cases } from "./cases";

export const playbookRuns = pgTable(
  "playbook_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .$type<CaseId>()
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
    /** The API key that started the run (no FK); each chained step Job copies it. */
    actorKeyId: text("actor_key_id"),
    createdAt,
    finishedAt: timestamptz("finished_at"),
  },
  (t) => [
    index("playbook_runs_case_id_idx").on(t.caseId),
    vocabCheck(t.status, PLAYBOOK_RUN_STATUSES),
  ]
);
