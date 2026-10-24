import { HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Effect } from "effect";

import type { CaseId } from "@watchdog/schemas/shared";

import { CASE_EXPORT_PREFIX, deleteObjectKeysEffect } from "../infra/blob";
import { BlobStore } from "../infra/blob-store";
import { nowMillisEffect } from "../infra/clock";
import { InternalError } from "../infra/tagged-errors";
import { caseExportSettings, type CaseExportSettings } from "./settings";

/** The object key of a Case export archive: one per Job, so a retry overwrites its own. */
export function caseExportObjectKey(caseId: CaseId, jobId: string): string {
  return `${CASE_EXPORT_PREFIX}${caseId}/${jobId}.zip`;
}

/**
 * The one expiry rule for an archive: its link lifetime counts from the moment the object was
 * stored (its own `LastModified`). The download link and the sweep both ask this, so a link never
 * answers for a file the sweep has deleted, nor the other way round.
 */
export function archiveExpiresAtMs(
  lastModified: Date,
  settings: CaseExportSettings
): number {
  return lastModified.getTime() + settings.linkTtlMs;
}

export function isArchiveExpired(
  lastModified: Date,
  settings: CaseExportSettings,
  nowMs: number
): boolean {
  return nowMs >= archiveExpiresAtMs(lastModified, settings);
}

/** When the archive was stored, or null when it is not there (swept, or never finished). */
export function archiveStoredAtEffect(
  key: string
): Effect.Effect<Date | null, InternalError, BlobStore> {
  return Effect.gen(function* archiveStoredAtGen() {
    const { client, bucket } = yield* BlobStore;
    return yield* Effect.tryPromise({
      try: async () => {
        try {
          const head = await client.send(
            new HeadObjectCommand({ Bucket: bucket, Key: key })
          );
          return head.LastModified ?? null;
        } catch (error) {
          if (
            error instanceof Error &&
            (error.name === "NotFound" || error.name === "NoSuchKey")
          ) {
            return null;
          }
          throw error;
        }
      },
      catch: (cause) =>
        new InternalError({
          reason: "Couldn't read the export archive",
          cause,
        }),
    });
  });
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
        new InternalError({
          reason: "Failed to list export archives",
          cause,
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
): Effect.Effect<number, InternalError, BlobStore> {
  return Effect.gen(function* sweepExpiredCaseExportsGen() {
    const now = yield* nowMillisEffect;
    let swept = 0;
    let token: string | undefined;
    do {
      const listed = yield* listArchivesPage(token);
      const expired = (listed.Contents ?? []).flatMap((object) =>
        object.Key !== undefined &&
        object.LastModified !== undefined &&
        isArchiveExpired(object.LastModified, settings, now)
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
