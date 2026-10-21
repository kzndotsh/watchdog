import { Cause, Effect, Exit, Ref, Result } from "effect";

import { jobsRepo, type JobRow } from "@watchdog/db";
import type { JobHandoff } from "@watchdog/schemas/shared";

import { nowDateEffect, nowMillisEffect } from "../../infra/clock";
import type { Db } from "../../infra/db-service";
import { tryDbWith } from "../../infra/postgres-effect";
import type { DomainTag } from "../../infra/tagged-errors";
import type { Vault } from "../../infra/vault";
import { capCacheKey } from "../cap-cache";
import { logJobFailureCause } from "../failure-cause";
import { JobFibers } from "../job-fibers";
import type { JobQueue } from "../job-queue";
import { outcomeFromStopStatus, type JobRunOutcome } from "../run-outcome";
import type { CollectResult } from "../stages/collect";
import { finishEffect } from "../stages/finish";
import { createJobLog, type JobLog } from "../stages/helpers";
import {
  preflightEffect,
  type PreflightState,
  type PreflightStopReason,
} from "../stages/preflight";
import { settleJobEffect } from "./settle";
import {
  stopEvent,
  stopMessage,
  type JobStop,
  type StopSlot,
} from "./stop-slot";
import {
  advancePlaybookTailEffect,
  cacheSuccessTailEffect,
  reclaimedSuccessTailEffect,
} from "./tail";

/** What the Cap body hands back for the settle to record when the Job ran to the end. */
export type JobFinish = {
  readonly collected: CollectResult;
  readonly proposalId: string | null;
  readonly resultSummary: string | null;
  readonly suppressedCount: number;
  readonly interpretError: string | null;
  readonly markSourceProcessed: boolean | undefined;
  readonly handoff: JobHandoff | undefined;
};

/** What the Cap body gets for an attempt. */
export type JobBodyContext = {
  readonly state: PreflightState;
  readonly jobLog: JobLog;
  /** The Cap timer offers its stop here before it interrupts the attempt. */
  readonly stop: StopSlot;
  /** The body publishes its collect result here as soon as it has one. */
  readonly collected: Ref.Ref<CollectResult | null>;
};

export type JobBody<R> = (
  context: JobBodyContext
) => Effect.Effect<JobFinish, DomainTag, R>;

type Claimed =
  | {
      readonly kind: "ready";
      readonly state: PreflightState;
      readonly jobLog: JobLog;
    }
  | { readonly kind: "stop"; readonly reason: PreflightStopReason }
  | { readonly kind: "error"; readonly error: DomainTag };

/**
 * Whether the preflight itself wrote the Job's terminal status for a stop reason, so this
 * attempt owes the Playbook an advance. The other stops found the Job ended by someone else
 * (cancelled, already terminal) or missing; that writer owns the advance.
 */
const PREFLIGHT_SETTLED: Record<PreflightStopReason, boolean> = {
  not_found: false,
  cancelled: false,
  already_terminal: false,
  case_deleted: true,
  access_revoked: true,
  reclaim_converged: true,
  unknown_capability: true,
  invalid_input: true,
  egress_denied: true,
  missing_credential: true,
};

function claimEffect(jobId: string): Effect.Effect<Claimed, never, Db | Vault> {
  return preflightEffect(jobId).pipe(
    Effect.withSpan("cap.preflight", { attributes: { jobId } }),
    Effect.result,
    Effect.map((preflight): Claimed => {
      if (Result.isFailure(preflight)) {
        return { kind: "error", error: preflight.failure };
      }
      const ready = preflight.success;
      return ready.kind === "stop"
        ? { kind: "stop", reason: ready.reason }
        : {
            kind: "ready",
            state: ready.state,
            jobLog: createJobLog(ready.state.job.logs ?? []),
          };
    })
  );
}

type Subject = {
  readonly jobId: string;
  readonly started: number;
};

function readJobEffect(jobId: string): Effect.Effect<JobRow | null, never, Db> {
  return tryDbWith((exec) => jobsRepo.get(exec, jobId)).pipe(Effect.orDie);
}

