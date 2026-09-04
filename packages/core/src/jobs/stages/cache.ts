import { Effect } from "effect";

import type { JobArtifact } from "@watchdog/db";

import type { DomainTag } from "../../infra/tagged-errors";
import { storeCapCacheEffect } from "../cap-cache";
import type { CollectRuntime } from "./collect";
import type { PreflightState } from "./preflight";

interface StoreCacheStageInput {
  state: PreflightState;
  runtime: CollectRuntime;
  artifacts: JobArtifact[];
  resultSummary: string | null;
  fromCache: boolean;
  reclaim: boolean;
  interpretError: string | null;
}

export function storeCacheStageEffect(
  input: StoreCacheStageInput
): Effect.Effect<void, DomainTag> {
  const { runtime, state } = input;
  const cacheTtlMs = runtime.cacheTtlMs;
  const inputHash = runtime.inputHash;
  if (
    cacheTtlMs === null ||
    inputHash === null ||
    input.fromCache ||
    input.reclaim ||
    input.interpretError !== null
  ) {
    return Effect.void;
  }

  return storeCapCacheEffect({
    caseId: state.job.caseId,
    capabilityId: state.cap.id,
    inputHash,
    jobId: state.jobId,
    artifacts: input.artifacts,
    resultSummary: input.resultSummary,
    ttlMs: cacheTtlMs,
  }).pipe(
    Effect.tap(() =>
      Effect.sync(() => {
        runtime.jobLog.log(`cache stored (ttl=${cacheTtlMs}ms)`);
      })
    )
  );
}
