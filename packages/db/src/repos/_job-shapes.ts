import { getTableColumns } from "drizzle-orm";

import {
  normalizeJobInput,
  jobInputGraphIdFieldIssues,
} from "@watchdog/schemas/jobs";
import {
  parseGraphUuidList,
  type JobStatus,
  type JobStopCause,
  type JsonObject,
  type PlaybookRunOutcome,
  type PlaybookRunStatus,
} from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { jobs } from "../schema/jobs";
import { jobEvidenceIds } from "./_evidence-ids";
import { resolveNullableGraphIdForWrite } from "./_scoped-ids";
import { evidenceLinksRepo } from "./evidence-links.repo";

/*
 * The shapes `jobsRepo` reads and writes: the row with its Evidence ids, the list projection,
 * the create and patch inputs, and the ingress normalization. Split out of `jobs.repo.ts`
 * (a baselined file that may only shrink).
 */

/** A Job with the Evidence ids it landed or reused (from `job_evidence`), in landing order. */
export type JobRow = typeof jobs.$inferSelect & { evidenceIds: string[] };

/** Every Job column plus its Evidence ids, folded into the statement as a subquery. */
export const jobColumns = {
  ...getTableColumns(jobs),
  evidenceIds: jobEvidenceIds,
} as const;

export const jobListColumns = {
  id: jobs.id,
  caseId: jobs.caseId,
  capabilityId: jobs.capabilityId,
  input: jobs.input,
  output: jobs.output,
  status: jobs.status,
  error: jobs.error,
  interpretError: jobs.interpretError,
  proposalId: jobs.proposalId,
  evidenceIds: jobEvidenceIds,
  resultSummary: jobs.resultSummary,
  fromCache: jobs.fromCache,
  suppressedCount: jobs.suppressedCount,
  actorId: jobs.actorId,
  actorLabel: jobs.actorLabel,
  playbookRunId: jobs.playbookRunId,
  playbookStep: jobs.playbookStep,
  playbookFanIndex: jobs.playbookFanIndex,
  retryOfJobId: jobs.retryOfJobId,
  createdAt: jobs.createdAt,
  updatedAt: jobs.updatedAt,
  startedAt: jobs.startedAt,
  finishedAt: jobs.finishedAt,
} as const;

export type JobListRow = Omit<
  {
    [K in keyof typeof jobListColumns]: (typeof jobs.$inferSelect)[K &
      keyof typeof jobs.$inferSelect];
  },
  "evidenceIds"
> & { evidenceIds: string[] };

/** Read model: a Job plus the playbook it belongs to, if any. */
export type JobWithPlaybook<Row> = {
  job: Row;
  playbookId: string | null;
  playbookRunStatus: PlaybookRunStatus | null;
  playbookRunOutcome: PlaybookRunOutcome | null;
};

export type NewJob = Pick<
  typeof jobs.$inferInsert,
  "caseId" | "capabilityId" | "input" | "status" | "actorId"
> &
  Partial<
    Pick<
      typeof jobs.$inferInsert,
      | "logs"
      | "playbookRunId"
      | "playbookStep"
      | "playbookFanIndex"
      | "output"
      | "handoff"
      | "actorLabel"
      | "actorKeyId"
      | "retryOfJobId"
    >
  > & {
    /** Evidence of the same Case the Job landed; stored as `job_evidence` rows. */
    evidenceIds?: string[] | null;
  };

/**
 * The columns `jobsRepo.update` writes. It carries no `status`: a status moves only through
 * `jobsRepo.settle`, whose guard comes from the lifecycle table.
 */
export type JobPatch = Partial<
  Pick<
    typeof jobs.$inferInsert,
    | "error"
    | "interpretError"
    | "proposalId"
    | "resultSummary"
    | "fromCache"
    | "suppressedCount"
    | "logs"
    | "output"
    | "handoff"
    | "input"
    | "startedAt"
    | "finishedAt"
    | "capVersion"
    | "cacheSourceJobId"
    | "provenanceState"
  >
> & {
  /** Replaces the Job's `job_evidence` rows; `null` clears them. */
  evidenceIds?: string[] | null;
};

/** What a status move writes: the new status, the stop code, and the other columns it sets. */
export type JobSettlePatch = Omit<JobPatch, "evidenceIds"> & {
  status: JobStatus;
  errorCode?: JobStopCause | null;
};

function withNormalizedEvidenceIds<T extends { evidenceIds?: string[] | null }>(
  values: T
): T | null {
  if (values.evidenceIds === undefined) return values;
  const parsed = parseGraphUuidList(values.evidenceIds ?? []);
  if (parsed === null) return null;
  return { ...values, evidenceIds: parsed };
}

function withNormalizedJobInput<T extends { input?: JsonObject }>(
  values: T
): T | null {
  if (values.input === undefined) return values;
  if (jobInputGraphIdFieldIssues(values.input).length > 0) return null;
  return { ...values, input: normalizeJobInput(values.input) };
}

export function normalizeJobIngressValues<
  T extends { evidenceIds?: string[] | null; input?: JsonObject },
>(values: T): T | null {
  const withEvidence = withNormalizedEvidenceIds(values);
  if (withEvidence === null) return null;
  return withNormalizedJobInput(withEvidence);
}

export function normalizeJobPatchIngress(patch: JobPatch): JobPatch | null {
  const next = normalizeJobIngressValues(patch);
  if (next === null) return null;
  if (patch.proposalId !== undefined) {
    const resolved = resolveNullableGraphIdForWrite(patch.proposalId);
    if (!resolved.ok) return null;
    next.proposalId = resolved.id ?? null;
  }
  return next;
}

/** An empty `.set()` is an error in drizzle; a patch of only Evidence ids still touches the row. */
export function setOrTouch<T extends object>(
  columns: T
): T | { updatedAt: Date } {
  return Object.keys(columns).length > 0 ? columns : { updatedAt: new Date() };
}

/** After an UPDATE: store a patched Evidence id list and return it on the row. */
export async function withReplacedEvidence(
  exec: DbExec,
  updated: JobRow | undefined,
  evidenceIds: string[] | null | undefined
): Promise<JobRow | null> {
  if (updated === undefined) return null;
  if (evidenceIds === undefined) return updated;
  const stored = await evidenceLinksRepo.replaceJob(
    exec,
    updated.caseId,
    updated.id,
    evidenceIds ?? []
  );
  return stored === null ? null : { ...updated, evidenceIds: stored };
}
