import { logSwallowed } from "../infra/process-log";
import type { DomainTag } from "../infra/tagged-errors";

/**
 * A failed Job stores only `error.message` (client-visible). Keep the detail a
 * tag carries in `cause` (upstream, driver or model text) in the process log,
 * so a fixed safe message does not leave the failure undiagnosable.
 */
export function logJobFailureCause(jobId: string, error: DomainTag): void {
  if (
    (error._tag === "InvalidError" || error._tag === "InternalError") &&
    error.cause !== undefined
  ) {
    logSwallowed("job.failure_cause", error.cause, {
      jobId,
      domainTag: error._tag,
      reason: error.message,
    });
  }
}