function outcomeOfEffect(
  subject: Subject,
  row: JobRow | null,
  extra: Partial<JobRunOutcome>
): Effect.Effect<JobRunOutcome> {
  return nowMillisEffect.pipe(
    Effect.map((now) => ({
      outcome: outcomeFromStopStatus(row?.status),
      durationMs: now - subject.started,
      caseId: row?.caseId,
      capabilityId: row?.capabilityId,
      playbookRunId: row?.playbookRunId ?? null,
      ...extra,
    }))
  );
}

/** The attempt did not reach a finish: settle `fail` or `cancel` for the stop, then advance. */
function stopAttemptEffect(
  subject: Subject,
  job: JobRow,
  jobLog: JobLog,
  stop: JobStop,
  extra: Partial<JobRunOutcome>
): Effect.Effect<JobRunOutcome, never, Db | JobQueue> {
  return Effect.gen(function* stopAttemptGen() {
    const message = stopMessage(stop);
    jobLog.log(`run failed: ${message}`);
    const finishedAt = yield* nowDateEffect;
    const moved = yield* settleJobEffect(
      { jobId: subject.jobId, caseId: job.caseId },
      stopEvent(stop.cause),
      { error: message, logs: jobLog.lines, finishedAt }
    ).pipe(Effect.orDie);
    yield* advancePlaybookTailEffect({
      jobId: subject.jobId,
      caseId: job.caseId,
      playbookRunId: job.playbookRunId,
    });
    const row = moved ?? (yield* readJobEffect(subject.jobId));
    return yield* outcomeOfEffect(subject, row, {
      stopCause: stop.cause,
      ...extra,
    });
  });
}

/** The Cap body returned: record the success, cache it, stamp the Evidence, advance. */
function succeedAttemptEffect(
  subject: Subject,
  claimed: PreflightState,
  jobLog: JobLog,
  finish: JobFinish
): Effect.Effect<JobRunOutcome, never, Db | JobQueue> {
  return Effect.gen(function* succeedAttemptGen() {
    const { collected } = finish;
    const extra = {
      fromCache: collected.fromCache,
      reclaim: collected.reclaim,
    };
    const finished = yield* Effect.result(
      finishEffect({
        state: claimed,
        jobLog,
        proposalId: finish.proposalId,
        resultSummary: finish.resultSummary,
        fromCache: collected.fromCache,
        suppressedCount: finish.suppressedCount,
        interpretError: finish.interpretError,
        markSourceProcessed: finish.markSourceProcessed,
        handoff: finish.handoff,
      })
    );
    if (Result.isFailure(finished)) {
      logJobFailureCause(subject.jobId, finished.failure);
      return yield* stopAttemptEffect(
        subject,
        claimed.job,
        jobLog,
        { cause: "cap_failed", detail: finished.failure.message },
        extra
      );
    }
    if (finished.success === "cancelled") {
      // The Job ended some other way while the body ran: that writer owns the advance.
      const row = yield* readJobEffect(subject.jobId);
      return yield* outcomeOfEffect(subject, row, extra);
    }
    yield* cacheSuccessTailEffect({
      state: claimed,
      jobLog,
      key: capCacheKey(claimed.cap, claimed.policy, claimed.input),
      artifacts: collected.artifacts,
      resultSummary: finish.resultSummary,
      fromCache: collected.fromCache,
      interpretError: finish.interpretError,
    });
    yield* advancePlaybookTailEffect({
      jobId: subject.jobId,
      caseId: claimed.job.caseId,
      playbookRunId: claimed.job.playbookRunId,
    });
    const row = yield* readJobEffect(subject.jobId);
    return yield* outcomeOfEffect(subject, row, extra);
  });
}

/** Why the body's exit was not a finish: the stop the slot kept, else what the exit says. */
function stopFromExit(
  jobId: string,
  cause: Cause.Cause<DomainTag>,
  kept: JobStop | null
): JobStop {
  if (Cause.hasInterruptsOnly(cause)) {
    return kept ?? { cause: "queue_aborted" };
  }
  const failed = Cause.findFail(cause);
  if (Result.isSuccess(failed)) {
    logJobFailureCause(jobId, failed.success.error);
    return (
      kept ?? { cause: "cap_failed", detail: failed.success.error.message }
    );
  }
  return kept ?? { cause: "cap_failed", detail: "Internal error" };
}

