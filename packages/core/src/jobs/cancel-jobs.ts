import { Effect } from "effect";

import { jobsRepo, playbookRunsRepo } from "@watchdog/db";
import type { CaseId, OrganizationId } from "@watchdog/schemas/shared";

import { optionalActorId } from "../actors/require-actor-id";
import { loadActorUsersEffect } from "../actors/resolve-actor-labels";
import {
  assertCaseInOrgEffect,
  requireTrimmedGraphId,
} from "../graph/patch/guards";
import { nowDateEffect } from "../infra/clock";
import type { Db } from "../infra/db-service";
import { tryDb, tryDbWith } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import { logProcess } from "../infra/process-log";
import {
  ConflictError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import type { JobQueue } from "./job-queue";
import { cancelWithin } from "./lifecycle/cancel";
import { toJobRecord, type JobRecord } from "./start-job";

type CancelJobOpts = {
  actorId?: string;
};

export function cancelJobEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  jobId: string,
  opts?: CancelJobOpts
): Effect.Effect<JobRecord, DomainTag, Db | JobQueue> {
  return Effect.gen(function* cancelJobGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedJobId = yield* requireTrimmedGraphId(jobId, "Job");
    const row = yield* tryDbWith((exec) =>
      jobsRepo.getInCase(exec, scopedCaseId, normalizedJobId)
    );
    if (!row) {
      return yield* new NotFoundError({ entity: "Job", id: normalizedJobId });
    }
    const outcome = yield* transact((tx) =>
      cancelWithin(
        tx,
        { kind: "job", caseId: scopedCaseId, jobId: normalizedJobId },
        "user_cancelled"
      )
    );
    if (outcome.cancelled.length === 0) {
      return yield* new ConflictError({
        reason: "Only queued/running Jobs can be cancelled",
      });
    }
    yield* outcome.afterCommit;
    const refreshed = yield* tryDbWith((exec) =>
      jobsRepo.getInCase(exec, scopedCaseId, normalizedJobId)
    );
    if (!refreshed) {
      return yield* new NotFoundError({ entity: "Job", id: normalizedJobId });
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

type CancelPlaybookRunOpts = {
  actorId?: string;
};

type CancelPlaybookRunResult = {
  playbookRunId: string;
  cancelledJobIds: string[];
};

export function cancelPlaybookRunEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  playbookRunId: string,
  opts?: CancelPlaybookRunOpts
): Effect.Effect<CancelPlaybookRunResult, DomainTag, Db | JobQueue> {
  return Effect.gen(function* cancelPlaybookRunGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedPlaybookRunId = yield* requireTrimmedGraphId(
      playbookRunId,
      "Playbook run"
    );
    const now = yield* nowDateEffect;
    const outcome = yield* transact((tx) =>
      Effect.gen(function* cancelPlaybookTx() {
        const run = yield* tryDb(() =>
          playbookRunsRepo.lock(tx, normalizedPlaybookRunId)
        );
        if (!run || run.caseId !== scopedCaseId) {
          return yield* new NotFoundError({
            entity: "Playbook run",
            id: normalizedPlaybookRunId,
          });
        }
        if (run.status !== "running") {
          return yield* new ConflictError({
            reason: "Only running playbook runs can be cancelled",
          });
        }

        yield* tryDb(() =>
          playbookRunsRepo.setStatus(
            tx,
            normalizedPlaybookRunId,
            "cancelled",
            now
          )
        );

        return yield* cancelWithin(
          tx,
          {
            kind: "playbookRun",
            caseId: scopedCaseId,
            playbookRunId: normalizedPlaybookRunId,
          },
          "user_cancelled"
        );
      })
    );
    yield* outcome.afterCommit;
    const cancelledJobIds = outcome.cancelled.map((job) => job.jobId);
    const logActorId = optionalActorId(opts?.actorId);
    if (logActorId) {
      yield* Effect.sync(() => {
        logProcess("playbook.cancel", "Playbook run cancelled", {
          caseId: scopedCaseId,
          playbookRunId: normalizedPlaybookRunId,
          actorId: logActorId,
          cancelledJobCount: cancelledJobIds.length,
        });
      });
    }
    return { playbookRunId: normalizedPlaybookRunId, cancelledJobIds };
  });
}
