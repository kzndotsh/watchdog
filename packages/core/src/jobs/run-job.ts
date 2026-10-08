import { rm } from "node:fs/promises";

import {
  Cause,
  Data,
  Duration,
  Effect,
  Exit,
  Fiber,
  FiberMap,
  Ref,
  Result,
} from "effect";

import { capTimeoutMs } from "@watchdog/caps/sdk";
import { jobsRepo, type JobRow } from "@watchdog/db";
import { isOpenJobStatus, type CaseId } from "@watchdog/schemas/shared";

import type { BlobStore } from "../infra/blob-store";
import { nowMillisEffect } from "../infra/clock";
import type { Db } from "../infra/db-service";
import { tryDbWith } from "../infra/postgres-effect";
import { logSwallowed } from "../infra/process-log";
import { isDomainTag, type DomainTag } from "../infra/tagged-errors";
import type { Vault } from "../infra/vault";
import {
  JobFibers,
  type JobAbortReason,
  type JobFibersApi,
} from "./job-fibers";
import type { JobQueue } from "./job-queue";
import { runFailedPathEffect, runSucceededPathEffect } from "./run-paths";
import { advancePlaybookRunEffect } from "./stages/chain";
import { collectEffect, type CollectResult } from "./stages/collect";
import { finishEffect } from "./stages/finish";
import { createJobLog, failJobEffect, type JobLog } from "./stages/helpers";
import {
  interpretStageEffect,
  logInterpretFailure,
  type InterpretStageResult,
} from "./stages/interpret";
import { landEvidenceEffect } from "./stages/land-evidence";
import {
  preflightEffect,
  type PreflightState,
  type PreflightStopReason,
} from "./stages/preflight";
import { suppressAndProposeStageEffect } from "./stages/propose";

export type { JobAbortReason };

export type JobRunOutcomeName =
  | "succeeded"
  | "failed"
  | "cancelled"
  | "stopped";

export interface JobRunOutcome {
  outcome: JobRunOutcomeName;
  stopReason?: PreflightStopReason;
  abortReason?: JobAbortReason;
  fromCache?: boolean;
  reclaim?: boolean;
  durationMs: number;
  caseId?: CaseId;
  capabilityId?: string;
  playbookRunId?: string | null;
}

function classifyRun(input: {
  jobId: string;
  finishOutcome?: "succeeded" | "cancelled";
  threw: boolean;
  peekReason: (jobId: string) => JobAbortReason | undefined;
}): { outcome: JobRunOutcomeName; abortReason?: JobAbortReason } {
  const abortReason = input.peekReason(input.jobId);
  if (input.finishOutcome === "cancelled") {
    return { outcome: "cancelled", abortReason: abortReason ?? "cancel" };
  }
  if (input.threw) {
    return {
      outcome: abortReason === "cancel" ? "cancelled" : "failed",
      abortReason,
    };
  }
  return { outcome: "succeeded", abortReason };
}

/** Effect 4: interrupted fibers exit as interrupt even if catchCause "recovers". */
function jobOutcomeFromInterrupt(
  reason: JobAbortReason,
  row: JobRow | null,
  started: number,
  now: number
): JobRunOutcome {
  return {
    outcome: reason === "cancel" ? "cancelled" : "failed",
    abortReason: reason,
    durationMs: row?.startedAt ? now - row.startedAt.getTime() : now - started,
    caseId: row?.caseId,
    capabilityId: row?.capabilityId,
    playbookRunId: row?.playbookRunId ?? null,
  };
}

