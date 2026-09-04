import { Effect } from "effect";

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

import {
  assertCaseExistsEffect,
  assertEntityInCaseEffect,
} from "../graph/patch/guards";
import { errorMessage } from "../infra/domain-error";
import { tryDb } from "../infra/postgres-effect";
import { logProcess } from "../infra/process-log";
import {
  ConflictError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { enqueueCapJobEffect } from "./boss";
import { assertCapAvailabilityEffect } from "./cap-availability";
import { setJobStatusEffect } from "./set-job-status";

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

export function startJobEffect(
  input: StartJobInput
): Effect.Effect<JobRecord, DomainTag> {
  return Effect.gen(function* startJobGen() {
    yield* assertCaseExistsEffect(input.caseId);
    const cap = yield* Effect.try({
      try: () => requireCapability(input.capabilityId),
      catch: (error) => new NotFoundError({ resource: errorMessage(error) }),
    });
    const parsed = cap.input.safeParse(input.input);
    if (!parsed.success) {
      return yield* new InvalidError({
        reason: `Invalid Cap input: ${parsed.error.message}`,
      });
    }

    if (!isJsonObject(parsed.data)) {
      return yield* new InvalidError({
        reason: "Invalid Cap input: expected a JSON object",
      });
    }
    const capInput = parsed.data;

    if (typeof capInput.entityId === "string") {
      yield* assertEntityInCaseEffect(input.caseId, capInput.entityId);
    }

    yield* assertCapAvailabilityEffect({
      actorId: input.actorId,
      caseId: input.caseId,
      cap,
    });

    const row = yield* tryDb(() =>
      jobsRepo.create(db, {
        caseId: input.caseId,
        capabilityId: input.capabilityId,
        input: capInput,
        status: "queued",
        actorId: input.actorId,
        logs: [],
      })
    );

    if (!row) {
      return yield* new InvalidError({ reason: "Failed to create Job" });
    }

    yield* enqueueCapJobEffect(row.id, input.capabilityId);

    return toJobRecord(row);
  });
}

export function listJobsForCaseEffect(
  caseId: string
): Effect.Effect<JobListRecord[], DomainTag> {
  return Effect.gen(function* listJobsGen() {
    yield* assertCaseExistsEffect(caseId);
    const rows = yield* tryDb(() => jobsRepo.listForCase(db, caseId));
    return rows.map(({ job, playbookId, playbookRunStatus }) =>
      toJobListRecord(job, playbookId, playbookRunStatus)
    );
  });
}

export function getJobForCaseEffect(
  caseId: string,
  jobId: string
): Effect.Effect<JobRecord, DomainTag> {
  return tryDb(() => jobsRepo.getInCase(db, caseId, jobId)).pipe(
    Effect.flatMap((row) =>
      row
        ? Effect.succeed(
            toJobRecord(row.job, row.playbookId, row.playbookRunStatus)
          )
        : new NotFoundError({ resource: "Job not found" })
    )
  );
}

interface EntityListOpts3 {
  actorId?: string;
}

export function cancelJobEffect(
  caseId: string,
  jobId: string,
  opts?: EntityListOpts3
): Effect.Effect<JobRecord, DomainTag> {
  return Effect.gen(function* cancelJobGen() {
    const row = yield* tryDb(() => jobsRepo.getInCase(db, caseId, jobId));
    if (!row) {
      return yield* new NotFoundError({ resource: "Job not found" });
    }
    if (!CANCELLABLE_STATUSES.has(row.job.status)) {
      return yield* new ConflictError({
        reason: "Only queued/running/blocked Jobs can be cancelled",
      });
    }
    const updated = yield* setJobStatusEffect(jobId, {
      status: "cancelled",
      finishedAt: new Date(),
    });
    if (!updated) {
      return yield* new InvalidError({ reason: "Cancel failed" });
    }
    if (opts?.actorId) {
      yield* Effect.sync(() => {
        logProcess("job.cancel", "Job cancelled", {
          caseId,
          jobId,
          actorId: opts.actorId,
        });
      });
    }
    return toJobRecord(updated, row.playbookId, row.playbookRunStatus);
  });
}

export function findCancelledJobIdsEffect(
  ids: string[]
): Effect.Effect<string[], DomainTag> {
  return tryDb(() => jobsRepo.findCancelledJobIds(db, ids));
}
