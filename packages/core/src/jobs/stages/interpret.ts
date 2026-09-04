import { Effect, Result } from "effect";

import type { JobArtifact, JobHandoff } from "@watchdog/db";
import type { PatchOp } from "@watchdog/schemas";

import { tryParsePatch } from "../../graph/patch/patch";
import { readArtifactBytesEffect } from "../../infra/blob";
import { errorMessage } from "../../infra/domain-error";
import {
  domainMessageOf,
  InvalidError,
  isDomainTag,
} from "../../infra/tagged-errors";
import { loadCapReportEffect } from "../load-cap-report";
import type { CollectRuntime } from "./collect";
import type { JobLog } from "./helpers";
import type { PreflightState } from "./preflight";

export interface InterpretStageResult {
  resultSummary: string | null;
  markSourceProcessed: boolean | undefined;
  interpretError: string | null;
  /** Valid patch ops ready for suppress/propose; empty if none / error. */
  patch: PatchOp[];
  handoff?: JobHandoff;
}

interface InterpretExistingState {
  proposalId: string | null;
  resultSummary: string | null;
}

/**
 * Load Cap report and run pure interpret → parse PatchOp[].
 * Handoff is computed here but persisted on the success write.
 * Interpret failures are data (`interpretError`), not Effect failures.
 */
export function interpretStageEffect(
  state: PreflightState,
  artifacts: JobArtifact[],
  runtime: CollectRuntime,
  existing: InterpretExistingState
): Effect.Effect<InterpretStageResult> {
  return Effect.gen(function* interpretStageGen() {
    let resultSummary = existing.resultSummary;
    let markSourceProcessed: boolean | undefined;
    let interpretError: string | null = null;
    let patch: PatchOp[] = [];
    let handoff: JobHandoff | undefined;

    const interpretFn = state.cap.interpret;
    const skipInterpret = existing.proposalId !== null || !interpretFn;
    const needsReport = state.cap.handoff !== undefined || !skipInterpret;

    if (!needsReport) {
      return {
        resultSummary,
        markSourceProcessed,
        interpretError,
        patch,
      };
    }

    const outcome = yield* Effect.result(
      Effect.gen(function* interpretReportGen() {
        const loaded = yield* loadCapReportEffect(
          artifacts,
          readArtifactBytesEffect
        );
        if (loaded && state.cap.handoff) {
          handoff = state.cap.handoff(loaded.report);
        }
        if (skipInterpret || interpretFn === undefined) {
          return {
            resultSummary,
            markSourceProcessed,
            interpretError,
            patch,
            handoff,
          } satisfies InterpretStageResult;
        }
        if (!loaded) {
          return yield* new InvalidError({
            reason: "No report.json artifact to interpret",
          });
        }
        const interpreted = yield* Effect.try({
          try: () =>
            interpretFn(loaded.report, {
              input: state.input,
              ...(runtime.evidenceSnapshot?.entityId !== undefined &&
              runtime.evidenceSnapshot.entityId !== ""
                ? { snapshotEntityId: runtime.evidenceSnapshot.entityId }
                : {}),
              ...(runtime.evidenceSnapshot
                ? { snapshotTextChars: runtime.evidenceSnapshot.text.length }
                : {}),
            }),
          catch: (error) =>
            new InvalidError({
              reason:
                error instanceof Error ? error.message : errorMessage(error),
            }),
        });
        resultSummary = interpreted.summary ?? null;
        markSourceProcessed = interpreted.markSourceProcessed;
        const parsedPatch = tryParsePatch(interpreted.patch);
        if (parsedPatch.ok) {
          patch = parsedPatch.patch;
        } else {
          interpretError = `interpret patch invalid: ${parsedPatch.error}`;
        }
        return {
          resultSummary,
          markSourceProcessed,
          interpretError,
          patch,
          handoff,
        } satisfies InterpretStageResult;
      })
    );

    if (Result.isFailure(outcome)) {
      return {
        resultSummary,
        markSourceProcessed,
        interpretError: isDomainTag(outcome.failure)
          ? domainMessageOf(outcome.failure)
          : errorMessage(outcome.failure),
        patch,
        handoff,
      };
    }
    return outcome.success;
  });
}

export function logInterpretFailure(
  jobLog: JobLog,
  interpretError: string,
  resultSummary: string | null
): string | null {
  jobLog.log(`interpret failed: ${interpretError}`);
  return (
    resultSummary ??
    "Evidence captured; interpretation failed — no Proposal created"
  );
}
