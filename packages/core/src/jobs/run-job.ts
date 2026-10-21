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
} from "effect";

import { capTimeoutMs } from "@watchdog/caps/sdk";
import type { OutboundClient } from "@watchdog/tools/http";

import type { BlobStore } from "../infra/blob-store";
import { nowMillisEffect } from "../infra/clock";
import type { Db } from "../infra/db-service";
import { logSwallowed } from "../infra/process-log";
import type { DomainTag } from "../infra/tagged-errors";
import type { Vault } from "../infra/vault";
import { JobFibers } from "./job-fibers";
import type { JobQueue } from "./job-queue";
import { run, type JobBodyContext, type JobFinish } from "./lifecycle/run";
import { timedOutMessage } from "./lifecycle/stop-slot";
import type { JobRunOutcome } from "./run-outcome";
import { collectEffect, type CollectResult } from "./stages/collect";
import type { JobLog } from "./stages/helpers";
import {
  interpretStageEffect,
  logInterpretFailure,
  type InterpretStageResult,
} from "./stages/interpret";
import { landEvidenceEffect } from "./stages/land-evidence";
import type { PreflightState } from "./stages/preflight";
import { suppressAndProposeStageEffect } from "./stages/propose";

export type { JobRunOutcome, JobRunOutcomeName } from "./run-outcome";

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

type ProposePipelineResult = {
  proposalId: string | null;
  suppressedCount: number;
  interpreted: InterpretStageResult;
};

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

/** Interpret the collected artifacts, propose from them, and say how the Job should finish. */
function interpretAndProposeEffect(
  state: PreflightState,
  collected: CollectResult,
  attachEvidenceIds: string[],
  jobLog: JobLog
): Effect.Effect<JobFinish, DomainTag, Db | BlobStore> {
  return Effect.gen(function* interpretAndProposeGen() {
    const interpreted = yield* interpretStageEffect(
      state,
      collected.artifacts,
      collected.runtime,
      {
        proposalId: state.job.proposalId ?? null,
        resultSummary: state.job.resultSummary ?? null,
      }
    ).pipe(
      Effect.withSpan("cap.interpret", { attributes: { jobId: state.jobId } })
    );

    const proposed = yield* proposeFromInterpretEffect(
      state,
      interpreted,
      attachEvidenceIds,
      jobLog,
      state.job.proposalId ?? null,
      state.job.suppressedCount
    );

    return {
      collected,
      proposalId: proposed.proposalId,
      resultSummary: finalizeResultSummary(
        proposed.interpreted,
        collected,
        jobLog
      ),
      suppressedCount: proposed.suppressedCount,
      interpretError: proposed.interpreted.interpretError,
      markSourceProcessed: proposed.interpreted.markSourceProcessed,
      handoff: proposed.interpreted.handoff,
    };
  });
}

/**
 * The Cap body of a Job run: collect (under the Cap's timer), land Evidence, interpret and
 * propose. It records nothing about the Job's status; `run` settles that from how this ends.
 * The timer offers `cap_timeout` to the attempt's stop slot, then interrupts the fiber.
 */
function capBody({
  state,
  jobLog,
  stop,
  collected,
}: JobBodyContext): Effect.Effect<
  JobFinish,
  DomainTag,
  Db | BlobStore | Vault | OutboundClient
> {
  const jobId = state.jobId;
  return Effect.scoped(
    Effect.gen(function* capBodyGen() {
      const jobSignal = yield* Effect.abortSignal;
      const parent = yield* Effect.fiber;
      const timeoutMs = capTimeoutMs(state.cap);
      const sleeper = yield* Effect.forkChild(
        Effect.gen(function* timeoutSleeper() {
          yield* Effect.sleep(Duration.millis(timeoutMs));
          yield* stop.offer({
            cause: "cap_timeout",
            detail: timedOutMessage(timeoutMs),
          });
          yield* Fiber.interrupt(parent);
        })
      );
      const collectedResult = yield* collectEffect(
        state,
        jobLog,
        jobSignal
      ).pipe(
        Effect.withSpan("cap.collect", { attributes: { jobId } }),
        Effect.ensuring(Fiber.interrupt(sleeper))
      );
      yield* Ref.set(collected, collectedResult);
      const attachEvidenceIds = yield* landEvidenceEffect(
        state,
        collectedResult
      );
      return yield* interpretAndProposeEffect(
        state,
        collectedResult,
        attachEvidenceIds,
        jobLog
      );
    })
  ).pipe(
    Effect.ensuring(
      Ref.get(collected).pipe(
        Effect.flatMap((collectedResult) =>
          cleanupCollectedRunEffect(jobId, collectedResult)
        )
      )
    )
  );
}

/** Services a whole Job run needs (`executeJobOnMap` is provided them by the worker). */
type JobRunServices =
  | Db
  | BlobStore
  | Vault
  | OutboundClient
  | JobFibers
  | JobQueue;

/**
 * One attempt at a Job: the lifecycle `run` around the Cap body. Claim, preflight and settle
 * are the lifecycle's; every way the attempt can end leaves one terminal status.
 */
export function executeJobEffect(
  jobId: string
): Effect.Effect<JobRunOutcome, never, JobRunServices> {
  return run(jobId, capBody).pipe(
    Effect.withSpan("cap.execute", { attributes: { jobId } })
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
    const attempt = fibers.attemptFor(jobId);
    const settled = yield* Ref.get(attempt.settled);
    const kept = yield* attempt.stop.peek;
    fibers.clearAttempt(jobId);
    if (Exit.isSuccess(exit)) return exit.value;
    if (Cause.hasInterruptsOnly(exit.cause)) {
      // The settle ran in the fiber's release and published its outcome. A fiber interrupted
      // before it started claimed nothing, so there is no settle to read.
      if (settled !== null) return settled;
      const now = yield* nowMillisEffect;
      return {
        outcome: "stopped" as const,
        stopCause: kept?.cause,
        durationMs: now - started,
      };
    }
    return yield* Effect.die(Cause.squash(exit.cause));
  });
}
