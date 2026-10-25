import { Effect } from "effect";

import { isJobInternalArtifact } from "@watchdog/schemas/jobs";

import { createCapturedEvidenceEffect } from "../../evidence/evidence-activity";
import type { Db } from "../../infra/db-service";
import { transact } from "../../infra/postgres-tx";
import { jobsRepoFx, providerCallsRepoFx } from "../../infra/repos-fx";
import { InvalidError, type DomainTag } from "../../infra/tagged-errors";
import type { CollectResult } from "./collect";
import { inputGraphUuidStrict } from "./helpers";
import type { PreflightState } from "./preflight";

/**
 * Persist Cap artifacts as Evidence (skip Job-internal names) and link source dump.
 * Reclaim always reuses stored ids. Cache hits reuse ids when the source Job
 * still has them; otherwise land from cached artifacts (deleted Job / null ids).
 * Each new Evidence row is linked, in the same transaction, to the provider calls of the run
 * that produced it (for a cache hit, the run the cache came from); reused Evidence keeps the
 * links it already has.
 */
export function landEvidenceEffect(
  state: PreflightState,
  collected: CollectResult
): Effect.Effect<string[], DomainTag, Db> {
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
    return yield* transact((tx) =>
      Effect.gen(function* landEvidenceTx() {
        const landed: string[] = [];
        yield* Effect.forEach(
          collected.artifacts.filter((art) => !isJobInternalArtifact(art.name)),
          (art) =>
            createCapturedEvidenceEffect(tx, state.job.caseId, {
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
            }).pipe(
              Effect.tap((row) =>
                Effect.sync(() => {
                  landed.push(row.id);
                })
              )
            ),
          { concurrency: 1 }
        );

        // The calls behind the new Evidence: this run's, or for a cache hit the run it came
        // from. Source Evidence a Process Cap only read is not produced by these calls.
        const callIds =
          collected.fromCache && collected.cacheSourceJobId !== null
            ? yield* providerCallsRepoFx.listIdsForJob(
                tx,
                state.job.caseId,
                collected.cacheSourceJobId
              )
            : collected.providerCallIds;
        yield* providerCallsRepoFx.linkEvidence(
          tx,
          state.job.caseId,
          landed,
          callIds
        );

        const linkedSource = collected.runtime.linkedSource;
        const jobEvidenceIds =
          linkedSource === undefined
            ? landed
            : [...new Set([...landed, linkedSource])];

        yield* jobsRepoFx.updateInCase(tx, state.job.caseId, state.jobId, {
          output: collected.artifacts,
          evidenceIds: jobEvidenceIds,
          logs: collected.runtime.jobLog.lines,
        });

        // Each new Evidence row appended its own entry above. Linking source
        // Evidence via linkedSource updates Job.evidenceIds but not the Evidence
        // table (Process caps land internal artifacts only; markEvidenceProcessed
        // logs separately).
        return jobEvidenceIds;
      })
    );
  });
}