/** Settle for a preflight that stopped or failed: the status is written, the tail is not. */
function settlePreflightEffect(
  subject: Subject,
  claimed: Exclude<Claimed, { kind: "ready" }>
): Effect.Effect<JobRunOutcome, never, Db | JobQueue> {
  return Effect.gen(function* settlePreflightGen() {
    const row = yield* readJobEffect(subject.jobId);
    if (claimed.kind === "error") {
      logJobFailureCause(subject.jobId, claimed.error);
      if (row === null) return yield* outcomeOfEffect(subject, null, {});
      return yield* stopAttemptEffect(
        subject,
        row,
        createJobLog(row.logs ?? []),
        { cause: "preflight_failed", detail: claimed.error.message },
        {}
      );
    }
    if (row !== null && PREFLIGHT_SETTLED[claimed.reason]) {
      if (claimed.reason === "reclaim_converged") {
        yield* reclaimedSuccessTailEffect(row);
      }
      yield* advancePlaybookTailEffect({
        jobId: subject.jobId,
        caseId: row.caseId,
        playbookRunId: row.playbookRunId,
      });
    }
    return yield* outcomeOfEffect(subject, row, { stopReason: claimed.reason });
  });
}

/**
 * Release of {@link run}: settle the attempt from how it ended. It is the only place a worker
 * attempt writes its Job's terminal status, and it covers every way out: a finish, a Cap
 * failure, a defect, an interrupt from any abort source, and a preflight that stopped.
 */
function settleAttemptEffect(
  subject: Subject,
  claimed: Claimed,
  stop: StopSlot,
  collected: Ref.Ref<CollectResult | null>,
  exit: Exit.Exit<JobFinish | null, DomainTag>
): Effect.Effect<JobRunOutcome, never, Db | JobQueue> {
  if (claimed.kind !== "ready") return settlePreflightEffect(subject, claimed);
  const { state, jobLog } = claimed;
  if (Exit.isSuccess(exit) && exit.value !== null) {
    return succeedAttemptEffect(subject, state, jobLog, exit.value);
  }
  return Effect.gen(function* settleStoppedGen() {
    const kept = yield* stop.peek;
    const reached = yield* Ref.get(collected);
    // A ready attempt's body always returns a finish, so a success here has no cause to read.
    const reason = Exit.isFailure(exit)
      ? stopFromExit(subject.jobId, exit.cause, kept)
      : (kept ?? { cause: "cap_failed" as const, detail: "Internal error" });
    return yield* stopAttemptEffect(subject, state.job, jobLog, reason, {
      fromCache: reached?.fromCache,
      reclaim: reached?.reclaim,
    });
  });
}

/**
 * Run one attempt at a Job on the worker: claim and preflight it (acquire), run the Cap body
 * (use), settle it from how that ended (release). Release is uninterruptible and runs once
 * whatever happened, so an interrupt from the Cap timer, the pg-boss signal or the cancel poll
 * leaves one terminal status, one activity entry and one Playbook advance, the same as a finish.
 * The stop slot of the attempt (`JobFibers.attemptFor`) holds the cause of the first source that
 * stopped it; the settle stores it in `error_code`.
 */
export function run<R>(
  jobId: string,
  body: JobBody<R>
): Effect.Effect<JobRunOutcome, never, R | Db | Vault | JobQueue | JobFibers> {
  return Effect.gen(function* runGen() {
    const fibers = yield* JobFibers;
    const attempt = fibers.attemptFor(jobId);
    const subject: Subject = { jobId, started: yield* nowMillisEffect };
    const collected = yield* Ref.make<CollectResult | null>(null);
    yield* Ref.set(attempt.settled, null);
    yield* Effect.acquireUseRelease(
      claimEffect(jobId),
      (claimed) =>
        claimed.kind === "ready"
          ? body({
              state: claimed.state,
              jobLog: claimed.jobLog,
              stop: attempt.stop,
              collected,
            })
          : Effect.succeed(null),
      (claimed, exit) =>
        settleAttemptEffect(
          subject,
          claimed,
          attempt.stop,
          collected,
          exit
        ).pipe(Effect.flatMap((outcome) => Ref.set(attempt.settled, outcome)))
    ).pipe(Effect.ignore);
    const outcome = yield* Ref.get(attempt.settled);
    return (
      outcome ?? {
        outcome: "stopped" as const,
        durationMs: (yield* nowMillisEffect) - subject.started,
      }
    );
  });
}
