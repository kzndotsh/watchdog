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
  evidenceIdsFromJobInputs,
  normalizeUuidList,
  trimmedOrUndefined,
  type JobStatus,
  type JsonObject,
  type PlaybookRunStatus,
} from "@watchdog/schemas";

import {
  optionalActorId,
  requireActorIdEffect,
} from "../actors/require-actor-id";
import {
  labelForActor,
  loadActorUsersEffect,
} from "../actors/resolve-actor-labels";
import { assertEvidenceIdsInCaseEffect } from "../evidence/evidence";
import {
  assertCaseInOrgEffect,
  assertEntityInCaseEffect,
  assertEvidenceInCaseEffect,
  requireTrimmedGraphId,
} from "../graph/patch/guards";
import { nowDateEffect } from "../infra/clock";
import { errorMessage } from "../infra/domain-error";
import { notifyJobUpdateEffect } from "../infra/events";
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
import { parseValidatedCapInputEffect } from "./cap-input";
import { failJobEffect } from "./stages/helpers";

export interface StartJobInput {
  caseId: string;
  organizationId: string;
  capabilityId: string;
  input: JsonObject;
  actorId: string;
  /** When the caller is an API key, `api-key:<keyname>`. */
  actorLabel?: string | null;
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
  actorLabel: string;
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
  playbookRunStatus: PlaybookRunStatus | null = null,
  users: ReadonlyMap<string, { name: string; email: string }> = new Map()
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
    evidenceIds: normalizeUuidList(row.evidenceIds ?? []),
    resultSummary: row.resultSummary,
    fromCache: row.fromCache,
    suppressedCount: row.suppressedCount,
    actorId: row.actorId,
    actorLabel: labelForActor(row.actorId, users, row.actorLabel),
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
  playbookRunStatus: PlaybookRunStatus | null = null,
  users: ReadonlyMap<string, { name: string; email: string }> = new Map()
): JobRecord {
  return {
    ...toJobListRecord(row, playbookId, playbookRunStatus, users),
    logs: row.logs ?? [],
  };
}

/** Enqueue a freshly created job row; mark it failed when pg-boss send fails. */
export function enqueueCreatedJobEffect(
  caseId: string,
  job: Pick<JobRow, "id" | "logs">,
  capabilityId: string
): Effect.Effect<void, DomainTag> {
  return enqueueCapJobEffect(job.id, capabilityId).pipe(
    Effect.catch((error: InvalidError) =>
      failJobEffect(
        job.id,
        errorMessage(error),
        { caseId },
        job.logs ?? []
      ).pipe(Effect.flatMap(() => Effect.fail(error)))
    )
  );
}

export function startJobEffect(
  input: StartJobInput
): Effect.Effect<JobRecord, DomainTag> {
  return Effect.gen(function* startJobGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const capabilityId = trimmedOrUndefined(input.capabilityId);
    if (capabilityId === undefined) {
      return yield* new InvalidError({ reason: "Capability id is required" });
    }
    const cap = yield* Effect.try({
      try: () => requireCapability(capabilityId),
      catch: (error) => new NotFoundError({ resource: errorMessage(error) }),
    });
    const capInput = yield* parseValidatedCapInputEffect(cap, input.input);

    let normalizedCapInput = capInput;
    const entityId =
      typeof capInput.entityId === "string" ? capInput.entityId : undefined;
    if (entityId !== undefined) {
      const scopedEntityId = yield* assertEntityInCaseEffect(
        scopedCaseId,
        entityId
      );
      normalizedCapInput = { ...capInput, entityId: scopedEntityId };
    }

    const evidenceIds = evidenceIdsFromJobInputs([normalizedCapInput]);
    if (evidenceIds.length > 0) {
      yield* cap.jobPolicy?.needsEvidenceSnapshot === true
        ? Effect.forEach(
            evidenceIds,
            (evidenceId) =>
              assertEvidenceInCaseEffect(scopedCaseId, evidenceId),
            { concurrency: "unbounded" }
          )
        : assertEvidenceIdsInCaseEffect(scopedCaseId, evidenceIds);
    }

    const actorId = yield* requireActorIdEffect(input.actorId);
    yield* assertCapAvailabilityEffect({
      actorId,
      caseId: scopedCaseId,
      cap,
    });

    const row = yield* tryDb(() =>
      jobsRepo.create(db, {
        caseId: scopedCaseId,
        capabilityId,
        input: normalizedCapInput,
        status: "queued",
        actorId,
        actorLabel: input.actorLabel ?? null,
        logs: [],
      })
    );

    if (!row) {
      return yield* new InvalidError({ reason: "Failed to create Job" });
    }

    yield* enqueueCreatedJobEffect(scopedCaseId, row, capabilityId);
    yield* notifyJobUpdateEffect(scopedCaseId, row.id, "queued");

    const users = yield* loadActorUsersEffect([row.actorId]);
    return toJobRecord(row, null, null, users);
  });
}

