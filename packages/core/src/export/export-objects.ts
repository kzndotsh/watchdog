import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Effect } from "effect";

import type { CaseId } from "@watchdog/schemas/shared";

import { CASE_EXPORT_PREFIX, deleteObjectKeysEffect } from "../infra/blob";
import { BlobStore } from "../infra/blob-store";
import { nowMillisEffect } from "../infra/clock";
import { InvalidError } from "../infra/tagged-errors";
import { caseExportSettings, type CaseExportSettings } from "./settings";

/** The object key of a Case export archive: one per Job, so a retry overwrites its own. */
export function caseExportObjectKey(caseId: CaseId, jobId: string): string {
  return `${CASE_EXPORT_PREFIX}${caseId}/${jobId}.zip`;
}

/** Most keys one listing page returns, and so the most one delete call takes. */
const SWEEP_PAGE = 1000;

function listArchivesPage(token: string | undefined) {
  return Effect.gen(function* listArchivesPageGen() {
    const { client, bucket } = yield* BlobStore;
    return yield* Effect.tryPromise({
      try: () =>
        client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: CASE_EXPORT_PREFIX,
            MaxKeys: SWEEP_PAGE,
            ContinuationToken: token,
          })
        ),
      catch: (cause) =>
        new InvalidError({
          reason: `Couldn't list export archives: ${String(cause)}`,
        }),
    });
  });
}

/**
 * Delete the stored export archives whose link has expired: every object under `exports/`
 * written more than the link lifetime ago. The age is the object's own, so it needs no Job
 * lookup and a repeat is harmless. Returns how many were deleted.
 */
export function sweepExpiredCaseExportsEffect(
  settings: CaseExportSettings = caseExportSettings()
): Effect.Effect<number, InvalidError, BlobStore> {
  return Effect.gen(function* sweepExpiredCaseExportsGen() {
    const cutoff = (yield* nowMillisEffect) - settings.linkTtlMs;
    let swept = 0;
    let token: string | undefined;
    do {
      const listed = yield* listArchivesPage(token);
      const expired = (listed.Contents ?? []).flatMap((object) =>
        object.Key !== undefined &&
        object.LastModified !== undefined &&
        object.LastModified.getTime() < cutoff
          ? [object.Key]
          : []
      );
      yield* deleteObjectKeysEffect(expired);
      swept += expired.length;
      token =
        listed.IsTruncated === true ? listed.NextContinuationToken : undefined;
    } while (token !== undefined);
    return swept;
  });
}
