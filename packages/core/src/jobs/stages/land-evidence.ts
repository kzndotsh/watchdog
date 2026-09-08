import { Effect } from "effect";

import { evidenceRepo, jobsRepo } from "@watchdog/db";
import { isJobInternalArtifact } from "@watchdog/schemas";

import { notifyEvidenceChangedEffect } from "../../infra/events";
import { tryDb } from "../../infra/postgres-effect";
import { transact } from "../../infra/postgres-tx";
import { InvalidError, type DomainTag } from "../../infra/tagged-errors";
import type { CollectResult } from "./collect";
import { inputGraphUuidStrict } from "./helpers";
import type { PreflightState } from "./preflight";

/**
 * Persist Cap artifacts as Evidence (skip Job-internal names) and link source dump.
 * Reclaim always reuses stored ids. Cache hits reuse ids when the source Job
 * still has them; otherwise land from cached artifacts (deleted Job / null ids).
 */
export function landEvidenceEffect(
  state: PreflightState,
  collected: CollectResult
): Effect.Effect<string[], DomainTag> {
  if (collected.reclaim) {
    return Effect.succeed(collected.evidenceIds);
  }
  if (collected.fromCache && collected.evidenceIds.length > 0) {
    return Effect.succeed(collected.evidenceIds);
  }

  const entityParsed = inputGraphUuidStrict(state.input, "entityId");
  if (entityParsed === null) {
    return new InvalidError({
      reason: "input.entityId must be a valid UUID",
    });
  }
  const entityId = entityParsed;

  return Effect.gen(function* landEvidenceGen() {
    const { evidenceIds, newEvidenceCount } = yield* transact((tx) =>
      Effect.gen(function* landEvidenceTx() {
        const landed: string[] = [];
        yield* Effect.forEach(
          collected.artifacts.filter((art) => !isJobInternalArtifact(art.name)),
          (art) =>
            tryDb(() =>
              evidenceRepo.create(tx, {
                caseId: state.job.caseId,
                entityId: entityId ?? null,
                kind:
                  art.mime?.startsWith("text/html") ||
                  art.mime === "application/pdf"
                    ? "url_archive"
                    : "file",
                label: art.name,
                mime: art.mime,
                uri: art.uri,
                sha256: art.sha256,
                actorId: state.job.actorId,
                actorLabel: state.job.actorLabel,
              })
            ).pipe(
              Effect.tap((row) =>
                Effect.sync(() => {
                  if (row) landed.push(row.id);
                })
              )
            ),
          { concurrency: 1 }
        );

        const linkedSource = collected.runtime.linkedSource;
        const jobEvidenceIds =
          linkedSource === undefined
            ? landed
            : [...new Set([...landed, linkedSource])];

        yield* tryDb(() =>
          jobsRepo.updateInCase(tx, state.job.caseId, state.jobId, {
            output: collected.artifacts,
            evidenceIds: jobEvidenceIds,
            logs: collected.runtime.jobLog.lines,
          })
        );

        return { evidenceIds: jobEvidenceIds, newEvidenceCount: landed.length };
      })
    );

    // Only new Evidence rows matter — linking source Evidence via linkedSource
    // updates Job.evidenceIds but does not change the Evidence table (Process
    // caps land internal artifacts only; markEvidenceProcessed fires separately).
    if (newEvidenceCount > 0) {
      yield* notifyEvidenceChangedEffect(state.job.caseId);
    }
    return evidenceIds;
  });
}
