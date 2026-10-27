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

import {
  JOB_STATUSES,
  JOB_STOP_CAUSES,
  PROVENANCE_STATES,
} from "@watchdog/schemas/shared";
import type {
  JobPivots,
  JobStatus,
  JobStopCause,
  JsonObject,
  CaseId,
  ProvenanceState,
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
    /**
     * The Job whose cached result this one reused (`from_cache`); null otherwise. Evidence this Job
     * lands from the hit links to that Job's provider calls. A soft reference like
     * `cap_cache.job_id`: the cache row can name a Job that is gone.
     */
    cacheSourceJobId: uuid("cache_source_job_id"),
    /**
     * Whether the Job's provider-call record is whole. `incomplete` after a failed or cancelled
     * run whose outcomes or bodies could not all be saved, so a gap never reads as "no calls".
     */
    provenanceState: text("provenance_state")
      .$type<ProvenanceState>()
      .notNull()
      .default("complete"),
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
    pivots: jsonb("pivots").$type<JobPivots | null>(),
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
    // The Job list's `created` sort (`jobList`, ADR-0007), and `q` over its three search fields
    // (`pg_trgm`, migration 0002).
    index("jobs_case_created_idx").on(
      t.caseId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst()
    ),
    index("jobs_capability_id_trgm_idx").using(
      "gin",
      t.capabilityId.op("gin_trgm_ops")
    ),
    index("jobs_result_summary_trgm_idx").using(
      "gin",
      t.resultSummary.op("gin_trgm_ops")
    ),
    index("jobs_error_trgm_idx").using("gin", t.error.op("gin_trgm_ops")),
    index("jobs_retry_of_job_id_idx").on(t.retryOfJobId),
    // The foreign key's own lookup, and the run's Job list. The unique index below no longer
    // serves it: it skips retries, so an equality lookup does not imply its predicate. The Job
    // list's `playbookRunId` filter (`jobList`, ADR-0007) reads a run's steps in the default
    // sort, so the index ends in the sort key and the id.
    index("jobs_playbook_run_updated_idx").on(
      t.playbookRunId,
      t.updatedAt.desc().nullsFirst(),
      t.id.desc().nullsFirst()
    ),
    // Collect's queue (#574): the Jobs that name an Evidence row in their input, found from the
    // Evidence side when it is captured, hidden or restored. The same total parse the projection
    // uses (`collect_input_evidence_id`, migration `collect_input_evidence_id`), so the lookup and
    // the index are one expression.
    index("jobs_input_evidence_id_idx").on(
      sql`public.collect_input_evidence_id(${t.input}, 'evidenceId')`
    ),
    index("jobs_input_source_evidence_id_idx").on(
      sql`public.collect_input_evidence_id(${t.input}, 'sourceEvidenceId')`
    ),
    // One first attempt per step and fan index. A retry (`retry_of_job_id` set) is a further
    // attempt in the same slot, so it is outside the constraint.
    uniqueIndex("jobs_playbook_run_step_fan_uq")
      .on(t.playbookRunId, t.playbookStep, t.playbookFanIndex)
      .where(sql`${t.playbookRunId} IS NOT NULL AND ${t.retryOfJobId} IS NULL`),
    // The target of the composite foreign key on `job_evidence`.
    unique("jobs_id_case_id_uq").on(t.id, t.caseId),
    vocabCheck(t.status, JOB_STATUSES),
    vocabCheck(t.errorCode, JOB_STOP_CAUSES),
    vocabCheck(t.provenanceState, PROVENANCE_STATES),
  ]
);
