import { Effect } from "effect";

import { deleteObjectKeysEffect } from "../infra/blob";
import type { BlobStore } from "../infra/blob-store";
import { nowDateEffect } from "../infra/clock";
import type { Db } from "../infra/db-service";
import { transact } from "../infra/postgres-tx";
import {
  evidenceUploadsRepoFxDb,
  evidenceUploadsRepoFx,
} from "../infra/repos-fx";
import type { DomainTag } from "../infra/tagged-errors";

/**
 * How long a presigned upload may stay unconfirmed before its object is deleted. The presigned
 * URL itself lives 15 minutes; the rest is slack for a slow upload and a retried confirmation.
 */
export const UPLOAD_SWEEP_GRACE_MS = 24 * 60 * 60 * 1000;

/** Uploads one sweep run removes (one S3 batch delete); the rest wait for the next run. */
export const UPLOAD_SWEEP_BATCH = 500;

/** The store's batch-delete ceiling. */
const MAX_BATCH = 1000;

export type UploadSweepSummary = {
  /** Abandoned uploads whose object and record were removed. */
  swept: number;
};

/** The cutoff: an upload issued before it and still unconfirmed is abandoned. */
function abandonedBefore(now: Date, graceMs: number): Date {
  return new Date(now.getTime() - graceMs);
}

/**
 * The orphan sweep (#305): delete the object of every presigned upload still unconfirmed after
 * the grace window, then its record. It never touches a key that backs Evidence (hidden or not:
 * a repeat presign of an already recorded file leaves that file alone) or an upload confirmed or
 * re-presigned meanwhile (the rows are locked, not merely listed).
 *
 * Idempotent and bounded: at most {@link UPLOAD_SWEEP_BATCH} uploads per run, oldest first; the
 * object delete tolerates a key already gone; a failed delete rolls back, leaving the records, so
 * the next run retries them. Two runs at once are safe (`SKIP LOCKED`: each upload goes to one).
 */
export function sweepAbandonedUploadsEffect(opts?: {
  graceMs?: number;
  limit?: number;
}): Effect.Effect<UploadSweepSummary, DomainTag, Db | BlobStore> {
  return Effect.gen(function* sweepAbandonedUploadsGen() {
    const now = yield* nowDateEffect;
    const before = abandonedBefore(now, opts?.graceMs ?? UPLOAD_SWEEP_GRACE_MS);
    const limit = Math.min(opts?.limit ?? UPLOAD_SWEEP_BATCH, MAX_BATCH);
    // An unconfirmed record whose key already backs Evidence has no object to delete.
    yield* evidenceUploadsRepoFxDb.deleteSupersededByEvidence(before);
    // One transaction holds the rows locked while their objects go, so a confirmation racing the
    // sweep either wins the row (the sweep skips it) or is refused once the row is gone.
    return yield* transact((tx) =>
      Effect.gen(function* sweepAbandonedUploadsTx() {
        const abandoned = yield* evidenceUploadsRepoFx.lockAbandoned(
          tx,
          before,
          limit
        );
        if (abandoned.length === 0) return { swept: 0 };
        yield* deleteObjectKeysEffect(abandoned.map((upload) => upload.uri));
        const swept = yield* evidenceUploadsRepoFx.deleteByIds(
          tx,
          abandoned.map((upload) => upload.id)
        );
        return { swept };
      })
    );
  });
}
