import { db, jobsRepo, playbookRunsRepo, type JobRow } from "@watchdog/db";

import { errorMessage } from "../infra/domain-error";
import { logSwallowed } from "../infra/process-log";
import { storeCacheStage } from "./stages/cache";
import { advancePlaybookRun } from "./stages/chain";
import type { CollectResult } from "./stages/collect";
import { failJob, type createJobLog } from "./stages/helpers";
import type { PreflightState } from "./stages/preflight";

function logPlaybookAdvanceFailure(
  advanceError: unknown,
  opts: {
    jobId: string;
    caseId: string;
    playbookRunId: string | null;
    jobLog: ReturnType<typeof createJobLog>;
  }
): Promise<void> {
  const { jobId, caseId, playbookRunId, jobLog } = opts;
  const msg =
    advanceError instanceof Error ? advanceError.message : String(advanceError);
  jobLog.log(`playbook advance failed: ${msg}`);
  return jobsRepo
    .update(db, jobId, { logs: jobLog.lines })
    .catch((persistError: unknown) => {
      logSwallowed("playbook.advance_log", persistError, { jobId });
    })
    .then(() => {
      logSwallowed("playbook.advance", advanceError, {
        jobId,
        caseId,
        playbookRunId,
      });
    });
}

export function runSucceededPath(opts: {
  jobId: string;
  state: PreflightState;
  collected: CollectResult;
  resultSummary: string | null;
  interpretError: string | null;
  jobLog: ReturnType<typeof createJobLog>;
}): Promise<void> {
  const { jobId, state, collected, resultSummary, interpretError, jobLog } =
    opts;

  return storeCacheStage({
    state,
    runtime: collected.runtime,
    artifacts: collected.artifacts,
    resultSummary,
    fromCache: collected.fromCache,
    reclaim: collected.reclaim,
    interpretError,
  }).then(() => {
    const playbookRunId = state.job.playbookRunId;
    if (playbookRunId === null) return;
    return advancePlaybookRun({
      caseId: state.job.caseId,
      playbookRunId,
    })
      .catch((advanceError: unknown) =>
        logPlaybookAdvanceFailure(advanceError, {
          jobId,
          caseId: state.job.caseId,
          playbookRunId,
          jobLog,
        }).then(() =>
          playbookRunsRepo
            .setStatus(db, playbookRunId, "cancelled", new Date(), {
              onlyStatuses: ["running"],
            })
            .catch((cancelError: unknown) => {
              logSwallowed("playbook.advance_cancel", cancelError, {
                jobId,
                playbookRunId,
              });
            })
        )
      )
      .then(() => {});
  });
}

export function runFailedPath(opts: {
  jobId: string;
  error: unknown;
  jobLog: ReturnType<typeof createJobLog>;
  playbookRunId: JobRow["playbookRunId"];
  caseId?: string;
}): Promise<void> {
  const { jobId, error, jobLog, playbookRunId, caseId } = opts;
  const msg = errorMessage(error);
  jobLog.log(`run failed: ${msg}`);
  return failJob(jobId, msg, jobLog.lines).then(() => {
    if (playbookRunId === null) return;
    return advancePlaybookRun({ playbookRunId, caseId }).catch(
      (advanceError: unknown) => {
        logSwallowed("playbook.abandon", advanceError, {
          jobId,
          playbookRunId,
        });
      }
    );
  });
}
