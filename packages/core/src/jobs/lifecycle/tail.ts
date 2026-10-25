import { Cause, Effect } from "effect";

import { requireCapability } from "@watchdog/caps";
import type { JobRow } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";

import type { Db } from "../../infra/db-service";
import { errorMessage } from "../../infra/error-utils";
import { logSwallowed } from "../../infra/process-log";
import { InvalidError } from "../../infra/tagged-errors";
import { capCacheKey, type CapCacheKey } from "../cap-cache";
import { parseValidatedCapInputEffect } from "../cap-input";
import { createJobLog } from "../job-log";
import type { JobQueue } from "../job-queue";
import { storeCacheStageEffect } from "../stages/cache";
import { advancePlaybookRunEffect } from "../stages/chain";
import { stampSourceEvidenceEffect } from "../stages/finish";
import type { PreflightState } from "../stages/preflight";

/**
 * What every terminal Job transition does once its status write has committed: let the
 * Playbook run it belongs to react (start the next step, or finish the run). The run reads the
 * Job statuses itself, so calling it again is harmless. A failure here never undoes the
 * Job's status: it is logged and the stuck-run reconcile picks the run up later.
 */
export function advancePlaybookTailEffect(job: {
  readonly jobId: string;
  readonly caseId: CaseId;
  readonly playbookRunId: string | null;
}): Effect.Effect<void, never, Db | JobQueue> {
  const { jobId, caseId, playbookRunId } = job;
  if (playbookRunId === null) return Effect.void;
  return advancePlaybookRunEffect({ playbookRunId, caseId }).pipe(
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        logSwallowed("playbook.advance", Cause.squash(cause), {
          jobId,
          caseId,
          playbookRunId,
        });
      })
    )
  );
}

/** Cache a finished Job's artifacts under the Cap's cache key, if its Cap caches. */
export function cacheSuccessTailEffect(input: {
  readonly state: PreflightState;
  readonly jobLog: ReturnType<typeof createJobLog>;
  readonly key: CapCacheKey | null;
  readonly artifacts: NonNullable<JobRow["output"]>;
  readonly resultSummary: string | null;
  readonly fromCache: boolean;
  readonly interpretError: string | null;
}): Effect.Effect<void, never, Db> {
  const { state, jobLog, key } = input;
  return storeCacheStageEffect({
    state,
    runtime: {
      cacheTtlMs: key?.ttlMs ?? null,
      inputHash: key?.inputHash ?? null,
      jobLog,
    },
    artifacts: input.artifacts,
    resultSummary: input.resultSummary,
    fromCache: input.fromCache,
    interpretError: input.interpretError,
  }).pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        logSwallowed("job.cache_store", error, { jobId: state.jobId });
      })
    )
  );
}

/**
 * The success tail of a Job that a dead worker had already finished the work of
 * (`reclaim_converged`: a Proposal exists, only the status was missing). The preflight settled it
 * `succeeded`; this does what a normal success does after that: cache the artifacts the stored
 * run left and stamp the source Evidence. There is no run in hand, so it rebuilds the Job's
 * context from the row. The cache write uses the version the Job row was claimed with, never
 * the running code version (a deploy may have changed it); a row with none is not cached.
 * Best effort, like the normal tail.
 */
export function reclaimedSuccessTailEffect(
  row: JobRow
): Effect.Effect<void, never, Db> {
  return Effect.gen(function* reclaimedSuccessTailGen() {
    const cap = yield* Effect.try({
      try: () => requireCapability(row.capabilityId),
      catch: (error) => new InvalidError({ reason: errorMessage(error) }),
    });
    const input = yield* parseValidatedCapInputEffect(cap, row.input);
    const policy = cap.jobPolicy ?? {};
    const artifacts = row.output ?? [];
    const capVersion = row.capVersion;
    const state: PreflightState = {
      jobId: row.id,
      job: row,
      capVersion: capVersion ?? "",
      cap,
      policy,
      input,
      allowThirdPartyEgress: false,
      reclaimArtifacts: artifacts.length > 0 ? artifacts : null,
      reclaimEvidenceIds: row.evidenceIds,
    };
    const jobLog = createJobLog();
    yield* cacheSuccessTailEffect({
      state,
      jobLog,
      key: capVersion === null ? null : capCacheKey(cap, policy, input),
      artifacts,
      resultSummary: row.resultSummary,
      fromCache: row.fromCache || row.cacheSourceJobId !== null,
      interpretError: row.interpretError,
    });
    yield* stampSourceEvidenceEffect({
      state,
      jobLog,
      proposalId: row.proposalId,
      interpretError: row.interpretError,
      markSourceProcessed: undefined,
    });
  }).pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        logSwallowed("job.reclaim_success_tail", error, { jobId: row.id });
      })
    )
  );
}
