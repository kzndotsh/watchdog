import { Effect, Result } from "effect";
import type { z } from "zod";

import type {
  CapabilityDef,
  CapJobPolicy,
  JsonObject,
} from "@watchdog/cap-sdk";
import { requireCapability } from "@watchdog/caps";
import { db, jobsRepo, type JobArtifact, type JobRow } from "@watchdog/db";
import { parseTrimmedCaseId } from "@watchdog/schemas";

import { nowDateEffect } from "../../infra/clock";
import { errorMessage } from "../../infra/domain-error";
import { tryDb } from "../../infra/postgres-effect";
import { logProcess } from "../../infra/process-log";
import type { DomainTag } from "../../infra/tagged-errors";
import { InvalidError, domainMessageOf } from "../../infra/tagged-errors";
import {
  evaluateCapAvailabilityEffect,
  formatCapAvailabilityError,
} from "../cap-availability";
import { parseValidatedCapInputEffect } from "../cap-input";
import { setJobStatusEffect } from "../set-job-status";
import { failJobEffect, jobEvidenceIdsForReuse } from "./helpers";

export interface PreflightState {
  jobId: string;
  job: JobRow;
  cap: CapabilityDef<z.ZodType>;
  policy: CapJobPolicy;
  input: JsonObject;
  allowThirdPartyEgress: boolean;
  reclaimArtifacts: JobArtifact[] | null;
  reclaimEvidenceIds: string[];
}

export type PreflightStopReason =
  | "not_found"
  | "cancelled"
  | "already_terminal"
  | "reclaim_converged"
  | "unknown_capability"
  | "invalid_input"
  | "egress_denied"
  | "missing_credential";

export type PreflightResult =
  | { kind: "stop"; reason: PreflightStopReason }
  | { kind: "ready"; state: PreflightState };

type CapLoadResult =
  | { kind: "ready"; cap: CapabilityDef<z.ZodType> }
  | { kind: "stop"; reason: PreflightStopReason };

type CapInputResult =
  | { kind: "ready"; input: JsonObject }
  | { kind: "stop"; reason: PreflightStopReason };

function preflightEarlyStop(job: JobRow): PreflightStopReason | null {
  if (job.status === "cancelled") return "cancelled";
  if (job.status !== "queued" && job.status !== "running") {
    return "already_terminal";
  }
  return null;
}

function convergeReclaimStopEffect(
  jobId: string,
  job: JobRow
): Effect.Effect<void, DomainTag> {
  return setJobStatusEffect(
    jobId,
    {
      status: "succeeded",
      finishedAt: job.finishedAt ?? new Date(),
    },
    { unlessCancelled: true, notify: true, caseId: job.caseId }
  ).pipe(Effect.asVoid);
}

function loadCapOrStopEffect(
  jobId: string,
  capabilityId: string,
  caseId: string
): Effect.Effect<CapLoadResult, DomainTag> {
  return Effect.gen(function* loadCapOrStopGen() {
    const cap = yield* Effect.result(
      Effect.try({
        try: () => requireCapability(capabilityId),
        catch: (error) => new InvalidError({ reason: errorMessage(error) }),
      })
    );
    if (Result.isFailure(cap)) {
      yield* failJobEffect(jobId, domainMessageOf(cap.failure), { caseId });
      return { kind: "stop" as const, reason: "unknown_capability" as const };
    }
    return { kind: "ready" as const, cap: cap.success };
  });
}

function parseCapInputOrStopEffect(
  jobId: string,
  cap: CapabilityDef<z.ZodType>,
  rawInput: unknown,
  caseId: string
): Effect.Effect<CapInputResult, DomainTag> {
  return parseValidatedCapInputEffect(cap, rawInput).pipe(
    Effect.map((input) => ({ kind: "ready" as const, input })),
    Effect.catchTag("InvalidError", (error) =>
      failJobEffect(jobId, error.reason, { caseId }).pipe(
        Effect.as({ kind: "stop" as const, reason: "invalid_input" as const })
      )
    )
  );
}