export function listJobsForCaseEffect(
  caseId: string,
  organizationId: string
): Effect.Effect<JobListRecord[], DomainTag> {
  return Effect.gen(function* listJobsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const rows = yield* tryDb(() => jobsRepo.listForCase(db, scopedCaseId));
    const users = yield* loadActorUsersEffect(
      rows.map(({ job }) => job.actorId)
    );
    return rows.map(({ job, playbookId, playbookRunStatus }) =>
      toJobListRecord(job, playbookId, playbookRunStatus, users)
    );
  });
}

export function getJobForCaseEffect(
  caseId: string,
  organizationId: string,
  jobId: string
): Effect.Effect<JobRecord, DomainTag> {
  return Effect.gen(function* getJobForCaseGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedJobId = yield* requireTrimmedGraphId(
      jobId,
      "Job not found"
    );
    const row = yield* tryDb(() =>
      jobsRepo.getInCase(db, scopedCaseId, normalizedJobId)
    );
    if (!row) {
      return yield* new NotFoundError({ resource: "Job not found" });
    }
    const users = yield* loadActorUsersEffect([row.job.actorId]);
    return toJobRecord(row.job, row.playbookId, row.playbookRunStatus, users);
  });
}

interface CancelJobOpts {
  actorId?: string;
}

export function cancelJobEffect(
  caseId: string,
  organizationId: string,
  jobId: string,
  opts?: CancelJobOpts
): Effect.Effect<JobRecord, DomainTag> {
  return Effect.gen(function* cancelJobGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedJobId = yield* requireTrimmedGraphId(
      jobId,
      "Job not found"
    );
    const row = yield* tryDb(() =>
      jobsRepo.getInCase(db, scopedCaseId, normalizedJobId)
    );
    if (!row) {
      return yield* new NotFoundError({ resource: "Job not found" });
    }
    const finishedAt = yield* nowDateEffect;
    const cancelledId = yield* tryDb(() =>
      jobsRepo.cancelCancellableInCase(
        db,
        scopedCaseId,
        normalizedJobId,
        finishedAt
      )
    );
    if (!cancelledId) {
      return yield* new ConflictError({
        reason: "Only queued/running/blocked Jobs can be cancelled",
      });
    }
    yield* notifyJobUpdateEffect(scopedCaseId, normalizedJobId, "cancelled");
    const refreshed = yield* tryDb(() =>
      jobsRepo.getInCase(db, scopedCaseId, normalizedJobId)
    );
    if (!refreshed) {
      return yield* new InvalidError({ reason: "Cancel failed" });
    }
    const logActorId = optionalActorId(opts?.actorId);
    if (logActorId) {
      yield* Effect.sync(() => {
        logProcess("job.cancel", "Job cancelled", {
          caseId: scopedCaseId,
          jobId: normalizedJobId,
          actorId: logActorId,
        });
      });
    }
    const users = yield* loadActorUsersEffect([refreshed.job.actorId]);
    return toJobRecord(
      refreshed.job,
      refreshed.playbookId,
      refreshed.playbookRunStatus,
      users
    );
  });
}

export function findCancelledJobIdsEffect(
  ids: string[]
): Effect.Effect<string[], DomainTag> {
  const normalized = normalizeUuidList(ids);
  if (normalized.length === 0) return Effect.succeed([]);
  return tryDb(() => jobsRepo.findCancelledJobIds(db, normalized));
}
