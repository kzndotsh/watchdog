import {
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import {
  PLAYBOOK_RUN_OUTCOMES,
  PLAYBOOK_RUN_STATUSES,
} from "@watchdog/schemas/shared";
import type {
  JsonObject,
  PlaybookRunOutcome,
  PlaybookRunStatus,
  CaseId,
} from "@watchdog/schemas/shared";

import { timestamps, timestamptz } from "./_helpers";
import {
  caseOrganizationId,
  organizationIsolation,
} from "./_organization-policy";
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
    /** The Case's organization, for row-level security (#719): `caseOrganizationId`. */
    organizationId: caseOrganizationId(),
    playbookId: text("playbook_id").notNull(),
    seed: jsonb("seed").$type<JsonObject>().notNull(),
    status: text("status")
      .$type<PlaybookRunStatus>()
      .notNull()
      .default("running"),
    /** How the run went, set when it finishes (null while running and for a cancelled run). */
    outcome: text("outcome").$type<PlaybookRunOutcome>(),
    actorId: text("actor_id").notNull(),
    actorLabel: text("actor_label"),
    /** The API key that started the run (no FK); each chained step Job copies it. */
    actorKeyId: text("actor_key_id"),
    ...timestamps,
    finishedAt: timestamptz("finished_at"),
  },
  (t) => [
    // Organization isolation (row-level security, #719): the copied organization must be the
    // Case's own, and a row is visible and writable in its organization's transactions only. A
    // copy rather than a lookup through `cases`: the Job list and Case search join every Job's
    // run, and a lookup there is a subplan per joined row.
    foreignKey({
      name: "playbook_runs_case_organization_fk",
      columns: [t.caseId, t.organizationId],
      foreignColumns: [cases.id, cases.organizationId],
    }).onDelete("cascade"),
    organizationIsolation("playbook_runs", t.organizationId),
    index("playbook_runs_case_id_idx").on(t.caseId),
    vocabCheck(t.status, PLAYBOOK_RUN_STATUSES),
    vocabCheck(t.outcome, PLAYBOOK_RUN_OUTCOMES),
  ]
);
