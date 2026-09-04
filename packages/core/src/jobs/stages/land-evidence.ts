import { Effect } from "effect";

import { evidenceRepo, jobsRepo } from "@watchdog/db";
import { isJobInternalArtifact } from "@watchdog/schemas";

import { tryDb } from "../../infra/postgres-effect";
import { transact } from "../../infra/postgres-tx";
import type { DomainTag } from "../../infra/tagged-errors";
import type { CollectResult } from "./collect";
import { inputString } from "./helpers";
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

  const entityId = inputString(state.input, "entityId");

  return transact((tx) =>
    Effect.gen(function* landEvidenceTx() {
      const ids: string[] = [];
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
            })
          ).pipe(
            Effect.tap((row) =>
              Effect.sync(() => {
                if (row) ids.push(row.id);
              })
            )
          ),
        { concurrency: 1 }
      );

      const linkedSource = collected.runtime.linkedSource;
      const evidenceIds =
        linkedSource !== undefined && linkedSource !== ""
          ? [...new Set([...ids, linkedSource])]
          : ids;

      yield* tryDb(() =>
        jobsRepo.update(tx, state.jobId, {
          output: collected.artifacts,
          evidenceIds,
          logs: collected.runtime.jobLog.lines,
        })
      );

      return evidenceIds;
    })
  );
}