function enforceCapAvailabilityOrStopEffect(
  jobId: string,
  job: JobRow,
  cap: CapabilityDef<z.ZodType>
): Effect.Effect<
  | { kind: "stop"; reason: PreflightStopReason }
  | { kind: "ready"; allowThirdPartyEgress: boolean },
  DomainTag
> {
  return Effect.gen(function* enforceCapAvailabilityOrStopGen() {
    const { allowThirdPartyEgress, result } =
      yield* evaluateCapAvailabilityEffect({
        actorId: job.actorId,
        caseId: job.caseId,
        cap,
      });
    if (result.ok) {
      return { kind: "ready" as const, allowThirdPartyEgress };
    }
    yield* failJobEffect(jobId, formatCapAvailabilityError(result, cap.id), {
      caseId: job.caseId,
    });
    return {
      kind: "stop" as const,
      reason:
        result.kind === "egress_blocked"
          ? "egress_denied"
          : "missing_credential",
    };
  });
}

function preparePreflightReadyEffect(
  jobId: string,
  job: JobRow
): Effect.Effect<PreflightResult, DomainTag> {
  return Effect.gen(function* preparePreflightReadyGen() {
    const capOrStop = yield* loadCapOrStopEffect(
      jobId,
      job.capabilityId,
      job.caseId
    );
    if (capOrStop.kind === "stop") return capOrStop;
    const { cap } = capOrStop;
    const policy = cap.jobPolicy ?? {};

    const inputOrStop = yield* parseCapInputOrStopEffect(
      jobId,
      cap,
      job.input,
      job.caseId
    );
    if (inputOrStop.kind === "stop") return inputOrStop;
    const { input } = inputOrStop;

    const availability = yield* enforceCapAvailabilityOrStopEffect(
      jobId,
      job,
      cap
    );
    if (availability.kind === "stop") return availability;

    const reclaimArtifacts =
      Array.isArray(job.output) && job.output.length > 0 ? job.output : null;
    const reclaimEvidenceIds = jobEvidenceIdsForReuse(job.evidenceIds);
    const startedAt = job.startedAt ?? (yield* nowDateEffect);

    const markedRunning = yield* setJobStatusEffect(
      jobId,
      {
        status: "running",
        startedAt,
        ...(reclaimArtifacts ? {} : { logs: [] as string[] }),
      },
      {
        unlessCancelled: true,
        onlyStatuses: ["queued", "running"],
        notify: true,
        caseId: job.caseId,
      }
    );
    if (!markedRunning) {
      return { kind: "stop" as const, reason: "cancelled" as const };
    }

    return {
      kind: "ready" as const,
      state: {
        jobId,
        job,
        cap,
        policy,
        input,
        allowThirdPartyEgress: availability.allowThirdPartyEgress,
        reclaimArtifacts,
        reclaimEvidenceIds,
      },
    };
  });
}

/**
 * Load Job, validate Cap input, enforce egress + credentials, mark running.
 * Returns `stop` when the Job should not proceed (terminal / failed preflight).
 * Missing Job and unknown Capability resolve as `stop` (no throw) so pg-boss
 * does not retry those cases. DB errors stay in `E` as `DomainTag`.
 */
export function preflightEffect(
  jobId: string
): Effect.Effect<PreflightResult, DomainTag> {
  return Effect.gen(function* preflightGen() {
    const normalizedJobId = parseTrimmedCaseId(jobId) ?? undefined;
    if (normalizedJobId === undefined) {
      return { kind: "stop" as const, reason: "not_found" as const };
    }

    const job = yield* tryDb(() => jobsRepo.get(db, normalizedJobId));
    if (!job) {
      yield* Effect.sync(() => {
        logProcess("preflight", `Job not found: ${normalizedJobId}`, {
          jobId: normalizedJobId,
        });
      });
      return { kind: "stop" as const, reason: "not_found" as const };
    }

    const earlyStop = preflightEarlyStop(job);
    if (earlyStop !== null) {
      return { kind: "stop" as const, reason: earlyStop };
    }

    if (job.proposalId !== null && job.status === "running") {
      yield* convergeReclaimStopEffect(normalizedJobId, job);
      return { kind: "stop" as const, reason: "reclaim_converged" as const };
    }

    return yield* preparePreflightReadyEffect(normalizedJobId, job);
  });
}
