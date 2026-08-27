import { requireCapability } from "@watchdog/caps";
import {
  db,
  jobsRepo,
  type JobArtifact,
  type JobListRow,
  type JobRow,
} from "@watchdog/db";
import {
  isJsonObject,
  type JobStatus,
  type JsonObject,
  type PlaybookRunStatus,
} from "@watchdog/schemas";

import { assertCaseExists, assertEntityInCase } from "../graph/patch/guards";
import { DomainError, errorMessage } from "../infra/domain-error";
import { logProcess } from "../infra/process-log";
import { enqueueCapJob } from "./boss";
import { assertCapAvailability } from "./cap-availability";
import { setJobStatus } from "./set-job-status";

const CANCELLABLE_STATUSES = new Set<JobStatus>([
  "queued",
  "running",
  "blocked",
]);

export interface StartJobInput {
  caseId: string;
  capabilityId: string;
  input: JsonObject;
  actorId: string;
}

export interface JobRecord {
  id: string;
  caseId: string;
  capabilityId: string;
  input: JsonObject;
  output: JobArtifact[] | null;
  status: JobStatus;
  error: string | null;
  /** Present when run succeeded but interpret failed (no Proposal). */
  interpretError: string | null;
  proposalId: string | null;
  evidenceIds: string[] | null;
  resultSummary: string | null;
  fromCache: boolean;
  suppressedCount: number;
  actorId: string;
  logs: string[];
  playbookRunId: string | null;
  playbookStep: number | null;
  playbookFanIndex: number;
  playbookId: string | null;
  playbookRunStatus: PlaybookRunStatus | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/** Job queue row without logs (detail via getJobForCase). */
export type JobListRecord = Omit<JobRecord, "logs">;

function toJobListRecord(
  row: JobListRow,
  playbookId: string | null,
  playbookRunStatus: PlaybookRunStatus | null = null
): JobListRecord {
  return {
    id: row.id,
    caseId: row.caseId,
    capabilityId: row.capabilityId,
    input: row.input,
    output: row.output,
    status: row.status,
    error: row.error,
    interpretError: row.interpretError,
    proposalId: row.proposalId,
    evidenceIds: row.evidenceIds,
    resultSummary: row.resultSummary,
    fromCache: row.fromCache,
    suppressedCount: row.suppressedCount,
    actorId: row.actorId,
    playbookRunId: row.playbookRunId ?? null,
    playbookStep: row.playbookStep ?? null,
    playbookFanIndex: row.playbookFanIndex,
    playbookId,
    playbookRunStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

export function toJobRecord(
  row: JobRow,
  playbookId: string | null = null,
  playbookRunStatus: PlaybookRunStatus | null = null
): JobRecord {
  return {
    ...toJobListRecord(row, playbookId, playbookRunStatus),
    logs: row.logs ?? [],
  };
}

export async function startJob(input: StartJobInput): Promise<JobRecord> {
  await assertCaseExists(input.caseId);
  let cap;
  try {
    cap = requireCapability(input.capabilityId);
  } catch (error) {
    const msg = errorMessage(error);
    throw new DomainError("not_found", msg);
  }
  const parsed = cap.input.safeParse(input.input);
  if (!parsed.success) {
    throw new DomainError(
      "invalid",
      `Invalid Cap input: ${parsed.error.message}`
    );
  }

  if (!isJsonObject(parsed.data)) {
    throw new DomainError(
      "invalid",
      "Invalid Cap input: expected a JSON object"
    );
  }

  if (typeof parsed.data.entityId === "string") {
    await assertEntityInCase(input.caseId, parsed.data.entityId);
  }

  await assertCapAvailability({
    actorId: input.actorId,
    caseId: input.caseId,
    cap,
  });

  const row = await jobsRepo.create(db, {
    caseId: input.caseId,
    capabilityId: input.capabilityId,
    input: parsed.data,
    status: "queued",
    actorId: input.actorId,
    logs: [],
  });

  if (!row) throw new Error("Failed to create Job");

  await enqueueCapJob(row.id, input.capabilityId);

  return toJobRecord(row);
}

export async function listJobsForCase(
  caseId: string
): Promise<JobListRecord[]> {
  await assertCaseExists(caseId);
  const rows = await jobsRepo.listForCase(db, caseId);
  return rows.map(({ job, playbookId, playbookRunStatus }) =>
    toJobListRecord(job, playbookId, playbookRunStatus)
  );
}

export async function getJobForCase(
  caseId: string,
  jobId: string
): Promise<JobRecord | null> {
  const row = await jobsRepo.getInCase(db, caseId, jobId);
  if (!row) return null;
  return toJobRecord(row.job, row.playbookId, row.playbookRunStatus);
}

interface EntityListOpts3 {
  actorId?: string;
}

export async function cancelJob(
  caseId: string,
  jobId: string,
  opts?: EntityListOpts3
): Promise<JobRecord> {
  const row = await jobsRepo.getInCase(db, caseId, jobId);
  if (!row) throw new DomainError("not_found", "Job not found");
  if (!CANCELLABLE_STATUSES.has(row.job.status)) {
    throw new DomainError(
      "conflict",
      "Only queued/running/blocked Jobs can be cancelled"
    );
  }
  const updated = await setJobStatus(jobId, {
    status: "cancelled",
    finishedAt: new Date(),
  });
  if (!updated) throw new Error("Cancel failed");
  if (opts?.actorId) {
    logProcess("job.cancel", "Job cancelled", {
      caseId,
      jobId,
      actorId: opts.actorId,
    });
  }
  return toJobRecord(updated, row.playbookId, row.playbookRunStatus);
}

export async function findCancelledJobIds(ids: string[]): Promise<string[]> {
  return await jobsRepo.findCancelledJobIds(db, ids);
}