/** Align wide-event outcome with product Job status after a preflight stop. */
function outcomeFromStopStatus(
  status: JobRow["status"] | undefined
): JobRunOutcomeName {
  switch (status) {
    case "failed": {
      return "failed";
    }
    case "succeeded": {
      return "succeeded";
    }
    case "cancelled": {
      return "cancelled";
    }
    case "queued":
    case "running":
    case "blocked":
    case undefined: {
      return "stopped";
    }
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function handlePreflightStopEffect(
  jobId: string,
  reason: PreflightStopReason,
  started: number
): Effect.Effect<JobRunOutcome, never, Db | JobQueue> {
  return Effect.gen(function* handlePreflightStopGen() {
    const row = yield* tryDbWith((exec) => jobsRepo.get(exec, jobId)).pipe(
      Effect.orDie
    );
    if (row?.status === "failed" && row.playbookRunId !== null) {
      const playbookRunId = row.playbookRunId;
      yield* advancePlaybookRunEffect({
        playbookRunId,
        caseId: row.caseId,
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.sync(() => {
            logSwallowed("playbook.abandon", Cause.squash(cause), { jobId });
          })
        )
      );
    }
    const now = yield* nowMillisEffect;
    return {
      outcome: outcomeFromStopStatus(row?.status),
      stopReason: reason,
      durationMs: now - started,
      caseId: row?.caseId,
      capabilityId: row?.capabilityId,
      playbookRunId: row?.playbookRunId ?? null,
    };
  });
}

function handlePreflightFailureEffect(
  jobId: string,
  error: DomainTag,
  started: number
): Effect.Effect<JobRunOutcome, never, Db | JobQueue> {
  return Effect.gen(function* handlePreflightFailureGen() {
    const row = yield* tryDbWith((exec) => jobsRepo.get(exec, jobId)).pipe(
      Effect.orDie
    );
    const jobLog = createJobLog(row?.logs ?? []);
    if (row) {
      yield* runFailedPathEffect({
        jobId,
        error: error.message,
        jobLog,
        playbookRunId: row.playbookRunId ?? null,
        caseId: row.caseId,
      });
    }
    const now = yield* nowMillisEffect;
    return {
      outcome: "failed" as const,
      durationMs: now - started,
      caseId: row?.caseId,
      capabilityId: row?.capabilityId,
      playbookRunId: row?.playbookRunId ?? null,
    };
  });
}

class ScratchCleanupError extends Data.TaggedError("ScratchCleanupError")<{
  readonly cause: unknown;
}> {
  readonly code = "scratch_cleanup" as const;
}

function cleanupCollectedRunEffect(
  jobId: string,
  collected: CollectResult | null
): Effect.Effect<void> {
  if (!collected) return Effect.void;
  return Effect.tryPromise({
    try: () =>
      rm(collected.runtime.scratchDir, {
        recursive: true,
        force: true,
      }),
    catch: (cause) => new ScratchCleanupError({ cause }),
  }).pipe(
    Effect.tapError((error) =>
      Effect.sync(() => {
        logSwallowed("job.scratch_cleanup", error.cause, { jobId });
      })
    ),
    Effect.ignore
  );
}

interface ProposePipelineResult {
  proposalId: string | null;
  suppressedCount: number;
  interpreted: InterpretStageResult;
}

function proposeFromInterpretEffect(
  state: PreflightState,
  interpreted: InterpretStageResult,
  attachEvidenceIds: string[],
  jobLog: JobLog,
  proposalId: string | null,
  suppressedCount: number
): Effect.Effect<ProposePipelineResult, DomainTag, Db> {
  if (
    interpreted.interpretError !== null ||
    interpreted.patch.length === 0 ||
    proposalId !== null
  ) {
    return Effect.succeed({ proposalId, suppressedCount, interpreted });
  }

  return Effect.gen(function* proposeFromInterpretGen() {
    const proposed = yield* suppressAndProposeStageEffect({
      caseId: state.job.caseId,
      patch: interpreted.patch,
      jobId: state.jobId,
      resultSummary: interpreted.resultSummary,
      attachEvidenceIds,
      createdBy: state.job.actorId,
      onSuppressed: (suppressed) => {
        if (suppressed > 0) {
          jobLog.log(`suppressed ${suppressed} known/rejected finding(s)`);
        }
      },
    });
    if (
      proposed.kept.length > 0 &&
      (proposed.proposalId === null || proposed.proposalId === "")
    ) {
      jobLog.log("propose failed: Failed to create Proposal");
      return {
        proposalId: null,
        suppressedCount: proposed.suppressedCount,
        interpreted: {
          ...interpreted,
          resultSummary: proposed.resultSummary,
          interpretError: "Failed to create Proposal",
        },
      };
    }
    return {
      proposalId: proposed.proposalId,
      suppressedCount: proposed.suppressedCount,
      interpreted: {
        ...interpreted,
        resultSummary: proposed.resultSummary,
      },
    };
  });
}

function finalizeResultSummary(
  interpreted: InterpretStageResult,
  collected: CollectResult,
  jobLog: JobLog
): string | null {
  let resultSummary = interpreted.resultSummary;
  if (interpreted.interpretError !== null) {
    resultSummary = logInterpretFailure(
      jobLog,
      interpreted.interpretError,
      resultSummary
    );
  }
  if (collected.fromCache && (resultSummary === null || resultSummary === "")) {
    return "Reused prior Cap artifacts";
  }
  return resultSummary;
}

function runAfterCollectEffect(
  jobId: string,
  state: PreflightState,
  collected: CollectResult,
  attachEvidenceIds: string[],
  jobLog: JobLog,
  started: number,
  fibers: JobFibersApi
): Effect.Effect<JobRunOutcome, DomainTag, Db | BlobStore | JobQueue> {
  return Effect.gen(function* runAfterCollectGen() {
    const fromCache = collected.fromCache;
    const reclaim = collected.reclaim;

    let interpreted = yield* interpretStageEffect(
      state,
      collected.artifacts,
      collected.runtime,
      {
        proposalId: state.job.proposalId ?? null,
        resultSummary: state.job.resultSummary ?? null,
      }
    ).pipe(Effect.withSpan("cap.interpret", { attributes: { jobId } }));

    const proposed = yield* proposeFromInterpretEffect(
      state,
      interpreted,
      attachEvidenceIds,
      jobLog,
      state.job.proposalId ?? null,
      state.job.suppressedCount
    );
    interpreted = proposed.interpreted;

    const resultSummary = finalizeResultSummary(interpreted, collected, jobLog);

    const finishOutcome = yield* finishEffect({
      state,
      jobLog,
      proposalId: proposed.proposalId,
      resultSummary,
      fromCache: collected.fromCache,
      suppressedCount: proposed.suppressedCount,
      interpretError: interpreted.interpretError,
      markSourceProcessed: interpreted.markSourceProcessed,
      handoff: interpreted.handoff,
    }).pipe(Effect.withSpan("cap.finish", { attributes: { jobId } }));

    const classified = classifyRun({
      jobId,
      finishOutcome,
      threw: false,
      peekReason: fibers.peekReason,
    });

    if (finishOutcome === "succeeded") {
      yield* runSucceededPathEffect({
        jobId,
        state,
        collected,
        resultSummary,
        interpretError: interpreted.interpretError,
        jobLog,
      });
    }

    const now = yield* nowMillisEffect;
    return {
      outcome: classified.outcome,
      abortReason: classified.abortReason,
      fromCache,
      reclaim,
      durationMs: now - started,
      caseId: state.job.caseId,
      capabilityId: state.job.capabilityId,
      playbookRunId: state.job.playbookRunId ?? null,
    };
  });
}

function failOutcome(
  jobId: string,
  state: PreflightState,
  collected: CollectResult | null,
  jobLog: JobLog,
  started: number,
  error: unknown,
  fibers: JobFibersApi
): Effect.Effect<JobRunOutcome, never, Db | BlobStore | JobQueue> {
  const classified = classifyRun({
    jobId,
    threw: true,
    peekReason: fibers.peekReason,
  });
  return runFailedPathEffect({
    jobId,
    error,
    jobLog,
    playbookRunId: state.job.playbookRunId,
    caseId: state.job.caseId,
  }).pipe(
    Effect.flatMap(() =>
      nowMillisEffect.pipe(
        Effect.map((now) => ({
          outcome: classified.outcome,
          abortReason: classified.abortReason,
          fromCache: collected?.fromCache,
          reclaim: collected?.reclaim,
          durationMs: now - started,
          caseId: state.job.caseId,
          capabilityId: state.job.capabilityId,
          playbookRunId: state.job.playbookRunId ?? null,
        }))
      )
    )
  );
}

function runReadyJobEffect(
  jobId: string,
  state: PreflightState,
  started: number,
  jobSignal: AbortSignal,
  fibers: JobFibersApi
) {
  const jobLog = createJobLog(state.job.logs ?? []);
  return Effect.gen(function* runReadyJobGen() {
    const collectedRef = yield* Ref.make<CollectResult | null>(null);
    const parent = yield* Effect.fiber;
    const sleeper = yield* Effect.forkChild(
      Effect.gen(function* timeoutSleeper() {
        yield* Effect.sleep(Duration.millis(capTimeoutMs(state.cap)));
        fibers.setReason(jobId, "timeout");
        yield* Fiber.interrupt(parent);
      })
    );

    const body = Effect.gen(function* runReadyJobBody() {
      const collectedResult = yield* collectEffect(
        state,
        jobLog,
        jobSignal
      ).pipe(
        Effect.withSpan("cap.collect", { attributes: { jobId } }),
        Effect.ensuring(Fiber.interrupt(sleeper))
      );
      yield* Ref.set(collectedRef, collectedResult);
      const attachEvidenceIds = yield* landEvidenceEffect(
        state,
        collectedResult
      );
      return yield* runAfterCollectEffect(
        jobId,
        state,
        collectedResult,
        attachEvidenceIds,
        jobLog,
        started,
        fibers
      );
    }).pipe(
      Effect.catchCause((cause) => {
        // Interrupt skips catchCause in Effect 4 — see onExitIf below.
        const failed = Cause.findFail(cause);
        if (Result.isSuccess(failed)) {
          const error = failed.success.error;
          if (isDomainTag(error)) {
            return Ref.get(collectedRef).pipe(
              Effect.flatMap((collectedResult) =>
                failOutcome(
                  jobId,
                  state,
                  collectedResult,
                  jobLog,
                  started,
                  error.message,
                  fibers
                )
              )
            );
          }
        }
        return Effect.die(Cause.squash(cause));
      }),
      Effect.onExitIf(
        (exit) => Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause),
        () =>
          Ref.get(collectedRef).pipe(
            Effect.flatMap((collectedResult) => {
              const reason = fibers.peekReason(jobId) ?? "cancel";
              return failOutcome(
                jobId,
                state,
                collectedResult,
                jobLog,
                started,
                new Error(reason === "timeout" ? "timeout" : "aborted"),
                fibers
              );
            }),
            Effect.asVoid
          )
      ),
      Effect.ensuring(
        Ref.get(collectedRef).pipe(
          Effect.flatMap((collectedResult) =>
            cleanupCollectedRunEffect(jobId, collectedResult)
          )
        )
      )
    );

    return yield* body;
  });
}

/** Services a whole Job run needs (`executeJobOnMap` is provided them by the worker). */
type JobRunServices = Db | BlobStore | Vault | JobFibers | JobQueue;

/** Timeout sleeper is collect-scoped (interrupted when collect returns). */
export function executeJobEffect(
  jobId: string
): Effect.Effect<JobRunOutcome, never, JobRunServices> {
  return Effect.scoped(
    Effect.gen(function* executeJobGen() {
      const fibers = yield* JobFibers;
      const started = yield* nowMillisEffect;
      const jobSignal = yield* Effect.abortSignal;
      const preflight = yield* Effect.result(
        preflightEffect(jobId).pipe(
          Effect.withSpan("cap.preflight", { attributes: { jobId } })
        )
      );
      if (Result.isFailure(preflight)) {
        return yield* handlePreflightFailureEffect(
          jobId,
          preflight.failure,
          started
        );
      }
      const ready = preflight.success;
      if (ready.kind === "stop") {
        return yield* handlePreflightStopEffect(jobId, ready.reason, started);
      }
      return yield* runReadyJobEffect(
        jobId,
        ready.state,
        started,
        jobSignal,
        fibers
      );
    }).pipe(Effect.withSpan("cap.execute", { attributes: { jobId } }))
  );
}

export function executeJobOnMap(
  jobId: string
): Effect.Effect<JobRunOutcome, never, JobRunServices> {
  return Effect.gen(function* trackJobFiber() {
    const fibers = yield* JobFibers;
    const started = yield* nowMillisEffect;
    const fiber = yield* FiberMap.run(
      fibers.map,
      jobId
    )(executeJobEffect(jobId));
    const exit = yield* Fiber.await(fiber);
    if (Exit.isSuccess(exit)) {
      fibers.clearReason(jobId);
      return exit.value;
    }
    if (Cause.hasInterruptsOnly(exit.cause)) {
      const reason = fibers.peekReason(jobId) ?? "cancel";
      const row = yield* tryDbWith((exec) => jobsRepo.get(exec, jobId)).pipe(
        Effect.orDie
      );
      if (row && isOpenJobStatus(row.status)) {
        yield* failJobEffect(
          jobId,
          reason === "timeout" ? "timeout" : "aborted",
          { caseId: row.caseId },
          row.logs ?? []
        ).pipe(Effect.orDie);
      }
      fibers.clearReason(jobId);
      const now = yield* nowMillisEffect;
      return jobOutcomeFromInterrupt(reason, row, started, now);
    }
    fibers.clearReason(jobId);
    return yield* Effect.die(Cause.squash(exit.cause));
  });
}
