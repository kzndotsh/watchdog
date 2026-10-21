import { Effect } from "effect";

import { requireCapability } from "@watchdog/caps";
import type { JobArtifact, JobListRow, JobRow } from "@watchdog/db";
import { evidenceIdsFromJobInputs } from "@watchdog/schemas/jobs";
import {
  normalizeUuidList,
  trimmedOrUndefined,
  type CaseId,
  type JobStatus,
  type JsonObject,
  type OrganizationId,
  type PlaybookRunOutcome,
  type PlaybookRunStatus,
  isTerminalJobStatus,
  type Page,
} from "@watchdog/schemas/shared";

import { actorLabelForPersist } from "../actors/actor-label-snapshot";
import { requireActorIdEffect } from "../actors/require-actor-id";
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
import type { Db } from "../infra/db-service";
import { pageWindow, toPage } from "../infra/page";
import type { PageRequest } from "../infra/page";
import { requireWritten } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import { jobsRepoFx, jobsRepoFxDb } from "../infra/repos-fx";
import {
  type InternalError,
  ConflictError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import type { Vault } from "../infra/vault";
import { enqueueCapJobEffect } from "./boss";
import { assertCapAvailabilityEffect } from "./cap-availability";
import { parseValidatedCapInputEffect } from "./cap-input";
import { appendJobActivityEffect } from "./job-activity";
import type { JobQueue } from "./job-queue";
import { joinPlaybookRunEffect, type PlaybookSlot } from "./retry-resume";
import { failJobEffect } from "./stages/helpers";

export type StartJobInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  capabilityId: string;
  input: JsonObject;
  actorId: string;
  /** When the caller is an API key, `api-key:<keyname>`. */
  actorLabel?: string | null;
  /** The API key that started the Job (preflight cancels it when the key is gone). */
  actorKeyId?: string | null;
  /** The finished Job this one retries (set by `retryJobEffect` only). */
  retryOfJobId?: string;
  /** The Playbook run, step and fan index the retried Job belonged to (set by `retryJobEffect` only). */
  playbookSlot?: PlaybookSlot;
};

export type JobRecord = {
  id: string;
  caseId: CaseId;
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
  retryOfJobId: string | null;
  playbookId: string | null;
  playbookRunStatus: PlaybookRunStatus | null;
  playbookRunOutcome: PlaybookRunOutcome | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

/** Job queue row without logs (detail via getJobForCase). */
export type JobListRecord = Omit<JobRecord, "logs">;

/** The Playbook run a Job belongs to, as the read model and the wire record carry it. */
export type PlaybookContext = {
  playbookId: string | null;
  playbookRunStatus: PlaybookRunStatus | null;
  playbookRunOutcome: PlaybookRunOutcome | null;
};

export const NO_PLAYBOOK: PlaybookContext = {
  playbookId: null,
  playbookRunStatus: null,
  playbookRunOutcome: null,
};

function toJobListRecord(
  row: JobListRow,
  playbook: PlaybookContext,
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
    retryOfJobId: row.retryOfJobId,
    playbookId: playbook.playbookId,
    playbookRunStatus: playbook.playbookRunStatus,
    playbookRunOutcome: playbook.playbookRunOutcome,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

export function toJobRecord(
  row: JobRow,
  playbook: PlaybookContext = NO_PLAYBOOK,
  users: ReadonlyMap<string, { name: string; email: string }> = new Map()
): JobRecord {
  return {
    ...toJobListRecord(row, playbook, users),
    logs: row.logs ?? [],
  };
}

/** Enqueue a freshly created job row; mark it failed when pg-boss send fails. */
export function enqueueCreatedJobEffect(
  caseId: CaseId,
  job: Pick<JobRow, "id" | "logs">,
  capabilityId: string
): Effect.Effect<void, DomainTag, Db | JobQueue> {
  return enqueueCapJobEffect(job.id, capabilityId).pipe(
    Effect.tapError((error: InternalError | InvalidError) =>
      failJobEffect(
        job.id,
        error.reason,
        { caseId, cause: "queue_aborted" },
        job.logs ?? []
      )
    )
  );
}

export function startJobEffect(
  input: StartJobInput
): Effect.Effect<JobRecord, DomainTag, Db | JobQueue | Vault> {
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
      catch: () =>
        new NotFoundError({ entity: "Capability", id: capabilityId }),
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

    const { row, run } = yield* transact((tx) =>
      Effect.gen(function* startJobTx() {
        // A retry of a Playbook step rejoins its run first: the run lock comes before the insert.
        const joined =
          input.playbookSlot === undefined
            ? null
            : yield* joinPlaybookRunEffect(tx, input.playbookSlot, actorId);
        const created = yield* jobsRepoFx
          .create(tx, {
            caseId: scopedCaseId,
            capabilityId,
            input: normalizedCapInput,
            status: "queued",
            actorId,
            actorLabel: actorLabelForPersist(input.actorLabel),
            actorKeyId: input.actorKeyId,
            logs: [],
            retryOfJobId: input.retryOfJobId,
            ...(joined === null ? {} : input.playbookSlot),
          })
          .pipe(requireWritten("create Job"));
        yield* appendJobActivityEffect(tx, created, "queued");
        return { row: created, run: joined };
      })
    );

    yield* enqueueCreatedJobEffect(scopedCaseId, row, capabilityId);

    const users = yield* loadActorUsersEffect([row.actorId]);
    return toJobRecord(
      row,
      run === null
        ? NO_PLAYBOOK
        : {
            playbookId: run.playbookId,
            playbookRunStatus: run.status,
            playbookRunOutcome: run.outcome,
          },
      users
    );
  });
}

