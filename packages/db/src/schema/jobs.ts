import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { JOB_STATUSES, JOB_STOP_CAUSES } from "@watchdog/schemas/shared";
import type {
  JobHandoff,
  JobStatus,
  JobStopCause,
  JsonObject,
  CaseId,
} from "@watchdog/schemas/shared";

import { timestamps, timestamptz } from "./_helpers";
import { vocabCheck } from "./_vocab";
import { cases } from "./cases";
import { playbookRuns } from "./playbook-runs";

export type JobArtifact = {
  name: string;
  mime: string;
  uri: string;
  sha256: string;
};

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .$type<CaseId>()
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    capabilityId: text("capability_id").notNull(),
    /**
     * The fingerprint of the Cap's code, stamped when a worker claims the Job (null while
     * queued, and for Jobs from before the column). A cache write uses this value, never the
     * running code's, so a Job reclaimed after a deploy caches under the version it started with.
     */
    capVersion: text("cap_version"),
    input: jsonb("input").$type<JsonObject>().notNull(),
    output: jsonb("output").$type<JobArtifact[] | null>(),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    error: text("error"),
    /**
     * Why a Job ended `failed` or `cancelled`: a `JobStopCause` code (see core `jobs/lifecycle`).
     * `error` keeps the free-text detail. Null for a Job that succeeded or is still open.
     */
    errorCode: text("error_code").$type<JobStopCause>(),
    /**
     * Set when Cap.run succeeded (artifacts persisted) but Cap.interpret failed.
     * Job stays `succeeded` — collection worked; Proposal was not created.
     */
    interpretError: text("interpret_error"),
    /** No FK — proposals.job_id would cycle. */
    proposalId: uuid("proposal_id"),
    resultSummary: text("result_summary"),
    fromCache: boolean("from_cache").notNull().default(false),
    suppressedCount: integer("suppressed_count").notNull().default(0),
    actorId: text("actor_id").notNull(),
    /** Snapshot when the actor is an API key (`api-key:…`). User names resolve at read. */
    actorLabel: text("actor_label"),
    /**
     * Better Auth `apikey.id` when an API key started the Job (null for a session). No FK: a
     * deleted key must stay detectable as missing, which is what preflight cancels on.
     */
    actorKeyId: text("actor_key_id"),
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
    /**
     * The finished Job this one retries (same Cap and input, same Case). Null for a first
     * attempt. Set null when the original is deleted, so a chain never dangles.
     */
    retryOfJobId: uuid("retry_of_job_id").references(
      (): AnyPgColumn => jobs.id,
      { onDelete: "set null" }
    ),
    handoff: jsonb("handoff").$type<JobHandoff | null>(),
    ...timestamps,
    startedAt: timestamptz("started_at"),
    finishedAt: timestamptz("finished_at"),
  },
  (t) => [
    // Serves the paged list (keyset on the sort key, then id) and the foreign key's own lookup.
    index("jobs_case_updated_idx").on(
      t.caseId,
      t.updatedAt.desc().nullsFirst(),
      t.id.desc().nullsFirst()
    ),
    index("jobs_retry_of_job_id_idx").on(t.retryOfJobId),
    // The foreign key's own lookup, and the run's Job list. The unique index below no longer
    // serves it: it skips retries, so an equality lookup does not imply its predicate.
    index("jobs_playbook_run_id_idx").on(t.playbookRunId),
    // One first attempt per step and fan index. A retry (`retry_of_job_id` set) is a further
    // attempt in the same slot, so it is outside the constraint.
    uniqueIndex("jobs_playbook_run_step_fan_uq")
      .on(t.playbookRunId, t.playbookStep, t.playbookFanIndex)
      .where(sql`${t.playbookRunId} IS NOT NULL AND ${t.retryOfJobId} IS NULL`),
    // The target of the composite foreign key on `job_evidence`.
    unique("jobs_id_case_id_uq").on(t.id, t.caseId),
    vocabCheck(t.status, JOB_STATUSES),
    vocabCheck(t.errorCode, JOB_STOP_CAUSES),
  ]
);
