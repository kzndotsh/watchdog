import { Effect } from "effect";

import type { JobHandoff } from "@watchdog/db";

import { markEvidenceProcessedEffect } from "../../evidence/process-evidence";
import { nowDateEffect } from "../../infra/clock";
import {
  notifyJobUpdateEffect,
  notifyProposalCreatedEffect,
} from "../../infra/events";
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
 * Persist terminal Job outcome (succeeded write, or skip if cancelled),
 * notify, optionally stamp source Evidence processed.
 */
export function finishEffect(
  input: FinishInput
): Effect.Effect<"succeeded" | "cancelled", DomainTag> {
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
      { unlessCancelled: true, notify: false, caseId: state.job.caseId }
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

    // SSE after DB writes so clients refetch committed state (processedAt included).
    yield* notifyJobUpdateEffect(state.job.caseId, state.jobId, "succeeded");

    if (input.proposalId !== null && input.interpretError === null) {
      const proposalId = input.proposalId;
      yield* notifyProposalCreatedEffect(state.job.caseId, proposalId);
    }

    return "succeeded" as const;
  });
}
