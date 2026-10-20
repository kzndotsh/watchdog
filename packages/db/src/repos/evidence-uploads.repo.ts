import {
  and,
  asc,
  eq,
  exists,
  inArray,
  isNull,
  lt,
  notExists,
} from "drizzle-orm";

import type { CaseId } from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { evidence } from "../schema/evidence";
import { evidenceUploads } from "../schema/evidence-uploads";
import { trimCaseId } from "./_scoped-ids";

export type EvidenceUploadRow = typeof evidenceUploads.$inferSelect;

export type NewEvidenceUpload = {
  caseId: CaseId;
  uri: string;
  declaredSha256: string;
  declaredMime: string;
  declaredByteLength: number;
  actorId: string;
};

/** An upload nobody confirmed within the window: what the sweep deletes. */
export type AbandonedUpload = { id: string; caseId: CaseId; uri: string };

/**
 * Unconfirmed, issued before `before`, and no Evidence row (hidden or not) holds the key: a
 * repeat presign of a file already recorded as Evidence must never cost that Evidence its object.
 */
function holdsEvidence(exec: DbExec) {
  return exec
    .select({ id: evidence.id })
    .from(evidence)
    .where(
      and(
        eq(evidence.caseId, evidenceUploads.caseId),
        eq(evidence.uri, evidenceUploads.uri)
      )
    );
}

function unconfirmedBefore(before: Date) {
  return and(
    isNull(evidenceUploads.confirmedAt),
    lt(evidenceUploads.createdAt, before)
  );
}

function abandonedFilter(exec: DbExec, before: Date) {
  return and(unconfirmedBefore(before), notExists(holdsEvidence(exec)));
}

export const evidenceUploadsRepo = {
  /** Record (or refresh) the presign of one object key; the window restarts and a past confirmation clears. */
  async upsertPresigned(
    exec: DbExec,
    values: NewEvidenceUpload
  ): Promise<EvidenceUploadRow | null> {
    const caseId = trimCaseId(values.caseId);
    if (caseId === undefined) return null;
    const [row] = await exec
      .insert(evidenceUploads)
      .values({ ...values, caseId })
      .onConflictDoUpdate({
        target: [evidenceUploads.caseId, evidenceUploads.uri],
        set: {
          declaredSha256: values.declaredSha256,
          declaredMime: values.declaredMime,
          declaredByteLength: values.declaredByteLength,
          actorId: values.actorId,
          createdAt: new Date(),
          confirmedAt: null,
        },
      })
      .returning();
    return row ?? null;
  },

  async getByUri(
    exec: DbExec,
    caseId: CaseId,
    uri: string
  ): Promise<EvidenceUploadRow | null> {
    const scoped = trimCaseId(caseId);
    if (scoped === undefined) return null;
    const [row] = await exec
      .select()
      .from(evidenceUploads)
      .where(
        and(eq(evidenceUploads.caseId, scoped), eq(evidenceUploads.uri, uri))
      )
      .limit(1);
    return row ?? null;
  },

  /** Mark the presign confirmed; null when the row is gone. */
  async markConfirmed(
    exec: DbExec,
    caseId: CaseId,
    uri: string,
    at: Date
  ): Promise<EvidenceUploadRow | null> {
    const scoped = trimCaseId(caseId);
    if (scoped === undefined) return null;
    const [row] = await exec
      .update(evidenceUploads)
      .set({ confirmedAt: at })
      .where(
        and(eq(evidenceUploads.caseId, scoped), eq(evidenceUploads.uri, uri))
      )
      .returning();
    return row ?? null;
  },

  /**
   * Lock the oldest abandoned uploads, at most `limit` (`FOR UPDATE SKIP LOCKED`, so a second
   * sweep moves on and a confirmation in flight is skipped). The caller holds the transaction
   * open while it deletes the objects: a confirmation that arrives meanwhile waits on the row,
   * then finds it gone and is refused instead of recording Evidence whose object was just removed.
   */
  async lockAbandoned(
    exec: DbExec,
    before: Date,
    limit: number
  ): Promise<AbandonedUpload[]> {
    return exec
      .select({
        id: evidenceUploads.id,
        caseId: evidenceUploads.caseId,
        uri: evidenceUploads.uri,
      })
      .from(evidenceUploads)
      .where(abandonedFilter(exec, before))
      .orderBy(asc(evidenceUploads.createdAt), asc(evidenceUploads.id))
      .limit(limit)
      .for("update", { of: evidenceUploads, skipLocked: true });
  },

  /** Delete the rows of uploads {@link evidenceUploadsRepo.lockAbandoned} returned. */
  async deleteByIds(exec: DbExec, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const deleted = await exec
      .delete(evidenceUploads)
      .where(inArray(evidenceUploads.id, ids))
      .returning({ id: evidenceUploads.id });
    return deleted.length;
  },

  /**
   * Drop the rows of unconfirmed uploads whose key already backs Evidence: nothing to delete from
   * the store, and the row must not wait forever.
   */
  async deleteSupersededByEvidence(
    exec: DbExec,
    before: Date
  ): Promise<number> {
    const deleted = await exec
      .delete(evidenceUploads)
      .where(and(unconfirmedBefore(before), exists(holdsEvidence(exec))))
      .returning({ id: evidenceUploads.id });
    return deleted.length;
  },
};
