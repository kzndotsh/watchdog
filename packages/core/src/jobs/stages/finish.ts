import { Effect } from "effect";

import type { JobHandoff } from "@watchdog/db";

import { markEvidenceProcessedEffect } from "../../evidence/process-evidence";
import { notifyProposalCreatedEffect } from "../../infra/events";
import type { DomainTag } from "../../infra/tagged-errors";
import { setJobStatusEffect } from "../set-job-status";
import { inputString, type JobLog } from "./helpers";
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
 * Persist terminal Job outcome (succeeded write, or skip if cancelled),
 * notify, optionally stamp source Evidence processed.
 */
export function finishEffect(
  input: FinishInput
): Effect.Effect<"succeeded" | "cancelled", DomainTag> {
  return Effect.gen(function* finishGen() {
    const { state, jobLog } = input;

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
        finishedAt: new Date(),
        ...(input.handoff ? { handoff: input.handoff } : {}),
      },
      { unlessCancelled: true, notify: true, caseId: state.job.caseId }
    );

    if (!finished) {
      yield* Effect.sync(() => {
        jobLog.log("job was cancelled — skipping succeeded write");
      });
      return "cancelled" as const;
    }

    if (input.proposalId !== null && input.interpretError === null) {
      const proposalId = input.proposalId;
      yield* notifyProposalCreatedEffect(state.job.caseId, proposalId);
    }

    if (
      state.policy.markEvidenceProcessed === true &&
      input.interpretError === null
    ) {
      const shouldMark =
        input.markSourceProcessed === true ||
        (input.markSourceProcessed === undefined && Boolean(input.proposalId));
      const evidenceId = inputString(state.input, "evidenceId");
      if (shouldMark && evidenceId !== undefined && evidenceId !== "") {
        yield* markEvidenceProcessedEffect({
          caseId: state.job.caseId,
          evidenceId,
        });
      }
    }

    return "succeeded" as const;
  });
}
