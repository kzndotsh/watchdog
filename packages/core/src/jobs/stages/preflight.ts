import { Effect, Result } from "effect";
import type { z } from "zod";

import { requireCapability, type AvailabilityError } from "@watchdog/caps";
import {
  capLane,
  type CapabilityDef,
  type CapJobPolicy,
} from "@watchdog/caps/sdk";
import type { JobArtifact, JobRow } from "@watchdog/db";
import {
  isLiveJobStatus,
  parseTrimmedUuid,
  type CaseId,
  type EgressClass,
  type JsonObject,
} from "@watchdog/schemas/shared";

import { breachCapsMode, stampedCapVersion } from "../../caps/breach-caps";
import { nowDateEffect } from "../../infra/clock";
import type { Db } from "../../infra/db-service";
import { errorMessage } from "../../infra/error-utils";
import { logProcess } from "../../infra/process-log";
import { casesRepoFxDb, jobsRepoFxDb } from "../../infra/repos-fx";
import type { DomainTag } from "../../infra/tagged-errors";
import { InvalidError } from "../../infra/tagged-errors";
import type { Vault } from "../../infra/vault";
import {
  evaluateCapAvailabilityEffect,
  formatCapAvailabilityError,
} from "../cap-availability";
import { parseValidatedCapInputEffect } from "../cap-input";
import { jobAccessLostReasonEffect } from "../job-access";
import { settleJobEffect } from "../lifecycle/settle";
import { isSystemJobId } from "../system-jobs";
import { failJobEffect } from "./helpers";

export type PreflightState = {
  jobId: string;
  job: JobRow;
  /**
   * The Cap version stamped on the Job at claim (`jobs.cap_version`). Every cache read and write
   * of the Job uses it, so a Job that outlives a deploy never files its result under the new code.
   */
  capVersion: string;
  cap: CapabilityDef<z.ZodType>;
  policy: CapJobPolicy;
  input: JsonObject;
  reclaimArtifacts: JobArtifact[] | null;
  reclaimEvidenceIds: string[];
};

export type PreflightStopReason =
  | "not_found"
  | "cancelled"
  | "case_deleted"
  | "access_revoked"
  | "already_terminal"
  | "reclaim_converged"
  | "unknown_capability"
  | "invalid_input"
  | "egress_denied"
  | "breach_disabled"
  | "missing_credential"
  | "act_in_flight";

export type PreflightResult =
  | { kind: "stop"; reason: PreflightStopReason }
  | { kind: "ready"; state: PreflightState }
  /** A system Job (`jobs/system-jobs`): claimed, with no Cap, input schema or availability. */
  | { kind: "system"; jobId: string; job: JobRow };

type CapLoadResult =
  | { kind: "ready"; cap: CapabilityDef<z.ZodType> }
  | { kind: "stop"; reason: PreflightStopReason };

type CapInputResult =
  | { kind: "ready"; input: JsonObject }
  | { kind: "stop"; reason: PreflightStopReason };

function preflightEarlyStop(job: JobRow): PreflightStopReason | null {
  if (job.status === "cancelled") return "cancelled";
  if (!isLiveJobStatus(job.status)) {
    return "already_terminal";
  }
  return null;
}

function convergeReclaimStopEffect(
  jobId: string,
  job: JobRow
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* convergeReclaimStopGen() {
    const finishedAt = job.finishedAt ?? (yield* nowDateEffect);
    yield* settleJobEffect(
      { jobId, caseId: job.caseId },
      { kind: "succeed" },
      { finishedAt }
    );
  });
}

function loadCapOrStopEffect(
  jobId: string,
  capabilityId: string,
  caseId: CaseId
): Effect.Effect<CapLoadResult, DomainTag, Db> {
  return Effect.gen(function* loadCapOrStopGen() {
    const cap = yield* Effect.result(
      Effect.try({
        try: () => requireCapability(capabilityId),
        catch: (error) => new InvalidError({ reason: errorMessage(error) }),
      })
    );
    if (Result.isFailure(cap)) {
      yield* failJobEffect(jobId, cap.failure.message, {
        caseId,
        cause: "preflight_failed",
      });
      return { kind: "stop" as const, reason: "unknown_capability" as const };
    }
    return { kind: "ready" as const, cap: cap.success };
  });
}

function parseCapInputOrStopEffect(
  jobId: string,
  cap: CapabilityDef<z.ZodType>,
  rawInput: unknown,
  caseId: CaseId
): Effect.Effect<CapInputResult, DomainTag, Db> {
  return parseValidatedCapInputEffect(cap, rawInput).pipe(
    Effect.map((input) => ({ kind: "ready" as const, input })),
    Effect.catchTag("InvalidError", (error) =>
      failJobEffect(jobId, error.reason, {
        caseId,
        cause: "preflight_failed",
      }).pipe(
        Effect.as({ kind: "stop" as const, reason: "invalid_input" as const })
      )
    )
  );
}

function preflightStopReason(result: AvailabilityError): PreflightStopReason {
  switch (result.kind) {
    case "egress_blocked": {
      return "egress_denied";
    }
    case "breach_disabled": {
      return "breach_disabled";
    }
    case "missing_credential": {
      return "missing_credential";
    }
    default: {
      result satisfies never;
      return "missing_credential";
    }
  }
}

