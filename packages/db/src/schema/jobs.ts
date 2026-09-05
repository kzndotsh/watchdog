import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { JobHandoff, JobStatus, JsonObject } from "@watchdog/schemas";

import { timestamps, timestamptz } from "./_helpers";
import { cases } from "./cases";
import { playbookRuns } from "./playbook-runs";

export type { JobHandoff } from "@watchdog/schemas";

export interface JobArtifact {
  name: string;
  mime: string;
  uri: string;
  sha256: string;
}

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    capabilityId: text("capability_id").notNull(),
    input: jsonb("input").$type<JsonObject>().notNull(),
    output: jsonb("output").$type<JobArtifact[] | null>(),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    error: text("error"),
    /**
     * Set when Cap.run succeeded (artifacts persisted) but Cap.interpret failed.
     * Job stays `succeeded` — collection worked; Proposal was not created.
     */
    interpretError: text("interpret_error"),
    /** No FK — proposals.job_id would cycle. */
    proposalId: uuid("proposal_id"),
    evidenceIds: jsonb("evidence_ids").$type<string[] | null>(),
    resultSummary: text("result_summary"),
    fromCache: boolean("from_cache").notNull().default(false),
    suppressedCount: integer("suppressed_count").notNull().default(0),
    actorId: text("actor_id").notNull(),
    /** Snapshot when the actor is an API key (`api-key:…`). User names resolve at read. */
    actorLabel: text("actor_label"),
    logs: jsonb("logs").$type<string[]>().notNull().default([]),
    playbookRunId: uuid("playbook_run_id").references(() => playbookRuns.id, {
      onDelete: "set null",
    }),
    playbookStep: integer("playbook_step"),
    /**
     * Fan-out sibling index within a playbook step. NOT NULL so uniqueness
     * cannot be disabled by NULL (Postgres UNIQUE treats NULLs as distinct).
     */
    playbookFanIndex: integer("playbook_fan_index").notNull().default(0),
    handoff: jsonb("handoff").$type<JobHandoff | null>(),
    ...timestamps,
    startedAt: timestamptz("started_at"),
    finishedAt: timestamptz("finished_at"),
  },
  (t) => [
    index("jobs_case_id_idx").on(t.caseId),
    uniqueIndex("jobs_playbook_run_step_fan_uq")
      .on(t.playbookRunId, t.playbookStep, t.playbookFanIndex)
      .where(sql`${t.playbookRunId} IS NOT NULL`),
  ]
);