export type RetryJobInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  jobId: string;
  actorId: string;
  actorLabel?: string | null;
  actorKeyId?: string | null;
};

/**
 * Start a new Job from a finished Job's Cap id and input, linked to it through
 * `retryOfJobId`. The new Job goes through {@link startJobEffect}, so input
 * validation, Case scoping, Cap availability and credentials apply exactly as for
 * a fresh start; the original row is not touched. A Job of a Playbook run is retried
 * in the same run, step and fan index and reopens the run (`retry-resume.ts`).
 */
export function retryJobEffect(
  input: RetryJobInput
): Effect.Effect<JobRecord, DomainTag, Db | JobQueue | Vault> {
  return Effect.gen(function* retryJobGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const originalId = yield* requireTrimmedGraphId(input.jobId, "Job");
    const original = yield* jobsRepoFxDb.getInCase(scopedCaseId, originalId);
    if (!original) {
      return yield* new NotFoundError({ entity: "Job", id: originalId });
    }
    const { job } = original;
    if (!isTerminalJobStatus(job.status)) {
      return yield* new ConflictError({
        reason: "Only finished Jobs can be retried",
      });
    }
    return yield* startJobEffect({
      caseId: scopedCaseId,
      organizationId: input.organizationId,
      capabilityId: job.capabilityId,
      input: job.input,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      actorKeyId: input.actorKeyId,
      retryOfJobId: job.id,
      ...(job.playbookRunId === null || job.playbookStep === null
        ? {}
        : {
            playbookSlot: {
              playbookRunId: job.playbookRunId,
              playbookStep: job.playbookStep,
              playbookFanIndex: job.playbookFanIndex,
            },
          }),
    });
  });
}

/** One page of the Case's Jobs, most recently updated first. */
export function listJobsForCaseEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  page: PageRequest = {}
): Effect.Effect<Page<JobListRecord>, DomainTag, Db> {
  return Effect.gen(function* listJobsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const window = yield* pageWindow(page, { list: "jobs", keys: ["time"] });
    const found = yield* jobsRepoFxDb.listForCase(scopedCaseId, {
      limit: window.limit + 1,
      ...(window.after === undefined ? {} : { after: window.after }),
    });
    const users = yield* loadActorUsersEffect(
      found.slice(0, window.limit).map(({ job }) => job.actorId)
    );
    return toPage(
      found,
      window,
      ({ job, ...playbook }) => toJobListRecord(job, playbook, users),
      ({ job, keyTime }) => ({ id: job.id, values: [keyTime] })
    );
  });
}

export function getJobForCaseEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  jobId: string
): Effect.Effect<JobRecord, DomainTag, Db> {
  return Effect.gen(function* getJobForCaseGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedJobId = yield* requireTrimmedGraphId(jobId, "Job");
    const row = yield* jobsRepoFxDb.getInCase(scopedCaseId, normalizedJobId);
    if (!row) {
      return yield* new NotFoundError({ entity: "Job", id: normalizedJobId });
    }
    const users = yield* loadActorUsersEffect([row.job.actorId]);
    return toJobRecord(row.job, row, users);
  });
}

export function findCancelledJobIdsEffect(
  ids: string[]
): Effect.Effect<string[], DomainTag, Db> {
  const normalized = normalizeUuidList(ids);
  if (normalized.length === 0) return Effect.succeed([]);
  return jobsRepoFxDb.findCancelledJobIds(normalized);
}
