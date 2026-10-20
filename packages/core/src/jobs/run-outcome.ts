import type { JobRow } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";

import type { JobAbortReason } from "./job-fibers";
import type { PreflightStopReason } from "./stages/preflight";

export type JobRunOutcomeName =
  | "succeeded"
  | "failed"
  | "cancelled"
  | "stopped";

export type JobRunOutcome = {
  outcome: JobRunOutcomeName;
  stopReason?: PreflightStopReason;
  abortReason?: JobAbortReason;
  fromCache?: boolean;
  reclaim?: boolean;
  durationMs: number;
  caseId?: CaseId;
  capabilityId?: string;
  playbookRunId?: string | null;
};

export function classifyRun(input: {
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
  // The body finished before an abort's interrupt landed: the Job succeeded, so
  // the stale reason is dropped (`executeJobOnMap` clears it on success).
  return { outcome: "succeeded" };
}

/** Effect 4: interrupted fibers exit as interrupt even if catchCause "recovers". */
export function jobOutcomeFromInterrupt(
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
export function outcomeFromStopStatus(
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