function enforceCapAvailabilityOrStopEffect(
  jobId: string,
  job: JobRow,
  cap: CapabilityDef<z.ZodType>,
  allowedEgress: readonly EgressClass[]
): Effect.Effect<
  { kind: "stop"; reason: PreflightStopReason } | { kind: "ready" },
  DomainTag,
  Db | Vault
> {
  return Effect.gen(function* enforceCapAvailabilityOrStopGen() {
    const { result } = yield* evaluateCapAvailabilityEffect({
      actorId: job.actorId,
      caseId: job.caseId,
      cap,
      allowedEgress,
    });
    if (result.ok) {
      return { kind: "ready" as const };
    }
    yield* failJobEffect(jobId, formatCapAvailabilityError(result, cap.id), {
      caseId: job.caseId,
      cause: "preflight_failed",
    });
    return {
      kind: "stop" as const,
      reason: preflightStopReason(result),
    };
  });
}

function preparePreflightReadyEffect(
  jobId: string,
  job: JobRow
): Effect.Effect<PreflightResult, DomainTag, Db | Vault> {
  return Effect.gen(function* preparePreflightReadyGen() {
    // A deleted (tombstoned) Case is invisible to its own work: cancel the Job instead of
    // running it. The same read supplies the Case's egress switch, so this adds no statement.
    const caseRow = yield* casesRepoFxDb.getByIdUnchecked(job.caseId);
    if (caseRow === null) {
      const finishedAt = yield* nowDateEffect;
      yield* settleJobEffect(
        { jobId, caseId: job.caseId },
        { kind: "cancel", cause: "case_deleted" },
        { finishedAt }
      );
      return { kind: "stop" as const, reason: "case_deleted" as const };
    }
    // Work stops when its author loses access: membership, ban and (for an API key) the key.
    const accessLost = yield* jobAccessLostReasonEffect(
      job,
      caseRow.organizationId
    );
    if (accessLost !== null) {
      const finishedAt = yield* nowDateEffect;
      yield* settleJobEffect(
        { jobId, caseId: job.caseId },
        { kind: "cancel", cause: "access_revoked" },
        { error: accessLost, finishedAt }
      );
      return { kind: "stop" as const, reason: "access_revoked" as const };
    }
    if (isSystemJobId(job.capabilityId)) {
      const claimed = yield* settleJobEffect(
        { jobId, caseId: job.caseId },
        { kind: "claim" },
        { startedAt: job.startedAt ?? (yield* nowDateEffect), logs: [] }
      );
      return claimed
        ? { kind: "system" as const, jobId, job }
        : { kind: "stop" as const, reason: "cancelled" as const };
    }
    const capOrStop = yield* loadCapOrStopEffect(
      jobId,
      job.capabilityId,
      job.caseId
    );
    if (capOrStop.kind === "stop") return capOrStop;
    const { cap } = capOrStop;
    const policy = cap.jobPolicy ?? {};

    // An act Cap changes something at a provider and runs at most once. A delivery that finds
    // its Job already running does nothing: the attempt that started it is live, or lost, and
    // reconcile fails a lost one (`ACT_LOST_MESSAGE`). Decided first, before input and
    // availability, so a redelivery can never end as another failure.
    const isAct = capLane(cap) === "act";
    if (isAct && job.status === "running") {
      return { kind: "stop" as const, reason: "act_in_flight" as const };
    }

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
      cap,
      caseRow.allowedEgress
    );
    if (availability.kind === "stop") return availability;

    const reclaimArtifacts =
      Array.isArray(job.output) && job.output.length > 0 ? job.output : null;
    const reclaimEvidenceIds = job.evidenceIds;
    const startedAt = job.startedAt ?? (yield* nowDateEffect);
    // Stamped at claim. A reclaim that reuses the earlier run's artifacts keeps the version
    // that run was claimed with; a run that starts over is the running code's.
    const capVersion =
      reclaimArtifacts !== null && job.capVersion !== null
        ? job.capVersion
        : stampedCapVersion(cap.id, breachCapsMode());

    const markedRunning = yield* settleJobEffect(
      { jobId, caseId: job.caseId },
      // An act Job starts from `queued` only, decided under the row lock: of two deliveries
      // one starts it and the other finds it running (`start` has no move from running).
      { kind: isAct ? "start" : "claim" },
      {
        startedAt,
        capVersion,
        ...(reclaimArtifacts ? {} : { logs: [] as string[] }),
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
        capVersion,
        cap,
        policy,
        input,
        reclaimArtifacts,
        reclaimEvidenceIds,
      },
    };
  });
}

/**
 * Load Job, cancel it when its creator lost access, validate Cap input, enforce egress + credentials, mark running.
 * Returns `stop` when the Job should not proceed (terminal / failed preflight).
 * Missing Job and unknown Capability resolve as `stop` (no throw) so pg-boss
 * does not retry those cases. DB errors stay in `E` as `DomainTag`.
 */
export function preflightEffect(
  jobId: string
): Effect.Effect<PreflightResult, DomainTag, Db | Vault> {
  return Effect.gen(function* preflightGen() {
    const normalizedJobId = parseTrimmedUuid(jobId) ?? undefined;
    if (normalizedJobId === undefined) {
      return { kind: "stop" as const, reason: "not_found" as const };
    }

    const job = yield* jobsRepoFxDb.get(normalizedJobId);
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
