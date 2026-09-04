import { Cause, Effect } from "effect";

import { db, jobsRepo, playbookRunsRepo, type JobRow } from "@watchdog/db";

import { errorMessage } from "../infra/domain-error";
import { logSwallowed } from "../infra/process-log";
import type { DomainTag } from "../infra/tagged-errors";
import { storeCacheStageEffect } from "./stages/cache";
import { advancePlaybookRunEffect } from "./stages/chain";
import type { CollectResult } from "./stages/collect";
import { failJobEffect, type createJobLog } from "./stages/helpers";
import type { PreflightState } from "./stages/preflight";

function logPlaybookAdvanceFailureEffect(
  advanceError: unknown,
  opts: {
    jobId: string;
    caseId: string;
    playbookRunId: string | null;
    jobLog: ReturnType<typeof createJobLog>;
  }
): Effect.Effect<void> {
  const { jobId, caseId, playbookRunId, jobLog } = opts;
  const msg =
    advanceError instanceof Error ? advanceError.message : String(advanceError);
  return Effect.gen(function* logPlaybookAdvanceFailureGen() {
    yield* Effect.sync(() => {
      jobLog.log(`playbook advance failed: ${msg}`);
    });
    yield* Effect.tryPromise({
      try: () => jobsRepo.update(db, jobId, { logs: jobLog.lines }),
      catch: (persistError: unknown) => {
        logSwallowed("playbook.advance_log", persistError, { jobId });
        return new Error("playbook.advance_log");
      },
    }).pipe(Effect.catch(() => Effect.void));
    yield* Effect.sync(() => {
      logSwallowed("playbook.advance", advanceError, {
        jobId,
        caseId,
        playbookRunId,
      });
    });
  });
}

export function runSucceededPathEffect(opts: {
  jobId: string;
  state: PreflightState;
  collected: CollectResult;
  resultSummary: string | null;
  interpretError: string | null;
  jobLog: ReturnType<typeof createJobLog>;
}): Effect.Effect<void> {
  const { jobId, state, collected, resultSummary, interpretError, jobLog } =
    opts;
  return Effect.gen(function* runSucceededPathGen() {
    yield* storeCacheStageEffect({
      state,
      runtime: collected.runtime,
      artifacts: collected.artifacts,
      resultSummary,
      fromCache: collected.fromCache,
      reclaim: collected.reclaim,
      interpretError,
    }).pipe(
      Effect.catch((error: DomainTag) =>
        Effect.sync(() => {
          logSwallowed("job.cache_store", error, { jobId });
        })
      )
    );
    const playbookRunId = state.job.playbookRunId;
    if (playbookRunId === null) return;
    yield* advancePlaybookRunEffect({
      caseId: state.job.caseId,
      playbookRunId,
    }).pipe(
      Effect.catchCause((cause) =>
        logPlaybookAdvanceFailureEffect(Cause.squash(cause), {
          jobId,
          caseId: state.job.caseId,
          playbookRunId,
          jobLog,
        }).pipe(
          Effect.andThen(
            Effect.tryPromise({
              try: () =>
                playbookRunsRepo.setStatus(
                  db,
                  playbookRunId,
                  "cancelled",
                  new Date(),
                  { onlyStatuses: ["running"] }
                ),
              catch: (cancelError: unknown) => {
                logSwallowed("playbook.advance_cancel", cancelError, {
                  jobId,
                  playbookRunId,
                });
                return new Error("playbook.advance_cancel");
              },
            }).pipe(Effect.catch(() => Effect.void))
          )
        )
      )
    );
  });
}

export function runFailedPathEffect(opts: {
  jobId: string;
  error: unknown;
  jobLog: ReturnType<typeof createJobLog>;
  playbookRunId: JobRow["playbookRunId"];
  caseId?: string;
}): Effect.Effect<void> {
  const { jobId, error, jobLog, playbookRunId, caseId } = opts;
  const msg = errorMessage(error);
  return Effect.gen(function* runFailedPathGen() {
    yield* Effect.sync(() => {
      jobLog.log(`run failed: ${msg}`);
    });
    yield* failJobEffect(jobId, msg, jobLog.lines).pipe(Effect.orDie);
    if (playbookRunId === null) return;
    yield* advancePlaybookRunEffect({ playbookRunId, caseId }).pipe(
      Effect.catchCause((cause) =>
        Effect.sync(() => {
          logSwallowed("playbook.abandon", Cause.squash(cause), {
            jobId,
            playbookRunId,
          });
        })
      )
    );
  });
}
