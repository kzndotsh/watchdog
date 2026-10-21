import type { JobRow } from "@watchdog/db";
import type { CaseId, JobStopCause } from "@watchdog/schemas/shared";

import type { PreflightStopReason } from "./stages/preflight";

export type JobRunOutcomeName =
  | "succeeded"
  | "failed"
  | "cancelled"
  | "stopped";

export type JobRunOutcome = {
  outcome: JobRunOutcomeName;
  stopReason?: PreflightStopReason;
  /** The cause recorded when the attempt was stopped (interrupt, timeout, failure). */
  stopCause?: JobStopCause;
  fromCache?: boolean;
  reclaim?: boolean;
  durationMs: number;
  caseId?: CaseId;
  capabilityId?: string;
  playbookRunId?: string | null;
};

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
    case undefined: {
      return "stopped";
    }
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
