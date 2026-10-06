import { Effect } from "effect";

import type { JobHandoff } from "@watchdog/schemas/shared";

import { markEvidenceProcessedEffect } from "../../evidence/process-evidence";
import { nowDateEffect } from "../../infra/clock";
import type { Db } from "../../infra/db-service";
import type { DomainTag } from "../../infra/tagged-errors";
import { setJobStatusEffect } from "../set-job-status";
import { linkedEvidenceIdStrict, type JobLog } from "./helpers";
import type { PreflightState } from "./preflight";

interface FinishInput {
  state: PreflightState;
  jobLog: JobLog;
  proposalId: string | null;
  resultSummary: string | null;
  fromCache: boolean;
  suppressedCount: number;
  interpretError: string | null;
  markSourceProcessed: boolean | undefined;
  handoff?: JobHandoff;
}

/**
 * Persist terminal Job outcome (succeeded write plus its activity entry, or
 * skip if cancelled), optionally stamp source Evidence processed. The Job's
 * `succeeded` entry commits with the status write, so a client may refetch
 * before `processedAt` lands; the Evidence stamp notifies on its own.
 */
export function finishEffect(
  input: FinishInput
): Effect.Effect<"succeeded" | "cancelled", DomainTag, Db> {
  return Effect.gen(function* finishGen() {
    const { state, jobLog } = input;
    const finishedAt = yield* nowDateEffect;

    const finished = yield* setJobStatusEffect(
      state.jobId,
      {
        status: "succeeded",
        proposalId: input.proposalId,
        resultSummary: input.resultSummary,
        fromCache: input.fromCache,
        suppressedCount: input.suppressedCount,
        error: null,
        interpretError: input.interpretError,
        logs: jobLog.lines,
        finishedAt,
        ...(input.handoff ? { handoff: input.handoff } : {}),
      },
      { unlessCancelled: true, caseId: state.job.caseId }
    );

    if (!finished) {
      yield* Effect.sync(() => {
        jobLog.log("job was cancelled — skipping succeeded write");
      });
      return "cancelled" as const;
    }

    if (
      state.policy.markEvidenceProcessed === true &&
      input.interpretError === null
    ) {
      const shouldMark =
        input.markSourceProcessed === true ||
        (input.markSourceProcessed === undefined && Boolean(input.proposalId));
      const evidenceId = linkedEvidenceIdStrict(
        state.input,
        state.policy.linkEvidenceFromInput ?? ["evidenceId"]
      );
      if (shouldMark && evidenceId === null) {
        yield* Effect.sync(() => {
          jobLog.log(
            "skipped mark processed: linked evidence id is not a valid UUID"
          );
        });
      }
      if (shouldMark && evidenceId !== undefined && evidenceId !== null) {
        yield* markEvidenceProcessedEffect({
          caseId: state.job.caseId,
          evidenceId,
        });
      }
    }

    return "succeeded" as const;
  });
}
